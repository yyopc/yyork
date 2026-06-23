package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
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
		"yyork doctor passed.",
		"git",
		"zellij",
		"claude-code",
		"/Users/me/.local/bin/claude",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("doctor output missing %q:\n%s", want, text)
		}
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

func fakeLookup(paths map[string]string) executableLookup {
	return func(command string) (string, error) {
		if path, ok := paths[command]; ok {
			return path, nil
		}
		return "", errors.New("not found")
	}
}
