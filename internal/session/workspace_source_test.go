package session

import (
	"testing"

	"github.com/yyopc/yyork/internal/store"
)

func TestToLegacySessionTitlePrecedence(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		metadata map[string]any
		want     string
	}{
		{
			name:     "displayName wins over title and prompt",
			metadata: map[string]any{"displayName": "Renamed", "title": "Hook Title", "prompt": "do a thing"},
			want:     "Renamed",
		},
		{
			name:     "title wins when no displayName",
			metadata: map[string]any{"title": "Hook Title", "prompt": "do a thing"},
			want:     "Hook Title",
		},
		{
			name:     "prompt wins when no displayName or title",
			metadata: map[string]any{"prompt": "do a thing"},
			want:     "do a thing",
		},
		{
			name:     "falls back to new agent id when nothing set",
			metadata: nil,
			want:     "new agent: v042rv",
		},
		{
			name:     "empty strings are ignored in precedence",
			metadata: map[string]any{"displayName": "", "title": "", "prompt": "the prompt"},
			want:     "the prompt",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			row := store.Session{ID: "v042rv", Metadata: tc.metadata}
			got := toLegacySession(row)
			if got.Title != tc.want {
				t.Fatalf("Title = %q, want %q", got.Title, tc.want)
			}
		})
	}
}

func TestToLegacySessionRecapUsesHookRecap(t *testing.T) {
	t.Parallel()

	row := store.Session{
		ID:       "v042rv",
		Metadata: map[string]any{"prompt": "do a thing", "recap": "Finished the investigation.", "displayName": "Renamed"},
	}
	got := toLegacySession(row)

	if got.Recap != "Finished the investigation." {
		t.Fatalf("Recap = %q, want %q", got.Recap, "Finished the investigation.")
	}
	if got.Description != got.Recap {
		t.Fatalf("Description = %q, want compatibility alias for Recap %q", got.Description, got.Recap)
	}
	// The rename must not bleed into the recap.
	if got.Title != "Renamed" {
		t.Fatalf("Title = %q, want %q", got.Title, "Renamed")
	}
}

func TestToLegacySessionRecapDoesNotFallbackToPrompt(t *testing.T) {
	t.Parallel()

	row := store.Session{
		ID:       "v042rv",
		Metadata: map[string]any{"prompt": "do a thing"},
	}
	got := toLegacySession(row)

	if got.Recap != "" {
		t.Fatalf("Recap = %q, want empty until hook recap exists", got.Recap)
	}
}

func TestToLegacySessionRecapDoesNotUsePromptWhenSessionRenamed(t *testing.T) {
	t.Parallel()

	row := store.Session{
		ID:       "v042rv",
		Metadata: map[string]any{"displayName": "Project overview", "prompt": "tell me about this project"},
	}
	got := toLegacySession(row)

	if got.Title != "Project overview" {
		t.Fatalf("Title = %q, want rename", got.Title)
	}
	if got.Recap != "" {
		t.Fatalf("Recap = %q, want empty until last assistant message exists", got.Recap)
	}
}
