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

// Executable returns the shell command prefix that should call back into yyork
// from an agent's native hook config. It prefers the running yyork binary, then
// a source-checkout fallback, then a yyork binary found on PATH.
func Executable() string {
	if command := strings.TrimSpace(os.Getenv(CommandEnv)); command != "" {
		return command
	}

	executable, err := os.Executable()
	if err == nil && filepath.Base(executable) == "yyork" {
		return shellQuote(executable)
	}

	if sourceRoot, ok := SourceRoot(); ok {
		if _, err := exec.LookPath("go"); err == nil {
			return sourceGoRunExecutable(sourceRoot)
		}
	}

	if path, err := exec.LookPath("yyork"); err == nil && strings.TrimSpace(path) != "" {
		return shellQuote(path)
	}

	return "yyork"
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

func sourceGoRunExecutable(sourceRoot string) string {
	direnvPath := ""
	if direnv, err := exec.LookPath("direnv"); err == nil {
		direnvPath = direnv
	}
	return goRunCommand(sourceRoot, direnvPath)
}

// goRunCommand builds the shell command that runs the yyork root package via
// `go run .`. It always cd's into sourceRoot first: `go run .` resolves the
// package against the process's working directory, and an agent hook inherits
// the session's cwd, which is frequently a non-Go subdirectory (e.g. web/).
// `direnv exec DIR` loads DIR's .envrc environment but does NOT change
// directory, so without the cd the direnv branch runs `go run .` in the
// session cwd and fails with "no Go files in <cwd>". The cd is required on
// both branches; direnv exec is kept only to load the root's environment.
func goRunCommand(sourceRoot, direnvPath string) string {
	root := shellQuote(sourceRoot)
	if direnvPath != "" {
		return "cd " + root + " && " + shellQuote(direnvPath) + " exec " + root + " go run ."
	}
	return "cd " + root + " && go run ."
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
