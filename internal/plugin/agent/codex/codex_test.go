package codex

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/yyovil/better-ao/internal/plugin/agent"
)

func TestGetLaunchCommandBuildsCrossPlatformArgv(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	cmd, err := plugin.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		Permissions:      agent.PermissionModeFullAccess,
		Prompt:           "-fix this",
		SystemPromptFile: filepath.Join("tmp", "prompt with spaces.md"),
		SystemPrompt:     "ignored",
	})
	if err != nil {
		t.Fatal(err)
	}

	want := []string{
		"codex",
		"-c", "check_for_update_on_startup=false",
		"--ask-for-approval", "never",
		"-c", "model_instructions_file=" + filepath.Join("tmp", "prompt with spaces.md"),
		"--", "-fix this",
	}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("unexpected command\nwant: %#v\n got: %#v", want, cmd)
	}
}

func TestGetLaunchCommandMapsApprovalModes(t *testing.T) {
	tests := []struct {
		name        string
		permission  agent.PermissionMode
		want        []string
		notExpected string
	}{
		{
			name:       "default",
			permission: agent.PermissionModeDefault,
			want:       []string{"--ask-for-approval", "on-request"},
		},
		{
			name:       "auto review",
			permission: agent.PermissionModeAutoReview,
			want:       []string{"--ask-for-approval", "on-request", "-c", `approvals_reviewer="auto_review"`},
		},
		{
			name:        "empty",
			permission:  "",
			notExpected: "--ask-for-approval",
		},
		{
			name:       "legacy skip",
			permission: agent.PermissionMode("skip"),
			want:       []string{"--ask-for-approval", "never"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			plugin := &Plugin{resolvedBinary: "codex"}
			cmd, err := plugin.GetLaunchCommand(context.Background(), agent.LaunchConfig{
				Permissions: tt.permission,
			})
			if err != nil {
				t.Fatal(err)
			}
			if len(tt.want) > 0 && !containsSubsequence(cmd, tt.want) {
				t.Fatalf("command %#v does not contain %#v", cmd, tt.want)
			}
			if tt.notExpected != "" && contains(cmd, tt.notExpected) {
				t.Fatalf("command %#v contains %q", cmd, tt.notExpected)
			}
		})
	}
}

func TestGetPromptDeliveryStrategyIsInCommand(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	got, err := plugin.GetPromptDeliveryStrategy(context.Background(), agent.LaunchConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if got != agent.PromptDeliveryInCommand {
		t.Fatalf("unexpected strategy: %q", got)
	}
}

func TestGetConfigSpecHasNoCustomFieldsYet(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	spec, err := plugin.GetConfigSpec(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(spec.Fields) != 0 {
		t.Fatalf("unexpected config fields: %#v", spec.Fields)
	}
}

func TestGetAgentHooksIsNoop(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	if err := plugin.GetAgentHooks(context.Background(), agent.WorkspaceHookConfig{
		DataDir:       t.TempDir(),
		SessionID:     "sess-1",
		WorkspacePath: t.TempDir(),
	}); err != nil {
		t.Fatal(err)
	}
}

// In v1, GetRestoreCommand is a no-op regardless of what the caller passes
// in. Resume is deferred to a future slice. The hook plumbing will populate
// session metadata with codexThreadId, and this method will eventually use
// it — but for now, callers always get (nil, false, nil).
func TestGetRestoreCommandIsNoop(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	cases := []struct {
		name string
		ref  agent.SessionRef
	}{
		{"empty session ref", agent.SessionRef{}},
		{
			"session ref with thread id metadata",
			agent.SessionRef{Metadata: map[string]string{codexThreadIDMetadataKey: "thread-123"}},
		},
		{
			"session ref with workspace path",
			agent.SessionRef{WorkspacePath: "/some/path"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cmd, ok, err := plugin.GetRestoreCommand(context.Background(), agent.RestoreConfig{
				Permissions: agent.PermissionModeAutoReview,
				Session:     tc.ref,
			})
			if err != nil {
				t.Fatalf("err = %v, want nil", err)
			}
			if ok {
				t.Fatalf("ok = true, want false")
			}
			if cmd != nil {
				t.Fatalf("cmd = %#v, want nil", cmd)
			}
		})
	}
}

// In v1, SessionInfo is a no-op. No agent-native session id, transcript
// path, or metadata is surfaced through the plugin.
func TestSessionInfoIsNoop(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	info, ok, err := plugin.SessionInfo(context.Background(), agent.SessionRef{
		WorkspacePath: "/some/path",
		Metadata:      map[string]string{codexThreadIDMetadataKey: "thread-123"},
	})
	if err != nil {
		t.Fatalf("err = %v, want nil", err)
	}
	if ok {
		t.Fatalf("ok = true, want false")
	}
	if !reflect.DeepEqual(info, agent.SessionInfo{}) {
		t.Fatalf("info = %#v, want zero value", info)
	}
}

func contains(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func containsSubsequence(values []string, needle []string) bool {
	if len(needle) == 0 {
		return true
	}

	for start := range values {
		if start+len(needle) > len(values) {
			return false
		}
		ok := true
		for offset, want := range needle {
			if values[start+offset] != want {
				ok = false
				break
			}
		}
		if ok {
			return true
		}
	}

	return false
}
