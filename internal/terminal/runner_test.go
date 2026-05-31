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

	command, marker := terminalSmokeCommand("better-ao-runner-smoke")
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
