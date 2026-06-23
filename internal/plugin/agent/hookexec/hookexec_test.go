package hookexec

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSourceRootFromFindsMigratedRootEntrypoint(t *testing.T) {
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}

	root, ok := sourceRootFrom(cwd)
	if !ok {
		t.Fatalf("sourceRootFrom(%q) did not find yyork root", cwd)
	}
	if _, err := os.Stat(filepath.Join(root, "main.go")); err != nil {
		t.Fatalf("root main.go missing at %q: %v", root, err)
	}
	if _, err := os.Stat(filepath.Join(root, "internal", "cli", "main.go")); err != nil {
		t.Fatalf("internal CLI entry missing at %q: %v", root, err)
	}
}

func TestSourceGoRunExecutableUsesMigratedRootPackage(t *testing.T) {
	command := sourceGoRunExecutable("/tmp/yyork root")
	if strings.Contains(command, "cmd/yyork") {
		t.Fatalf("source fallback still points at deleted cmd/yyork package: %q", command)
	}
	if !strings.Contains(command, "go run .") {
		t.Fatalf("source fallback should run the migrated root package: %q", command)
	}
	if !strings.Contains(command, "'/tmp/yyork root'") {
		t.Fatalf("source fallback should quote the root path: %q", command)
	}
}

func TestGoRunCommandChdirsIntoRoot(t *testing.T) {
	// Regression: `direnv exec DIR` loads DIR's env but does not chdir, so the
	// command must cd into the module root itself before `go run .`. Without
	// the cd, an agent hook runs `go run .` in the session cwd (e.g. internal/web/) and
	// fails with "no Go files in <cwd>".
	withDirenv := goRunCommand("/tmp/yyork root", "/usr/bin/direnv")
	if !strings.HasPrefix(withDirenv, "cd '/tmp/yyork root' && ") {
		t.Fatalf("direnv command must cd into root before running: %q", withDirenv)
	}
	if !strings.Contains(withDirenv, "'/usr/bin/direnv' exec '/tmp/yyork root' go run .") {
		t.Fatalf("direnv command should still load root env via direnv exec: %q", withDirenv)
	}

	noDirenv := goRunCommand("/tmp/yyork root", "")
	if !strings.HasPrefix(noDirenv, "cd '/tmp/yyork root' && ") {
		t.Fatalf("fallback command must cd into root before running: %q", noDirenv)
	}

	for _, command := range []string{withDirenv, noDirenv} {
		if !strings.HasSuffix(command, "go run .") {
			t.Fatalf("command should run the migrated root package: %q", command)
		}
		if strings.Contains(command, "cmd/yyork") {
			t.Fatalf("command still points at deleted cmd/yyork package: %q", command)
		}
	}
}

func TestExecutableHonorsOverride(t *testing.T) {
	t.Setenv(CommandEnv, "/custom/yyork --from-test")

	if got := Executable(); got != "/custom/yyork --from-test" {
		t.Fatalf("Executable() = %q, want override", got)
	}
}
