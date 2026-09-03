package session

import "testing"

func TestNormalizeAgentPluginAcceptsCursor(t *testing.T) {
	got, ok := NormalizeAgentPlugin("cursor")
	if !ok {
		t.Fatal("NormalizeAgentPlugin(cursor) rejected a supported agent")
	}
	if got != "cursor" {
		t.Fatalf("NormalizeAgentPlugin(cursor) = %q, want cursor", got)
	}
}
