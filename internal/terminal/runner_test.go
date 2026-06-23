package terminal

import (
	"bytes"
	"context"
	"io"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestPTYRunnerSmoke(t *testing.T) {
	ctx := context.Background()
	deadline := time.After(5 * time.Second)

	process, err := NewPTYRunner().Start(ctx, StartOptions{
		Cols: 80,
		Rows: 24,
	})
	if err != nil {
		t.Fatalf("start pty runner: %v", err)
	}
	defer process.Close()

	command, marker := terminalSmokeCommand("yyork-runner-smoke")
	output := make(chan string, 1)
	go func() {
		var buf bytes.Buffer
		chunk := make([]byte, 4096)
		for {
			n, err := process.Read(chunk)
			if n > 0 {
				buf.Write(chunk[:n])
				if strings.Contains(buf.String(), marker) {
					output <- buf.String()
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					output <- buf.String()
				}
				return
			}
		}
	}()

	if _, err := process.Write([]byte(command)); err != nil {
		t.Fatalf("write command: %v", err)
	}

	select {
	case got := <-output:
		if !strings.Contains(got, marker) {
			t.Fatalf("expected output to contain %q, got %q", marker, got)
		}
	case <-deadline:
		t.Fatal("timed out waiting for pty output")
	}
}

func terminalSmokeCommand(prefix string) (command string, expectedOutput string) {
	if runtime.GOOS == "windows" {
		return "echo " + prefix + "\r", prefix
	}

	return "printf " + prefix + "-$((21*2))\r", prefix + "-42"
}

// The attach client's env can become a resurrected zellij server's env, so it
// must never carry color-disabling vars from an agent/CI-launched backend
// (Codex CLI exports NO_COLOR=1 and a blank COLORTERM).
func TestMergeTerminalEnvNormalizesColorVars(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("color env normalization is POSIX-only")
	}

	env := mergeTerminalEnv(
		[]string{"NO_COLOR=1", "COLORTERM=", "TERM=dumb", "KEEP=yes"},
		[]string{"YYORK_SESSION_ID=abc"},
	)

	got := map[string]string{}
	for _, pair := range env {
		key, value, ok := strings.Cut(pair, "=")
		if !ok {
			continue
		}
		if _, dup := got[key]; dup {
			t.Fatalf("duplicate env key %q in %v", key, env)
		}
		got[key] = value
	}

	if value, present := got["NO_COLOR"]; present {
		t.Fatalf("NO_COLOR=%q survived mergeTerminalEnv", value)
	}
	if got["COLORTERM"] != "truecolor" {
		t.Fatalf("COLORTERM = %q, want truecolor", got["COLORTERM"])
	}
	if got["TERM"] != "xterm-256color" {
		t.Fatalf("TERM = %q, want xterm-256color", got["TERM"])
	}
	if got["KEEP"] != "yes" {
		t.Fatalf("KEEP = %q, want yes", got["KEEP"])
	}
	if got["YYORK_SESSION_ID"] != "abc" {
		t.Fatalf("YYORK_SESSION_ID = %q, want abc", got["YYORK_SESSION_ID"])
	}
}
