// Package hookexec resolves the yyork executable string embedded in
// workspace-local agent hook configs.
package hookexec

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	// CommandEnv lets tests and local development override the executable
	// written into hook configs.
	CommandEnv = "YYORK_HOOK_COMMAND"

	yyorkModulePath = "github.com/yyopc/yyork"
)

var (
	currentExecutable = os.Executable
	lookPath          = exec.LookPath
)

// Executable returns the shell command prefix that should call back into yyork
// from an agent's native hook config. It prefers a yyork command on PATH so the
// hook config matches the user's install. In a source checkout, the repo-local
// .go/bin/yyork or the flake GOBIN go-bin/yyork is the devshell's intended
// CLI, so hooks should call plain `yyork` instead of baking a source-root
// `go run .` command into config. Non-source PATH binaries are path-scoped
// because agents run hook strings through the user's shell, whose startup
// files may rewrite PATH before executing yyork. It then falls back to the
// running yyork binary or a source-checkout command.
func Executable() string {
	if command := strings.TrimSpace(os.Getenv(CommandEnv)); command != "" {
		return command
	}

	sourceRoot, hasSourceRoot := SourceRoot()
	if path, err := lookPath("yyork"); err == nil && strings.TrimSpace(path) != "" {
		if isSourceLocalYyorkPath(path) {
			return "yyork"
		}
		return pathScopedYyork(path)
	}

	executable, err := currentExecutable()
	if err == nil && filepath.Base(executable) == "yyork" && !isGoBuildExecutable(executable) {
		return shellQuote(executable)
	}

	if hasSourceRoot {
		if goPath, err := lookPath("go"); err == nil {
			return sourceGoRunExecutable(sourceRoot, goPath)
		}
	}

	return "yyork"
}

func pathScopedYyork(path string) string {
	dir := filepath.Dir(strings.TrimSpace(path))
	if dir == "." || strings.TrimSpace(dir) == "" {
		return "yyork"
	}
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}
	return "PATH=" + shellQuote(dir) + `:"$PATH" yyork`
}

func isSourceLocalYyorkPath(path string) bool {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return false
	}
	absPath, err := filepath.Abs(trimmedPath)
	if err != nil {
		return false
	}
	sourceRoot, ok := sourceRootFrom(filepath.Dir(absPath))
	if !ok {
		return false
	}
	root := filepath.Clean(sourceRoot)
	cleanPath := filepath.Clean(absPath)
	sourceLocalBins := []string{
		filepath.Join(root, ".go", "bin", "yyork"),
		filepath.Join(root, "go-bin", "yyork"),
	}
	for _, candidate := range sourceLocalBins {
		if cleanPath == candidate {
			return true
		}
	}
	return false
}

// SourceRoot returns the nearest yyork source checkout root at or above the
// current working directory.
func SourceRoot() (string, bool) {
	cwd, err := os.Getwd()
	if err != nil || strings.TrimSpace(cwd) == "" {
		return "", false
	}
	return sourceRootFrom(cwd)
}

func sourceRootFrom(dir string) (string, bool) {
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}

	for {
		if hasYyorkSourceRoot(dir) {
			return dir, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

func hasYyorkSourceRoot(dir string) bool {
	data, err := os.ReadFile(filepath.Join(dir, "go.mod"))
	if err != nil || !declaresYyorkModule(data) {
		return false
	}
	if _, err := os.Stat(filepath.Join(dir, "main.go")); err != nil {
		return false
	}
	if _, err := os.Stat(filepath.Join(dir, "internal", "cli", "main.go")); err != nil {
		return false
	}
	return true
}

func declaresYyorkModule(data []byte) bool {
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && fields[0] == "module" && fields[1] == yyorkModulePath {
			return true
		}
	}
	return false
}

func isGoBuildExecutable(executable string) bool {
	return isGoBuildCacheExecutable(executable) || isGoRunTempExecutable(executable)
}

func isGoBuildCacheExecutable(executable string) bool {
	cache := strings.TrimSpace(os.Getenv("GOCACHE"))
	if cache == "" {
		goPath, err := lookPath("go")
		if err != nil {
			return false
		}
		output, err := exec.Command(goPath, "env", "GOCACHE").Output()
		if err != nil {
			return false
		}
		cache = strings.TrimSpace(string(output))
	}
	if cache == "" {
		return false
	}

	rel, err := filepath.Rel(cache, executable)
	if err != nil || rel == "." || rel == ".." {
		return false
	}
	return !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func isGoRunTempExecutable(executable string) bool {
	for dir := filepath.Clean(executable); dir != "." && dir != string(filepath.Separator); dir = filepath.Dir(dir) {
		if strings.HasPrefix(filepath.Base(dir), "go-build") {
			return true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}
	return false
}

func sourceGoRunExecutable(sourceRoot string, goPath string) string {
	return goRunCommand(sourceRoot, goPath)
}

// goRunCommand builds the shell command that runs the yyork root package via
// `go run .`. It always cd's into sourceRoot first: `go run .` resolves the
// package against the process's working directory, and an agent hook inherits
// the session's cwd, which is frequently a non-Go subdirectory (e.g. internal/web/).
// It intentionally does not wrap the hook in `direnv exec`: Codex hooks can run
// with a HOME/XDG environment that lacks direnv's allow state, causing direnv to
// exit 1 before yyork's hook handler runs.
func goRunCommand(sourceRoot, goPath string) string {
	root := shellQuote(sourceRoot)
	goCommand := "go"
	if strings.TrimSpace(goPath) != "" {
		goCommand = shellQuote(goPath)
	}
	return "cd " + root + " && " + goCommand + " run ."
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
