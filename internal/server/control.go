package server

import (
	"crypto/subtle"
	"net/http"

	"github.com/yyopc/yyork/internal/control"
)

func (s *Server) validControlToken(r *http.Request) bool {
	presented := []byte(r.Header.Get(control.TokenHeader))
	expected := []byte(s.controlToken)
	return len(expected) > 0 && subtle.ConstantTimeCompare(presented, expected) == 1
}

func (s *Server) handleControlShutdown(w http.ResponseWriter, r *http.Request) {
	if !s.validControlToken(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if s.shutdown == nil {
		http.Error(w, "shutdown unavailable", http.StatusServiceUnavailable)
		return
	}

	w.WriteHeader(http.StatusNoContent)
	go s.shutdown()
}
