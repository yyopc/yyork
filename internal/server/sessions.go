package server

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/yyovil/yyork/internal/control"
	"github.com/yyovil/yyork/internal/events"
	"github.com/yyovil/yyork/internal/store"
)

// sessionDTO is the JSON shape /api/sessions returns. It mirrors
// store.Session but with explicit JSON tags and ISO-8601 timestamps so the
// dashboard doesn't need to format Unix epochs.
type sessionDTO struct {
	ID            string         `json:"id"`
	ProjectPath   string         `json:"projectPath"`
	ProjectName   string         `json:"projectName"`
	AgentPlugin   string         `json:"agentPlugin"`
	WorkspacePath string         `json:"workspacePath"`
	ZellijSession string         `json:"zellijSession"`
	PID           int64          `json:"pid,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
}

func toSessionDTO(s store.Session) sessionDTO {
	return sessionDTO{
		ID:            s.ID,
		ProjectPath:   s.ProjectPath,
		ProjectName:   s.ProjectName,
		AgentPlugin:   s.AgentPlugin,
		WorkspacePath: s.WorkspacePath,
		ZellijSession: s.ZellijSession,
		PID:           s.PID,
		Metadata:      s.Metadata,
		CreatedAt:     s.CreatedAt,
		UpdatedAt:     s.UpdatedAt,
	}
}

// handleStopSession terminates the session identified by the {sessionID}
// path parameter. It calls the engine's Stop method, which kills the
// zellij session, removes the worktree, deletes the store row, and
// publishes a session.terminated event — so the dashboard's SSE stream
// automatically refreshes.
func (s *Server) handleStopSession(w http.ResponseWriter, r *http.Request) {
	if s.stopper == nil {
		http.Error(w, "session stop not available", http.StatusNotImplemented)
		return
	}

	sessionID := r.PathValue("sessionID")
	if sessionID == "" {
		http.Error(w, "session id is required", http.StatusBadRequest)
		return
	}

	if err := s.stopper.Stop(r.Context(), sessionID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleListSessions returns the running sessions tracked in SQLite. When
// the optional `project` query param is set, results are filtered to that
// project's absolute path.
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	if s.sessions == nil {
		writeJSON(w, http.StatusOK, []sessionDTO{})
		return
	}

	ctx := r.Context()
	var rows []store.Session
	var err error
	if project := r.URL.Query().Get("project"); project != "" {
		rows, err = s.sessions.ListByProject(ctx, project)
	} else {
		rows, err = s.sessions.List(ctx)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	out := make([]sessionDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, toSessionDTO(row))
	}
	writeJSON(w, http.StatusOK, out)
}

// handlePublishEvent is the cross-process ingress to the in-process event
// bus. Short-lived CLI commands (spawn/stop) run in their own process, so the
// events their engine publishes never reach this server's bus — and thus never
// reach the dashboard's SSE stream. This endpoint accepts a flattened event
// from such a process and republishes it on EventBus, where the existing
// /api/events SSE fan-out delivers it to open boards.
//
// Authentication is a shared token from the server runfile (0600), carried in
// the X-yyork-Token header. Because only processes that can read that file
// know the token, a browser page cannot forge a request here — this is the
// guard against a malicious page CSRF-ing the localhost endpoint. The token is
// compared in constant time. Unknown event types are rejected so a caller
// can't inject arbitrary types onto the bus.
func (s *Server) handlePublishEvent(w http.ResponseWriter, r *http.Request) {
	if s.eventBus == nil {
		http.Error(w, "event bus unavailable", http.StatusServiceUnavailable)
		return
	}

	presented := []byte(r.Header.Get(control.TokenHeader))
	expected := []byte(s.controlToken)
	if len(expected) == 0 || subtle.ConstantTimeCompare(presented, expected) != 1 {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var envelope control.Envelope
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&envelope); err != nil {
		http.Error(w, "invalid event payload", http.StatusBadRequest)
		return
	}

	event, ok := control.ToEvent(envelope)
	if !ok {
		http.Error(w, "unknown event type", http.StatusBadRequest)
		return
	}

	s.eventBus.Publish(event)
	w.WriteHeader(http.StatusNoContent)
}

// handleEventsStream is a Server-Sent Events endpoint that streams session
// lifecycle events from the in-process bus. Subscribers receive every
// event published from the moment they connect; the bus has no replay
// buffer, so clients should rely on `GET /api/sessions` for initial state.
//
// The handler keeps the connection open until the client disconnects or
// the request context is canceled (e.g. server shutdown). It writes a
// comment line every 30s as an SSE keepalive so intermediate proxies
// don't time the connection out.
func (s *Server) handleEventsStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Nginx-style proxies

	// Initial comment so clients know the stream is live even before any
	// real event lands.
	fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	if s.eventBus == nil {
		// No bus wired — clean disconnect after the welcome message.
		return
	}

	ch, unsubscribe := s.eventBus.Subscribe()
	defer unsubscribe()

	keepalive := time.NewTicker(30 * time.Second)
	defer keepalive.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-keepalive.C:
			fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()
		case ev, open := <-ch:
			if !open {
				return
			}
			if err := writeSSEEvent(w, ev); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// writeSSEEvent serializes one bus event into the SSE wire format:
//
//	event: <type>
//	data: <json>
//
// followed by a blank line. SSE clients dispatch on the `event` field.
func writeSSEEvent(w http.ResponseWriter, ev events.Event) error {
	payload, err := json.Marshal(ev.Payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, payload); err != nil {
		return err
	}
	return nil
}
