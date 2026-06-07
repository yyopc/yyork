package logging

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"

	charm "github.com/charmbracelet/log"
)

func TestLevelFromEnv(t *testing.T) {
	cases := map[string]charm.Level{
		"debug":   charm.DebugLevel,
		"DEBUG":   charm.DebugLevel,
		"warn":    charm.WarnLevel,
		"warning": charm.WarnLevel,
		"error":   charm.ErrorLevel,
		"info":    charm.InfoLevel,
		"":        charm.InfoLevel,
		"nonsense": charm.InfoLevel,
	}

	for value, want := range cases {
		t.Setenv("YYORK_LOG_LEVEL", value)
		if got := levelFromEnv(); got != want {
			t.Fatalf("levelFromEnv(%q) = %v, want %v", value, got, want)
		}
	}
}

func TestSetupInstallsStructuredDefault(t *testing.T) {
	old := slog.Default()
	t.Cleanup(func() { slog.SetDefault(old) })

	var buf bytes.Buffer
	Setup(&buf)

	slog.Info("server started", "url", "http://127.0.0.1:7331")

	out := buf.String()
	for _, want := range []string{"INFO", "server started", "url", "http://127.0.0.1:7331"} {
		if !strings.Contains(out, want) {
			t.Fatalf("log output missing %q:\n%s", want, out)
		}
	}
}

func TestSetupRespectsLevelFromEnv(t *testing.T) {
	old := slog.Default()
	t.Cleanup(func() { slog.SetDefault(old) })

	t.Setenv("YYORK_LOG_LEVEL", "error")
	var buf bytes.Buffer
	Setup(&buf)

	slog.Info("should be filtered out")
	slog.Error("should appear")

	out := buf.String()
	if strings.Contains(out, "should be filtered out") {
		t.Fatalf("info log leaked at error level:\n%s", out)
	}
	if !strings.Contains(out, "should appear") {
		t.Fatalf("error log missing:\n%s", out)
	}
}

// A non-terminal writer (here, a buffer) yields a plain, ANSI-free banner so
// the structured content is still assertable and pipe-safe.
func TestBannerPlainOnNonTTY(t *testing.T) {
	var buf bytes.Buffer
	Banner(&buf, "yyork", [][2]string{
		{"server", "http://127.0.0.1:7331"},
		{"store", "/home/u/.yyork/state.db"},
	})

	out := buf.String()
	if strings.Contains(out, "\x1b[") {
		t.Fatalf("banner emitted ANSI escapes on a non-TTY writer:\n%q", out)
	}
	for _, want := range []string{"yyork", "server", "http://127.0.0.1:7331", "store", "/home/u/.yyork/state.db"} {
		if !strings.Contains(out, want) {
			t.Fatalf("banner missing %q:\n%s", want, out)
		}
	}
}
