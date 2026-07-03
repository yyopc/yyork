package hookexec

import (
	"os"
	"os/exec"
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
	command := sourceGoRunExecutable("/tmp/yyork root", "/usr/bin/go")
	if strings.Contains(command, "cmd/yyork") {
		t.Fatalf("source fallback still points at deleted cmd/yyork package: %q", command)
	}
	if !strings.Contains(command, "'/usr/bin/go' run .") {
		t.Fatalf("source fallback should run the migrated root package: %q", command)
	}
	if !strings.Contains(command, "'/tmp/yyork root'") {
		t.Fatalf("source fallback should quote the root path: %q", command)
	}
}

func TestGoRunCommandChdirsIntoRoot(t *testing.T) {
	// Regression: an agent hook inherits the session cwd (e.g. internal/web/),
	// so the command must cd into the module root before `go run .`.
	command := goRunCommand("/tmp/yyork root", "/usr/bin/go")
	if !strings.HasPrefix(command, "cd '/tmp/yyork root' && ") {
		t.Fatalf("fallback command must cd into root before running: %q", command)
	}
	if !strings.HasSuffix(command, "'/usr/bin/go' run .") {
		t.Fatalf("command should run the migrated root package: %q", command)
	}
	if strings.Contains(command, "cmd/yyork") {
		t.Fatalf("command still points at deleted cmd/yyork package: %q", command)
	}
	if strings.Contains(command, "direnv") {
		t.Fatalf("command should not depend on direnv allow state: %q", command)
	}
}

func TestExecutableSourceFallbackIgnoresDirenvOnPathWhenYyorkMissing(t *testing.T) {
	root, ok := SourceRoot()
	if !ok {
		t.Fatal("SourceRoot did not find yyork checkout")
	}

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return "/tmp/not-yyork", nil
	}
	lookPath = func(name string) (string, error) {
		switch name {
		case "go":
			return "/usr/bin/go", nil
		case "direnv":
			return "/usr/bin/direnv", nil
		default:
			return "", os.ErrNotExist
		}
	}

	got := Executable()
	want := "cd " + shellQuote(root) + " && '/usr/bin/go' run ."
	if got != want {
		t.Fatalf("Executable() = %q, want %q", got, want)
	}
	if strings.Contains(got, "direnv") {
		t.Fatalf("Executable() source fallback should not wrap direnv: %q", got)
	}
}

func TestExecutableSkipsGoRunBuildCacheBinary(t *testing.T) {
	cache := t.TempDir()
	t.Setenv("GOCACHE", cache)

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return filepath.Join(cache, "2d", "hash-d", "yyork"), nil
	}
	lookPath = func(name string) (string, error) {
		switch name {
		case "go":
			return "/usr/bin/go", nil
		case "yyork":
			return "/usr/local/bin/yyork", nil
		default:
			return "", os.ErrNotExist
		}
	}

	got := Executable()
	if strings.Contains(got, cache) {
		t.Fatalf("Executable() persisted Go build-cache binary: %q", got)
	}
	want := `PATH='/usr/local/bin':"$PATH" yyork`
	if got != want {
		t.Fatalf("Executable() = %q, want PATH-scoped yyork after skipping Go build-cache binary", got)
	}
}

func TestExecutableSkipsGoRunTempExecutable(t *testing.T) {
	t.Setenv("GOCACHE", t.TempDir())
	root, ok := SourceRoot()
	if !ok {
		t.Fatal("SourceRoot did not find yyork checkout")
	}

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return "/var/folders/example/T/go-build123456/b001/exe/yyork", nil
	}
	lookPath = func(name string) (string, error) {
		switch name {
		case "go":
			return "/usr/bin/go", nil
		default:
			return "", os.ErrNotExist
		}
	}

	got := Executable()
	want := "cd " + shellQuote(root) + " && '/usr/bin/go' run ."
	if got != want {
		t.Fatalf("Executable() = %q, want source fallback instead of go run temp executable", got)
	}
}

func TestExecutableUsesSourceFallbackWhenNoYyorkOnPath(t *testing.T) {
	cache := t.TempDir()
	t.Setenv("GOCACHE", cache)
	root, ok := SourceRoot()
	if !ok {
		t.Fatal("SourceRoot did not find yyork checkout")
	}

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return filepath.Join(cache, "2d", "hash-d", "yyork"), nil
	}
	lookPath = func(name string) (string, error) {
		switch name {
		case "go":
			return "/usr/bin/go", nil
		default:
			return "", os.ErrNotExist
		}
	}

	got := Executable()
	wantPrefix := "cd " + shellQuote(root) + " && "
	if !strings.HasPrefix(got, wantPrefix) {
		t.Fatalf("Executable() = %q, want source checkout fallback prefix %q", got, wantPrefix)
	}
	if !strings.Contains(got, "'/usr/bin/go' run .") {
		t.Fatalf("Executable() source fallback should use resolved go path: %q", got)
	}
}

func TestExecutableUsesSourceLocalYyorkOnPath(t *testing.T) {
	t.Setenv("GOCACHE", t.TempDir())
	root, ok := SourceRoot()
	if !ok {
		t.Fatal("SourceRoot did not find yyork checkout")
	}

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return "/tmp/not-yyork", nil
	}
	lookPath = func(name string) (string, error) {
		switch name {
		case "go":
			return "/usr/bin/go", nil
		case "yyork":
			return filepath.Join(root, ".go", "bin", "yyork"), nil
		default:
			return "", os.ErrNotExist
		}
	}

	got := Executable()
	want := "yyork"
	if got != want {
		t.Fatalf("Executable() = %q, want source-local .go/bin/yyork as plain yyork", got)
	}
}

func TestExecutableUsesFlakeGoBinYyorkOnPath(t *testing.T) {
	t.Setenv("GOCACHE", t.TempDir())
	root, ok := SourceRoot()
	if !ok {
		t.Fatal("SourceRoot did not find yyork checkout")
	}

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return "/tmp/not-yyork", nil
	}
	lookPath = func(name string) (string, error) {
		switch name {
		case "go":
			return "/usr/bin/go", nil
		case "yyork":
			return filepath.Join(root, "go-bin", "yyork"), nil
		default:
			return "", os.ErrNotExist
		}
	}

	got := Executable()
	want := "yyork"
	if got != want {
		t.Fatalf("Executable() = %q, want flake go-bin/yyork as plain yyork", got)
	}
}

func TestExecutableUsesSourceLocalYyorkWhenInstallingFromAnotherWorkspace(t *testing.T) {
	t.Setenv("GOCACHE", t.TempDir())
	root, ok := SourceRoot()
	if !ok {
		t.Fatal("SourceRoot did not find yyork checkout")
	}
	t.Chdir(t.TempDir())

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return "/tmp/not-yyork", nil
	}
	lookPath = func(name string) (string, error) {
		if name == "yyork" {
			return filepath.Join(root, "go-bin", "yyork"), nil
		}
		return "", os.ErrNotExist
	}

	got := Executable()
	want := "yyork"
	if got != want {
		t.Fatalf("Executable() = %q, want source-local yyork as plain yyork outside source cwd", got)
	}
}

func TestExecutableUsesStableYyorkBinary(t *testing.T) {
	t.Setenv("GOCACHE", t.TempDir())

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return "/opt/yyork/bin/yyork", nil
	}
	lookPath = func(string) (string, error) {
		return "", os.ErrNotExist
	}

	if got := Executable(); got != "'/opt/yyork/bin/yyork'" {
		t.Fatalf("Executable() = %q, want stable yyork binary", got)
	}
}

func TestExecutableScopesYyorkPathWhenOnPath(t *testing.T) {
	t.Setenv("GOCACHE", t.TempDir())

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return "/opt/yyork/bin/yyork", nil
	}
	lookPath = func(name string) (string, error) {
		if name == "yyork" {
			return "/usr/local/bin/yyork", nil
		}
		return "", os.ErrNotExist
	}

	want := `PATH='/usr/local/bin':"$PATH" yyork`
	if got := Executable(); got != want {
		t.Fatalf("Executable() = %q, want PATH-scoped yyork", got)
	}
}

func TestExecutablePathScopedYyorkSurvivesShellPathReset(t *testing.T) {
	shell, err := exec.LookPath("zsh")
	if err != nil {
		shell, err = exec.LookPath("sh")
		if err != nil {
			t.Skip("no shell available")
		}
	}

	binDir := t.TempDir()
	fakeYyork := filepath.Join(binDir, "yyork")
	if err := os.WriteFile(fakeYyork, []byte("#!/bin/sh\necho fake-yyork \"$@\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	oldExecutable := currentExecutable
	oldLookPath := lookPath
	t.Cleanup(func() {
		currentExecutable = oldExecutable
		lookPath = oldLookPath
	})
	currentExecutable = func() (string, error) {
		return "/tmp/not-yyork", nil
	}
	lookPath = func(name string) (string, error) {
		if name == "yyork" {
			return fakeYyork, nil
		}
		return "", os.ErrNotExist
	}

	command := "PATH=/usr/bin:/bin; " + Executable() + " hooks codex pre-tool-use"
	out, err := exec.Command(shell, "-c", command).CombinedOutput()
	if err != nil {
		t.Fatalf("run %s -c %q: %v\n%s", shell, command, err, out)
	}
	if got, want := strings.TrimSpace(string(out)), "fake-yyork hooks codex pre-tool-use"; got != want {
		t.Fatalf("shell output = %q, want %q", got, want)
	}
}

func TestExecutableHonorsOverride(t *testing.T) {
	t.Setenv(CommandEnv, "/custom/yyork --from-test")

	if got := Executable(); got != "/custom/yyork --from-test" {
		t.Fatalf("Executable() = %q, want override", got)
	}
}
