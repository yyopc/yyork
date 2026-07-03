package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/durabilityprovider"
)

func TestDoctorJSONReportsMissingRequiredDependencies(t *testing.T) {
	cmd := newDoctorCmdWithLookup(fakeLookup(map[string]string{
		"git": "/usr/bin/git",
	}))
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"--json"})

	err := cmd.ExecuteContext(context.Background())
	if !errors.Is(err, errDoctorFailed) {
		t.Fatalf("error = %v, want errDoctorFailed", err)
	}

	var got doctorOutput
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatalf("doctor --json produced invalid JSON: %v\n%s", err, out.String())
	}
	if got.OK {
		t.Fatalf("OK = true, want false: %#v", got)
	}
	if !doctorHasCheck(got, "git", doctorStatusOK) {
		t.Fatalf("missing ok git check: %#v", got.Checks)
	}
	if !doctorHasCheck(got, "zellij", doctorStatusMissing) {
		t.Fatalf("missing zellij failure: %#v", got.Checks)
	}
	if !doctorHasCheck(got, "agent-cli", doctorStatusMissing) {
		t.Fatalf("missing aggregate agent failure: %#v", got.Checks)
	}
}

func TestDoctorJSONCompatibility(t *testing.T) {
	cmd := newDoctorCmdWithLookups(
		fakeLookup(map[string]string{
			"git":    "/usr/bin/git",
			"claude": "/Users/me/.local/bin/claude",
			"codex":  "/Users/me/.local/bin/codex",
		}),
		fakeZellijLookup("/opt/yyork/bin/zellij", durabilityprovider.ZellijBinarySourceBundled),
	)
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"--json"})

	if err := cmd.ExecuteContext(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := `{"ok":true,"checks":[{"id":"zellij","command":"zellij","category":"runtime","required":true,"status":"ok","path":"/opt/yyork/bin/zellij","source":"bundled"},{"id":"git","command":"git","category":"runtime","required":true,"status":"ok","path":"/usr/bin/git"},{"id":"claude-code","command":"claude","category":"agent","required":false,"status":"ok","path":"/Users/me/.local/bin/claude"},{"id":"codex","command":"codex","category":"agent","required":false,"status":"ok","path":"/Users/me/.local/bin/codex"}]}
`
	if out.String() != want {
		t.Fatalf("doctor --json changed:\nwant:\n%s\ngot:\n%s", want, out.String())
	}
}

func TestDoctorTextPassesWithRuntimeAndAgentCLI(t *testing.T) {
	cmd := newDoctorCmdWithLookup(fakeLookup(map[string]string{
		"git":    "/usr/bin/git",
		"zellij": "/usr/local/bin/zellij",
		"claude": "/Users/me/.local/bin/claude",
	}))
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetArgs([]string{})

	if err := cmd.ExecuteContext(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := out.String()
	for _, want := range []string{
		"yyork doctor passed",
		"Runtime requirements",
		"Agent CLI availability",
		"git",
		"zellij",
		"source: path",
		"claude-code",
		"/Users/me/.local/bin/claude",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, text)
		}
	}
}

func TestDoctorTextPreviews(t *testing.T) {
	tests := []struct {
		name   string
		result doctorOutput
	}{
		{"all-ok-bundled-both", doctorPreviewAllOKBundledBoth()},
		{"claude-only-path", doctorPreviewClaudeOnlyPath()},
		{"codex-only-bundled", doctorPreviewCodexOnlyBundled()},
		{"no-agent-cli", doctorPreviewNoAgentCLI()},
		{"runtime-missing", doctorPreviewRuntimeMissing()},
		{"git-missing", doctorPreviewGitMissing()},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := renderDoctorText(tt.result, newDoctorTextStyles(false))
			want := readDoctorPreview(t, tt.name)
			if got != want {
				t.Fatalf("preview mismatch for %s:\nwant:\n%s\ngot:\n%s", tt.name, want, got)
			}
		})
	}
}

func TestDoctorTextColorDegradesForNonTTY(t *testing.T) {
	styled := renderDoctorText(doctorPreviewAllOKBundledBoth(), newDoctorTextStyles(true))
	if !strings.Contains(styled, "\x1b[") {
		t.Fatalf("styled renderer did not include ANSI escapes:\n%s", styled)
	}

	var out bytes.Buffer
	writeDoctorTextOutput(&out, doctorPreviewAllOKBundledBoth(), true)
	if strings.Contains(out.String(), "\x1b[") {
		t.Fatalf("non-TTY output should not include ANSI escapes:\n%s", out.String())
	}
}

func doctorHasCheck(output doctorOutput, id string, status string) bool {
	for _, check := range output.Checks {
		if check.ID == id && check.Status == status {
			return true
		}
	}
	return false
}

func readDoctorPreview(t *testing.T, name string) string {
	t.Helper()
	path := filepath.Join("testdata", "doctor", name+".txt")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read preview %s: %v", path, err)
	}
	return string(data)
}

func doctorPreviewAllOKBundledBoth() doctorOutput {
	return doctorOutput{
		OK: true,
		Checks: []doctorCheckOutput{
			{
				ID:       "zellij",
				Command:  "zellij",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/opt/yyork/bin/zellij",
				Source:   durabilityprovider.ZellijBinarySourceBundled,
			},
			{
				ID:       "git",
				Command:  "git",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/usr/bin/git",
			},
			{
				ID:       "claude-code",
				Command:  "claude",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusOK,
				Path:     "/Users/me/.local/bin/claude",
			},
			{
				ID:       "codex",
				Command:  "codex",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusOK,
				Path:     "/Users/me/.local/bin/codex",
			},
		},
	}
}

func doctorPreviewClaudeOnlyPath() doctorOutput {
	return doctorOutput{
		OK: true,
		Checks: []doctorCheckOutput{
			{
				ID:       "zellij",
				Command:  "zellij",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/usr/local/bin/zellij",
				Source:   durabilityprovider.ZellijBinarySourcePath,
			},
			{
				ID:       "git",
				Command:  "git",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/usr/bin/git",
			},
			{
				ID:       "claude-code",
				Command:  "claude",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusOK,
				Path:     "/Users/me/.local/bin/claude",
			},
			{
				ID:       "codex",
				Command:  "codex",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusMissing,
				Message:  "Codex sessions are unavailable until the codex CLI is on PATH.",
			},
		},
	}
}

func doctorPreviewCodexOnlyBundled() doctorOutput {
	return doctorOutput{
		OK: true,
		Checks: []doctorCheckOutput{
			{
				ID:       "zellij",
				Command:  "zellij",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/opt/yyork/bin/zellij",
				Source:   durabilityprovider.ZellijBinarySourceBundled,
			},
			{
				ID:       "git",
				Command:  "git",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/usr/bin/git",
			},
			{
				ID:       "claude-code",
				Command:  "claude",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusMissing,
				Message:  "Claude Code is the default agent; install it or spawn with another available agent.",
			},
			{
				ID:       "codex",
				Command:  "codex",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusOK,
				Path:     "/Users/me/.local/bin/codex",
			},
		},
	}
}

func doctorPreviewNoAgentCLI() doctorOutput {
	return doctorOutput{
		OK: false,
		Checks: []doctorCheckOutput{
			{
				ID:       "zellij",
				Command:  "zellij",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/opt/yyork/bin/zellij",
				Source:   durabilityprovider.ZellijBinarySourceBundled,
			},
			{
				ID:       "git",
				Command:  "git",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/usr/bin/git",
			},
			{
				ID:       "claude-code",
				Command:  "claude",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusMissing,
				Message:  "Claude Code is the default agent; install it or spawn with another available agent.",
			},
			{
				ID:       "codex",
				Command:  "codex",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusMissing,
				Message:  "Codex sessions are unavailable until the codex CLI is on PATH.",
			},
			{
				ID:       "agent-cli",
				Category: doctorCategoryAgent,
				Required: true,
				Status:   doctorStatusMissing,
				Message:  "Install at least one supported agent CLI, such as Claude Code or Codex, before spawning sessions.",
			},
		},
	}
}

func doctorPreviewRuntimeMissing() doctorOutput {
	return doctorOutput{
		OK: false,
		Checks: []doctorCheckOutput{
			{
				ID:       "zellij",
				Command:  "zellij",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusMissing,
				Message:  "yyork could not find its bundled zellij runtime or a zellij binary on PATH.",
			},
			{
				ID:       "git",
				Command:  "git",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/usr/bin/git",
			},
			{
				ID:       "claude-code",
				Command:  "claude",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusOK,
				Path:     "/Users/me/.local/bin/claude",
			},
			{
				ID:       "codex",
				Command:  "codex",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusMissing,
				Message:  "Codex sessions are unavailable until the codex CLI is on PATH.",
			},
		},
	}
}

func doctorPreviewGitMissing() doctorOutput {
	return doctorOutput{
		OK: false,
		Checks: []doctorCheckOutput{
			{
				ID:       "zellij",
				Command:  "zellij",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusOK,
				Path:     "/usr/local/bin/zellij",
				Source:   durabilityprovider.ZellijBinarySourcePath,
			},
			{
				ID:       "git",
				Command:  "git",
				Category: doctorCategoryRuntime,
				Required: true,
				Status:   doctorStatusMissing,
				Message:  "git is required for repository detection, file status, and session worktrees.",
			},
			{
				ID:       "claude-code",
				Command:  "claude",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusOK,
				Path:     "/Users/me/.local/bin/claude",
			},
			{
				ID:       "codex",
				Command:  "codex",
				Category: doctorCategoryAgent,
				Required: false,
				Status:   doctorStatusMissing,
				Message:  "Codex sessions are unavailable until the codex CLI is on PATH.",
			},
		},
	}
}

func fakeLookup(paths map[string]string) executableLookup {
	return func(command string) (string, error) {
		if path, ok := paths[command]; ok {
			return path, nil
		}
		return "", errors.New("not found")
	}
}

func fakeZellijLookup(path string, source string) zellijBinaryLookup {
	return func() (durabilityprovider.ZellijBinary, error) {
		return durabilityprovider.ZellijBinary{Path: path, Source: source}, nil
	}
}
