package session

import (
	"strings"
	"testing"
)

func TestDefaultNewIDFormat(t *testing.T) {
	for range 512 {
		id := defaultNewID()
		if len(id) != idLength {
			t.Fatalf("id %q has length %d, want %d", id, len(id), idLength)
		}
		for _, r := range id {
			if !strings.ContainsRune(idAlphabet, r) {
				t.Fatalf("id %q contains %q outside the alphabet", id, r)
			}
		}
	}
}

// The id must be short enough that zellij's socket path stays under the
// ~103-byte sun_path limit: <socketdir>/contract_version_1/<id>.
func TestDefaultNewIDIsShort(t *testing.T) {
	if id := defaultNewID(); len(id) > 8 {
		t.Fatalf("session id %q is too long for the zellij socket path budget", id)
	}
}
