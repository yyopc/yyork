//go:build zellij_smoke

// Build-tagged smoke test for the zellij lifecycle helpers. Exercises the
// real zellij binary on the developer's machine. Not run by `go test
// ./...` — enable with `go test -tags=zellij_smoke ./internal/durabilityprovider/...`.
//
// The test cleans up the session it creates even if any sub-assertion
// fails, but if the test process itself is killed mid-run, the zellij
// session may persist; run `zellij kill-session yyork-smoke-...` to
// clean up.
package durabilityprovider_test

import (
	"context"
	"testing"
	"time"

	"github.com/yyovil/yyork/internal/durabilityprovider"
	"github.com/yyovil/yyork/internal/session"
)

func TestZellijProviderCreateAndKill_Smoke(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	z := durabilityprovider.NewZellijProvider()

	name := "yyork-smoke-" + nowSuffix()
	cwd := t.TempDir()

	t.Cleanup(func() {
		// Best-effort cleanup; ignore the error so test failures still bubble.
		killCtx, killCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer killCancel()
		_ = z.KillSession(killCtx, name)
	})

	exists, err := z.SessionExists(ctx, name)
	if err != nil {
		t.Fatalf("SessionExists before create: %v", err)
	}
	if exists {
		t.Fatalf("session %q already exists; clean up first", name)
	}

	// Launch /bin/true; the keep-alive shell wrap will hold the pane open.
	if err := z.CreateSession(ctx, session.CreateOpts{
		Name:      name,
		LaunchCmd: []string{"/bin/true"},
		Cwd:       cwd,
		Env:       map[string]string{"YYORK_SESSION_ID": name},
	}); err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	exists, err = z.SessionExists(ctx, name)
	if err != nil {
		t.Fatalf("SessionExists after create: %v", err)
	}
	if !exists {
		t.Fatalf("session %q not present after CreateSession", name)
	}

	if err := z.KillSession(ctx, name); err != nil {
		t.Fatalf("KillSession: %v", err)
	}

	// Allow zellij's server a moment to reflect the kill.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		exists, err = z.SessionExists(ctx, name)
		if err != nil {
			t.Fatalf("SessionExists after kill: %v", err)
		}
		if !exists {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("session %q still present 2s after KillSession", name)
}

func nowSuffix() string {
	return time.Now().Format("20060102-150405")
}
