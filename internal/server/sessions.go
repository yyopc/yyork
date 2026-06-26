package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/yyopc/yyork/internal/control"
	"github.com/yyopc/yyork/internal/events"
	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/store"
)

// sessionDTO is the JSON shape /api/sessions returns. It mirrors
// store.Session but with explicit JSON tags and ISO-8601 timestamps so the
// app doesn't need to format Unix epochs.
type sessionDTO struct {
	ID            string         `json:"id"`
	ProjectPath   string         `json:"projectPath"`
	ProjectName   string         `json:"projectName"`
	AgentPlugin   string         `json:"agentPlugin"`
	WorkspacePath string         `json:"workspacePath"`
	ZellijSession string         `json:"zellijSession"`
	PID           int64          `json:"pid,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
	Title         string         `json:"title"`
	Recap         string         `json:"recap"`
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
		Title:         resolvedSessionTitle(s),
		Recap:         resolvedSessionRecap(s),
		CreatedAt:     s.CreatedAt,
		UpdatedAt:     s.UpdatedAt,
	}
}

func resolvedSessionTitle(s store.Session) string {
	for _, key := range []string{"displayName", "title"} {
		if value := metadataString(s.Metadata, key); value != "" {
			return value
		}
	}
	if sessionKind(s.Metadata) == "orchestrator" {
		return "Orchestrator"
	}
	return "New worker agent"
}

func sessionKind(metadata map[string]any) string {
	for _, key := range []string{"kind", "role"} {
		switch metadataString(metadata, key) {
		case "orchestrator":
			return "orchestrator"
		case "worker":
			return "worker"
		}
	}
	return "worker"
}

func resolvedSessionRecap(s store.Session) string {
	if recap := metadataString(s.Metadata, "recap"); recap != "" {
		return recap
	}
	// Legacy compatibility for stores created before metadata.summary was
	// renamed to metadata.recap. New writes and migrations use recap.
	return metadataString(s.Metadata, "summary")
}

func metadataString(metadata map[string]any, key string) string {
	value, ok := metadata[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

// handleStopSession terminates the session identified by the {sessionID}
// path parameter. The configured stopper owns the actual backend behavior;
// in the app this is session.Engine, which kills Zellij, removes the worktree,
// deletes the store row, and publishes session.terminated.
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

// displayNameMaxLen caps a user-supplied session name. Names are presented in
// a narrow sidebar row, so anything longer is noise; the UI truncates anyway.
const displayNameMaxLen = 120

// sessionPatchRequest is the JSON body for PATCH /api/sessions/{sessionID}.
// displayName is optional so a state-only patch does not clear the existing
// display name. An explicitly empty displayName still clears the override.
type sessionPatchRequest struct {
	DisplayName *string        `json:"displayName"`
	State       *session.State `json:"state"`
}

// handlePatchSession updates session metadata exposed through the app. On
// success it publishes a session.updated event so every open app refreshes via
// SSE.
func (s *Server) handlePatchSession(w http.ResponseWriter, r *http.Request) {
	if s.sessions == nil {
		http.Error(w, "session store unavailable", http.StatusServiceUnavailable)
		return
	}

	sessionID := r.PathValue("sessionID")
	if sessionID == "" {
		http.Error(w, "session id is required", http.StatusBadRequest)
		return
	}

	var payload sessionPatchRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&payload); err != nil {
		http.Error(w, "invalid session patch payload", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	fields := map[string]any{}
	if payload.DisplayName != nil {
		fields["displayName"] = truncateRunes(strings.TrimSpace(*payload.DisplayName), displayNameMaxLen)
	}
	if payload.State != nil {
		if *payload.State != session.StateDone {
			http.Error(w, "only marking a session done is supported", http.StatusBadRequest)
			return
		}

		row, err := s.sessions.Get(ctx, sessionID)
		if errors.Is(err, store.ErrSessionNotFound) {
			http.Error(w, "session not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if sessionKind(row.Metadata) != string(session.KindWorker) || sessionState(row.Metadata) != session.StatePrompt {
			http.Error(w, "only prompt worker sessions can be marked done", http.StatusConflict)
			return
		}

		fields["state"] = string(session.StateDone)
	}
	if len(fields) == 0 {
		http.Error(w, "session patch is empty", http.StatusBadRequest)
		return
	}

	err := s.sessions.MergeMetadata(ctx, sessionID, fields)
	if errors.Is(err, store.ErrSessionNotFound) {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if s.eventBus != nil {
		s.eventBus.Publish(events.NewSessionUpdated(sessionID))
	}

	row, err := s.sessions.Get(ctx, sessionID)
	if errors.Is(err, store.ErrSessionNotFound) {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, toSessionDTO(row))
}

func sessionState(metadata map[string]any) session.State {
	switch session.State(metadataString(metadata, "state")) {
	case session.StatePrompt:
		return session.StatePrompt
	case session.StateTriage:
		return session.StateTriage
	case session.StateDone:
		return session.StateDone
	case session.StateWorking:
		return session.StateWorking
	default:
		return session.StateWorking
	}
}

// truncateRunes shortens s to at most max runes, preserving valid UTF-8.
func truncateRunes(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}

// handleListSessions returns the running sessions tracked in SQLite. The home
// workspace uses /api/workspace for the richer project/orchestrator shape; this
// endpoint remains for legacy callers and direct session-row reads.
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	if s.sessions == nil {
		writeJSON(w, http.StatusOK, []sessionDTO{})
		return
	}

	ctx := r.Context()
	var rows []store.Session
	var err error
	if project := r.URL.Query().Get("project"); project != "" {
		projectPath, _, resolveErr := s.projectPathForRequest(ctx, project)
		if resolveErr != nil {
			http.Error(w, resolveErr.Error(), http.StatusInternalServerError)
			return
		}
		rows, err = s.sessions.ListByProject(ctx, projectPath)
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
// reach the app's SSE stream. This endpoint accepts a flattened event
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
