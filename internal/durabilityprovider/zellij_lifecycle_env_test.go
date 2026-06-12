package durabilityprovider

import (
	"os"
	"strings"
	"testing"
)

func TestBuildEnvDefaultsEmptyTerm(t *testing.T) {
	t.Setenv("TERM", "")

	env := buildEnv(nil)

	if got := envValue(env, "TERM"); got != defaultZellijTerm {
		t.Fatalf("TERM = %q, want %q", got, defaultZellijTerm)
	}
}

func TestBuildEnvAddsMissingTerm(t *testing.T) {
	t.Setenv("TERM", "placeholder")
	t.Setenv("YYORK_TEST_ENV", "kept")

	env := buildEnv(map[string]string{"TERM": ""})

	if got := envValue(env, "TERM"); got != defaultZellijTerm {
		t.Fatalf("TERM = %q, want %q", got, defaultZellijTerm)
	}
	if got := envValue(env, "YYORK_TEST_ENV"); got != "kept" {
		t.Fatalf("YYORK_TEST_ENV = %q, want kept", got)
	}
}

func TestBuildEnvPreservesExplicitTerm(t *testing.T) {
	t.Setenv("TERM", "")

	env := buildEnv(map[string]string{"TERM": "screen-256color"})

	if got := envValue(env, "TERM"); got != "screen-256color" {
		t.Fatalf("TERM = %q, want screen-256color", got)
	}
}

// A backend launched from an agent/CI shell (e.g. Codex CLI) carries
// NO_COLOR=1 and a blank COLORTERM. Those must never reach the long-lived
// zellij server: panes inherit the server env forever, and agents inside them
// would render monochrome.
func TestBuildEnvStripsNoColor(t *testing.T) {
	t.Setenv("NO_COLOR", "1")

	env := buildEnv(nil)

	if envHas(env, "NO_COLOR") {
		t.Fatalf("NO_COLOR survived buildEnv: %q", envValue(env, "NO_COLOR"))
	}
}

func TestBuildEnvDefaultsBlankColorterm(t *testing.T) {
	t.Setenv("COLORTERM", "")

	env := buildEnv(nil)

	if got := envValue(env, "COLORTERM"); got != defaultZellijColorterm {
		t.Fatalf("COLORTERM = %q, want %q", got, defaultZellijColorterm)
	}
}

func TestBuildEnvAddsMissingColorterm(t *testing.T) {
	t.Setenv("COLORTERM", "placeholder")
	if err := os.Unsetenv("COLORTERM"); err != nil {
		t.Fatalf("unset COLORTERM: %v", err)
	}

	env := buildEnv(nil)

	if got := envValue(env, "COLORTERM"); got != defaultZellijColorterm {
		t.Fatalf("COLORTERM = %q, want %q", got, defaultZellijColorterm)
	}
}

func TestBuildEnvPreservesExplicitColorterm(t *testing.T) {
	t.Setenv("COLORTERM", "24bit")

	env := buildEnv(nil)

	if got := envValue(env, "COLORTERM"); got != "24bit" {
		t.Fatalf("COLORTERM = %q, want 24bit", got)
	}
}

func envValue(env []string, key string) string {
	prefix := key + "="
	for _, pair := range env {
		if strings.HasPrefix(pair, prefix) {
			return strings.TrimPrefix(pair, prefix)
		}
	}
	return ""
}

func envHas(env []string, key string) bool {
	prefix := key + "="
	for _, pair := range env {
		if strings.HasPrefix(pair, prefix) {
			return true
		}
	}
	return false
}
