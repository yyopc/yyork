package durabilityprovider

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/yyovil/yyork/internal/session"
)

// ErrSessionNotFound is returned when no session matches the request.
var ErrSessionNotFound = errors.New("session not found")

// SendToSession resolves a session in ws and delivers message to its agent via
// the durability provider for the session's runtime. projectID may be empty, in
// which case sessionID must be unique across the workspace.
func SendToSession(ctx context.Context, registry *Registry, ws session.Workspace, projectID string, sessionID string, message string) error {
	sess, ok := resolveSession(ws, projectID, sessionID)
	if !ok {
		return fmt.Errorf("%w: %s", ErrSessionNotFound, sessionID)
	}

	return Send(ctx, registry, sess, message)
}

// Send delivers message to sess's agent via the durability provider for the
// session's runtime. Use this when the caller already holds a resolved session
// (e.g. one fetched from the SQLite store by id).
func Send(ctx context.Context, registry *Registry, sess session.Session, message string) error {
	if registry == nil {
		return errors.New("durability provider registry is required")
	}
	if strings.TrimSpace(message) == "" {
		return errors.New("message is empty")
	}

	runtimeName := runtimeOf(sess)
	provider, ok := registry.For(runtimeName)
	if !ok {
		return fmt.Errorf("session %q has no supported durable runtime", sess.ID)
	}

	return provider.SendMessage(ctx, sess, message)
}

// runtimeOf infers the AO runtime backing a session. Today only Zellij sessions
// carry a durable handle (session.ZellijSession), so its presence implies the
// "zellij" runtime. Generalize when a second runtime is added.
func runtimeOf(sess session.Session) string {
	if strings.TrimSpace(sess.ZellijSession) != "" {
		return zellijRuntimeName
	}
	return ""
}

func resolveSession(ws session.Workspace, projectID string, sessionID string) (session.Session, bool) {
	candidates := append(append([]session.Session{}, ws.Sessions...), ws.Orchestrators...)

	if projectID != "" {
		for _, candidate := range candidates {
			if candidate.Project == projectID && candidate.ID == sessionID {
				return candidate, true
			}
		}
		return session.Session{}, false
	}

	var found session.Session
	matches := 0
	for _, candidate := range candidates {
		if candidate.ID == sessionID {
			found = candidate
			matches++
		}
	}

	return found, matches == 1
}
