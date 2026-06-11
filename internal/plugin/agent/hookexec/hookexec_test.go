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

func TestExecutableHonorsOverride(t *testing.T) {
	t.Setenv(CommandEnv, "/custom/yyork --from-test")

	if got := Executable(); got != "/custom/yyork --from-test" {
		t.Fatalf("Executable() = %q, want override", got)
	}
}
