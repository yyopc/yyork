// Package control links short-lived yyork CLI processes to a running
// yyork server.
//
// The bus in internal/events is in-process only: the server's bus fans out to
// SSE subscribers, but a `spawn` invoked from the terminal runs in a separate
// process whose bus has no subscribers, so its lifecycle events would vanish.
// This package bridges that gap. The server advertises its address and a
// shared secret in a runfile (~/.yyork/server.json); CLI commands read it
// and POST their events to the server's control endpoint, which republishes
// them on the in-process bus. The result: a board that's already open updates
// live when you spawn from the CLI, with no polling.
package control

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/yyopc/yyork/internal/events"
	"github.com/yyopc/yyork/internal/paths"
)

const (
	// runfileName is the server advertisement file. It lives next to
	// state.db under ~/.yyork/.
	runfileName = "server.json"

	runfileNote = "Heads up: yyork uses this while running so CLI workers can wake the dashboard. Please don't delete it; yyork cleans it up on shutdown."

	// TokenHeader carries the shared secret on control requests. The runfile
	// is written 0600, so only processes that can read it — not browser pages
	// — can present a valid token. This is the defense that stops a malicious
	// web page from CSRF-ing the localhost control endpoint into the bus.
	TokenHeader = "X-yyork-Token"

	// forwardTimeout bounds how long a CLI command blocks while shipping an
	// event. A live local server answers in single-digit milliseconds; this
	// only bites when the runfile is stale and the socket is dead.
	forwardTimeout = 750 * time.Millisecond

	// shutdownTimeout bounds an explicit `yyork stop` server-control request.
	// It can be a little more patient than event forwarding because a human or
	// script is waiting for a definitive acknowledgement.
	shutdownTimeout = 2 * time.Second
)

// Info is the server advertisement persisted to the runfile.
type Info struct {
	Addr  string `json:"addr"`
	PID   int    `json:"pid"`
	Token string `json:"token"`
}

type runfileInfo struct {
	Note  string `json:"note"`
	Addr  string `json:"addr"`
	PID   int    `json:"pid"`
	Token string `json:"token"`
}

// Envelope is the control endpoint's wire shape: a flattened lifecycle event.
type Envelope struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// ShutdownResult describes the outcome of an authenticated local shutdown
// request.
type ShutdownResult struct {
	ServerAdvertised  bool
	ShutdownRequested bool
	Addr              string
	PID               int
}

// Path returns the runfile path, ~/.yyork/server.json.
func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, paths.DataDirName, runfileName), nil
}

// NewToken returns a fresh 256-bit hex secret for the runfile.
func NewToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate control token: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

// Write persists info to the runfile with 0600 perms, creating the parent
// directory if it does not exist.
func Write(info Info) error {
	path, err := Path()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create data directory: %w", err)
	}
	data, err := json.MarshalIndent(runfileInfo{
		Note:  runfileNote,
		Addr:  info.Addr,
		PID:   info.PID,
		Token: info.Token,
	}, "", "  ")
	if err != nil {
		return fmt.Errorf("encode runfile: %w", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("write runfile %s: %w", path, err)
	}
	return nil
}

// Read loads the runfile. A missing file surfaces as os.ErrNotExist so callers
// can treat "no server running" distinctly.
func Read() (Info, error) {
	path, err := Path()
	if err != nil {
		return Info{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Info{}, err
	}
	var info Info
	if err := json.Unmarshal(data, &info); err != nil {
		return Info{}, fmt.Errorf("decode runfile %s: %w", path, err)
	}
	return info, nil
}

// Remove deletes the runfile. A missing file is not an error.
func Remove() error {
	path, err := Path()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// RemoveIfOwnedBy deletes the runfile only when it still advertises pid.
//
// The runfile is a single shared file keyed to one port. When a server is
// replaced, the old process may still be draining connections while the new
// one has already written its own runfile; an unconditional Remove in the old
// process's shutdown path would then delete the new server's runfile. Gating
// on the advertised PID makes shutdown safe against that race: a stale server
// leaves a runfile it no longer owns alone. A missing file is not an error.
func RemoveIfOwnedBy(pid int) error {
	info, err := Read()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if info.PID != pid {
		return nil // a newer server owns the runfile; leave it
	}
	return Remove()
}

// RequestShutdown asks the locally advertised yyork server to gracefully shut
// down. A missing runfile or unreachable advertised address is a successful
// no-op: from the caller's perspective there is no running server to stop.
func RequestShutdown(ctx context.Context) (ShutdownResult, error) {
	return requestShutdown(ctx, &http.Client{Timeout: shutdownTimeout})
}

func requestShutdown(ctx context.Context, client *http.Client) (ShutdownResult, error) {
	info, err := Read()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ShutdownResult{}, nil
		}
		return ShutdownResult{}, err
	}

	result := ShutdownResult{
		ServerAdvertised: true,
		Addr:             info.Addr,
		PID:              info.PID,
	}
	if info.Addr == "" {
		return result, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+info.Addr+"/api/control/shutdown", http.NoBody)
	if err != nil {
		return result, err
	}
	req.Header.Set(TokenHeader, info.Token)

	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return result, ctx.Err()
		}
		return result, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNoContent {
		result.ShutdownRequested = true
		return result, nil
	}

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
	detail := strings.TrimSpace(string(body))
	if detail != "" {
		return result, fmt.Errorf("shutdown request failed: %s: %s", resp.Status, detail)
	}
	return result, fmt.Errorf("shutdown request failed: %s", resp.Status)
}

// ToEvent converts a wire envelope into a bus event, rejecting unknown types.
// The boolean is false for anything outside the known lifecycle set, so the
// control endpoint never publishes attacker-chosen event types onto the bus.
func ToEvent(env Envelope) (events.Event, bool) {
	switch events.Type(env.Type) {
	case events.TypeSessionCreated:
		return events.NewSessionCreated(env.ID), true
	case events.TypeSessionTerminated:
		return events.NewSessionTerminated(env.ID), true
	case events.TypeSessionUpdated:
		return events.NewSessionUpdated(env.ID), true
	default:
		return events.Event{}, false
	}
}

// ForwardingPublisher implements events.Publisher for short-lived CLI
// processes. Each Publish reads the runfile and, if a server is advertised,
// POSTs the event to its control endpoint.
//
// Best-effort by design: no server (or a stale runfile) means there is no open
// board to update, so every error is swallowed. Publish blocks until the POST
// settles rather than firing a goroutine, because the calling process — e.g.
// `yyork spawn` — typically exits immediately afterward; a detached
// goroutine would race the process exit and drop the event.
type ForwardingPublisher struct {
	client *http.Client
}

// NewForwardingPublisher returns a publisher that relays events to the running
// server named in the runfile.
func NewForwardingPublisher() *ForwardingPublisher {
	return &ForwardingPublisher{client: &http.Client{Timeout: forwardTimeout}}
}

// Publish forwards e to the running server, swallowing every error.
func (p *ForwardingPublisher) Publish(e events.Event) {
	info, err := Read()
	if err != nil || info.Addr == "" {
		return // no server advertised; nothing to update
	}

	id, _ := e.Payload["id"].(string)
	body, err := json.Marshal(Envelope{Type: string(e.Type), ID: id})
	if err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), forwardTimeout)
	defer cancel()

	url := "http://" + info.Addr + "/api/events"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(TokenHeader, info.Token)

	resp, err := p.client.Do(req)
	if err != nil {
		return
	}
	_ = resp.Body.Close()
}
