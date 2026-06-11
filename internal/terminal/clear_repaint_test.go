package terminal

import (
	"fmt"
	"strings"
	"testing"
)

// These are GROUND-TRUTH diagnostics for the "garbled text after clear" report
// (wide tables that wrap, stacked on top of each other after a clear). They feed
// that exact shape of output straight into the authoritative server-side vt
// emulator and inspect what the emulator believes is on screen.
//
// Reading the results:
//   - If the emulator's Render()/snapshot is CLEAN here, the garble lives in the
//     CLIENT renderer (xterm.js) and the right fix is a server snapshot
//     re-push ("refresh" control message) — repaint from authoritative state.
//   - If Render()/snapshot is itself GARBLED, the bug is in vt state handling or
//     snapshot() reconstruction, and a repaint would only re-paint garbage.

// clearSequence mirrors what the `clear` command emits under
// TERM=xterm-256color: home (CUP), erase-display (ED 2), and erase-scrollback
// (ED 3 / the E3 capability). The web client's reset sequence uses the same
// three operations (see terminal-panel.tsx).
const clearSequence = "\x1b[H\x1b[2J\x1b[3J"

// wideScrollingOutput prints `lines` rows, each ~`widthMult`× the viewport width
// so every row wraps across multiple grid rows, and enough total rows that the
// earliest ones scroll off into the scrollback buffer. This is the precondition
// the report points at: a populated scroll buffer plus wrapped wide content.
func wideScrollingOutput(cols, lines, widthMult int) string {
	var b strings.Builder
	for i := range lines {
		fmt.Fprintf(&b, "row-%02d ", i)
		b.WriteString(strings.Repeat("=", cols*widthMult))
		b.WriteString("\r\n")
	}
	return b.String()
}

// TestClearWipesScreenAndScrollback drives wide, wrapping, scrolling output into
// the emulator, then issues a `clear`, and asserts the emulator screen, styled
// render, scrollback, AND the attach snapshot a reconnecting client would get are
// all clean. A failure here localizes the bug to vt/snapshot, not the client.
func TestClearWipesScreenAndScrollback(t *testing.T) {
	const cols, rows = 100, 30
	cfg := SessionConfig{ID: "clear", InitialCols: cols, InitialRows: rows}
	term := newSessionTerminal(cfg, newFakeProcess(), defaultScrollback, 0)
	t.Cleanup(func() { _ = term.close() })

	feed(term, wideScrollingOutput(cols, 60, 3))

	term.mu.Lock()
	beforeScrollback := term.emulator.ScrollbackLen()
	term.mu.Unlock()
	if beforeScrollback == 0 {
		t.Fatal("setup: expected wide scrolling output to populate the scroll buffer")
	}
	t.Logf("pre-clear scrollback: %d lines", beforeScrollback)

	feed(term, clearSequence)

	term.mu.Lock()
	screen := term.emulator.String()
	render := term.emulator.Render()
	afterScrollback := term.emulator.ScrollbackLen()
	snapshot := term.snapshot()
	term.mu.Unlock()

	t.Logf("post-clear scrollback: %d lines", afterScrollback)
	t.Logf("post-clear screen=%q", screen)
	t.Logf("post-clear snapshot len=%d bytes", len(snapshot))

	if strings.TrimSpace(screen) != "" {
		t.Errorf("screen not blank after clear:\n%q", screen)
	}
	if strings.Contains(render, "=") || strings.Contains(render, "row-") {
		t.Errorf("residual wide-table content survived clear in Render():\n%q", render)
	}
	if afterScrollback != 0 {
		t.Errorf("scrollback not cleared by ED 3 (\\x1b[3J): still %d lines", afterScrollback)
	}

	replayed := renderSnapshot(t, snapshot, cols, rows)
	if strings.Contains(replayed, "=") || strings.Contains(replayed, "row-") {
		t.Errorf("snapshot after clear replays stale content into a fresh client:\n%q", replayed)
	}
}

// TestSnapshotReplayUnderWidthMismatch isolates the realistic client scenario:
// the attach snapshot is produced at the emulator's width, but a freshly-fitted
// xterm.js grid may momentarily be a different width when it applies that
// snapshot. snapshot() paints each grid row at an absolute column-1 position; a
// row that is exactly the emulator width can trigger the receiving terminal's
// pending-wrap and bleed into the next row when the receiver is NARROWER. This
// test logs the reconstructed screen at narrower/matched/wider client widths so
// we can see whether width drift, not the clear, is the garble source.
func TestSnapshotReplayUnderWidthMismatch(t *testing.T) {
	const cols, rows = 100, 30
	cfg := SessionConfig{ID: "mismatch", InitialCols: cols, InitialRows: rows}
	term := newSessionTerminal(cfg, newFakeProcess(), defaultScrollback, 0)
	t.Cleanup(func() { _ = term.close() })

	// A boxed wide "table" row plus a couple of normal rows, no clear.
	feed(term,
		"\x1b[H",
		"┌"+strings.Repeat("─", cols-2)+"┐\r\n",
		"│ wide table cell that fills the row "+strings.Repeat("x", cols-40)+"│\r\n",
		"└"+strings.Repeat("─", cols-2)+"┘\r\n",
		"tail line after the table\r\n",
	)

	term.mu.Lock()
	want := term.emulator.String()
	snapshot := term.snapshot()
	term.mu.Unlock()

	for _, clientCols := range []int{cols - 20, cols, cols + 20} {
		replayed := renderSnapshot(t, snapshot, clientCols, rows)
		match := strings.Contains(replayed, "wide table cell") &&
			strings.Contains(replayed, "tail line after the table")
		t.Logf("client width %d: contentIntact=%v\n%s", clientCols, match, replayed)
		if clientCols == cols && replayed != want {
			t.Errorf("matched-width replay diverged from live screen:\n--- want ---\n%q\n--- got ---\n%q", want, replayed)
		}
	}
}
