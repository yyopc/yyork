package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/yyovil/better-ao/internal/durabilityprovider"
	"github.com/yyovil/better-ao/internal/session"
	"github.com/yyovil/better-ao/internal/store"
)

type annotationsRequest struct {
	Annotations []annotation `json:"annotations"`
}

// annotation mirrors the subset of the agentation v1.1 Annotation shape that
// better-ao forwards to an agent as a user message.
type annotation struct {
	ID              string `json:"id"`
	Comment         string `json:"comment"`
	ElementPath     string `json:"elementPath"`
	Element         string `json:"element"`
	URL             string `json:"url"`
	ReactComponents string `json:"reactComponents"`
	SelectedText    string `json:"selectedText"`
	Intent          string `json:"intent"`
	Severity        string `json:"severity"`
}

func (s *Server) handleAnnotations(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")

	if s.sessions == nil {
		http.Error(w, "session store unavailable", http.StatusInternalServerError)
		return
	}

	var payload annotationsRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid annotations payload", http.StatusBadRequest)
		return
	}
	if len(payload.Annotations) == 0 {
		http.Error(w, "no annotations to send", http.StatusBadRequest)
		return
	}

	// Resolve the target session from the SQLite store — the source of truth
	// for running sessions. Session ids are ULIDs, so no project scoping is
	// needed to disambiguate.
	row, err := s.sessions.Get(r.Context(), sessionID)
	if errors.Is(err, store.ErrSessionNotFound) {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	message := formatAnnotationsMarkdown(payload.Annotations)
	target := session.Session{ID: row.ID, ZellijSession: row.ZellijSession}
	if err := durabilityprovider.Send(r.Context(), s.durabilityProviders, target, message); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]int{"delivered": len(payload.Annotations)})
}

// formatAnnotationsMarkdown renders staged annotations as a single user message
// an agent can read and act on.
func formatAnnotationsMarkdown(annotations []annotation) string {
	var b strings.Builder

	if len(annotations) == 1 {
		b.WriteString("I left 1 annotation on the live preview:\n\n")
	} else {
		fmt.Fprintf(&b, "I left %d annotations on the live preview:\n\n", len(annotations))
	}

	for i, item := range annotations {
		label := strings.TrimSpace(item.Severity)
		if intent := strings.TrimSpace(item.Intent); intent != "" {
			if label != "" {
				label += "/" + intent
			} else {
				label = intent
			}
		}

		if label != "" {
			fmt.Fprintf(&b, "%d. [%s] %s\n", i+1, label, strings.TrimSpace(item.Comment))
		} else {
			fmt.Fprintf(&b, "%d. %s\n", i+1, strings.TrimSpace(item.Comment))
		}

		if item.Element != "" || item.ElementPath != "" {
			fmt.Fprintf(&b, "   - element: %s `%s`\n", strings.TrimSpace(item.Element), strings.TrimSpace(item.ElementPath))
		}
		if item.ReactComponents != "" {
			fmt.Fprintf(&b, "   - component: %s\n", strings.TrimSpace(item.ReactComponents))
		}
		if item.SelectedText != "" {
			fmt.Fprintf(&b, "   - selected text: %q\n", strings.TrimSpace(item.SelectedText))
		}
		if item.URL != "" {
			fmt.Fprintf(&b, "   - url: %s\n", strings.TrimSpace(item.URL))
		}
	}

	return strings.TrimRight(b.String(), "\n")
}
