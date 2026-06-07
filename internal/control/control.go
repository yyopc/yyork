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
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/yyovil/yyork/internal/events"
)

const (
	// runfileName is the server advertisement file. It lives next to
	// state.db under ~/.yyork/.
	runfileName = "server.json"

	// TokenHeader carries the shared secret on control requests. The runfile
	// is written 0600, so only processes that can read it — not browser pages
	// — can present a valid token. This is the defense that stops a malicious
	// web page from CSRF-ing the localhost control endpoint into the bus.
	TokenHeader = "X-yyork-Token"

	// forwardTimeout bounds how long a CLI command blocks while shipping an
	// event. A live local server answers in single-digit milliseconds; this
	// only bites when the runfile is stale and the socket is dead.
	forwardTimeout = 750 * time.Millisecond
)

// Info is the server advertisement persisted to the runfile.
type Info struct {
	Addr  string `json:"addr"`
	PID   int    `json:"pid"`
	Token string `json:"token"`
}

// Envelope is the control endpoint's wire shape: a flattened lifecycle event.
type Envelope struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// Path returns the runfile path, ~/.yyork/server.json.
func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, ".yyork", runfileName), nil
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
	data, err := json.Marshal(info)
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

// ToEvent converts a wire envelope into a bus event, rejecting unknown types.
// The boolean is false for anything outside the known lifecycle set, so the
// control endpoint never publishes attacker-chosen event types onto the bus.
func ToEvent(env Envelope) (events.Event, bool) {
	switch events.Type(env.Type) {
	case events.TypeSessionCreated:
		return events.NewSessionCreated(env.ID), true
	case events.TypeSessionTerminated:
		return events.NewSessionTerminated(env.ID), true
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
