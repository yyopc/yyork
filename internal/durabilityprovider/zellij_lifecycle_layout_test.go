package durabilityprovider

import (
	"os"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/session"
)

// The launch layout must contain nothing but the agent pane: no tab-bar or
// status-bar plugin panes, no pane frame. A yyork session has to be
// indistinguishable from a bare terminal running the agent CLI.
func TestWriteLaunchLayoutHasNoZellijChrome(t *testing.T) {
	path, err := writeLaunchLayout([]string{"claude", "--flag", "hello world"}, "/tmp/project")
	if err != nil {
		t.Fatalf("writeLaunchLayout: %v", err)
	}
	defer func() { _ = os.Remove(path) }()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	content := string(data)

	for _, banned := range []string{"plugin", "tab-bar", "status-bar"} {
		if strings.Contains(content, banned) {
			t.Errorf("layout contains zellij chrome %q:\n%s", banned, content)
		}
	}
	if !strings.Contains(content, "borderless=true") {
		t.Errorf("agent pane should be borderless:\n%s", content)
	}
	if got := strings.Count(content, "pane "); got != 1 {
		t.Errorf("layout has %d panes, want exactly 1 (the agent pane):\n%s", got, content)
	}
	if !strings.Contains(content, `cwd="/tmp/project"`) {
		t.Errorf("layout missing cwd:\n%s", content)
	}
	if !strings.Contains(content, "'hello world'") {
		t.Errorf("layout lost launch command quoting:\n%s", content)
	}
}

func TestTerminalHostLaunchCommandWrapsAgent(t *testing.T) {
	cmd, err := terminalHostLaunchCommand(session.CreateOpts{
		Name:      "sess-1",
		Cwd:       "/tmp/project",
		LaunchCmd: []string{"codex", "--no-alt-screen", "--", "do it"},
	})
	if err != nil {
		t.Fatalf("terminalHostLaunchCommand: %v", err)
	}

	joined := strings.Join(cmd, "\x00")
	for _, want := range []string{
		"terminal-host",
		"--session",
		"sess-1",
		"--socket",
		"--cwd",
		"/tmp/project",
		"bash",
		"-c",
		"codex --no-alt-screen -- 'do it'; exec",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("host command missing %q:\n%#v", want, cmd)
		}
	}
}
