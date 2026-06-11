package terminal

import (
	"fmt"
	"strings"
	"testing"

	vt "github.com/charmbracelet/x/vt"
)

// feed pushes raw PTY output through the session terminal's broadcast path,
// exactly as the read loop does for live process output. This drives the
// authoritative server-side emulator.
func feed(term *sessionTerminal, chunks ...string) {
	for _, chunk := range chunks {
		term.broadcast([]byte(chunk))
	}
}

// TestSnapshotReconstructsAltScreenTUI is the fidelity headline test for
// Option B. It drives an alt-screen TUI into the live emulator, captures the
// attach snapshot, replays that snapshot into a second fresh emulator, and
// asserts the reconstructed screen, alt-screen mode, and cursor position match
// the live emulator exactly. It also asserts the snapshot is NOT the raw byte
// tail (which is what made the old design unable to repaint a long-lived TUI).
func TestSnapshotReconstructsAltScreenTUI(t *testing.T) {
	const cols, rows = 40, 12
	cfg := SessionConfig{ID: "tui", InitialCols: cols, InitialRows: rows}
	term := newSessionTerminal(cfg, newFakeProcess(), defaultScrollback, 0)
	t.Cleanup(func() { _ = term.close() })

	// Simulate a long-lived TUI: it enters the alternate screen, draws a boxed
	// title and a body line at specific positions, styles some text, and parks
	// the cursor. In the real bug, the alt-screen-enter bytes have long since
	// aged out of any byte window by the time a new client attaches.
	feed(term,
		"\x1b[?1049h",   // enter alternate screen
		"\x1b[2J\x1b[H", // clear + home
		"\x1b[2;5H",     // row 2, col 5
		"┌────────────┐", // box top
		"\x1b[3;5H│ ",                  // row 3
		"\x1b[1;32mAGENT READY\x1b[0m", // bold green text
		" │",
		"\x1b[4;5H└────────────┘", // box bottom
		"\x1b[6;1H",                      // row 6
		"status: \x1b[33mrunning\x1b[0m", // yellow status
		"\x1b[9;14H",                     // park the cursor mid-screen
	)

	// Capture the attach snapshot exactly as a newly connected client receives it.
	term.mu.Lock()
	snapshot := term.snapshot()
	wantScreen := term.emulator.String()
	wantAlt := term.emulator.IsAltScreen()
	wantCursor := term.emulator.CursorPosition()
	wantRender := term.emulator.Render()
	term.mu.Unlock()

	// 1. Replay the snapshot into a fresh emulator (a brand-new client's terminal).
	fresh := vt.NewSafeEmulator(cols, rows)
	if _, err := fresh.Write(snapshot); err != nil {
		t.Fatalf("write snapshot into fresh emulator: %v", err)
	}

	// 2. The reconstructed screen must equal the live screen, byte for byte.
	if got := fresh.String(); got != wantScreen {
		t.Fatalf("screen mismatch after snapshot replay:\n--- want ---\n%q\n--- got ---\n%q", wantScreen, got)
	}

	// 3. Styled render (SGR attributes) must match too, proving colors/bold survive.
	if got := fresh.Render(); got != wantRender {
		t.Fatalf("styled render mismatch after snapshot replay:\n--- want ---\n%q\n--- got ---\n%q", wantRender, got)
	}

	// 4. Alt-screen mode must be reconstructed.
	if !wantAlt {
		t.Fatal("test setup error: live emulator should be in alt screen")
	}
	if !fresh.IsAltScreen() {
		t.Fatal("snapshot did not put the fresh emulator into the alternate screen")
	}

	// 5. Cursor position must be reconstructed exactly.
	if got := fresh.CursorPosition(); got != wantCursor {
		t.Fatalf("cursor mismatch after snapshot replay: want %+v got %+v", wantCursor, got)
	}

	// 6. Sanity: the human-visible content actually made it across.
	if !strings.Contains(fresh.String(), "AGENT READY") || !strings.Contains(fresh.String(), "running") {
		t.Fatalf("reconstructed screen missing expected content: %q", fresh.String())
	}

	// 7. Prove the snapshot is a repaint, not a replay of the input tail: the
	//    snapshot must explicitly re-enter the alternate screen.
	if !strings.Contains(string(snapshot), "\x1b[?1049h") {
		t.Fatalf("snapshot did not re-establish alt screen mode: %q", string(snapshot))
	}
}

// TestSnapshotReconstructsNormalScreenWithScrollback proves the normal-screen
// (shell) case: scrolled-off history is preserved and the visible grid plus
// cursor are reconstructed faithfully.
func TestSnapshotReconstructsNormalScreenWithScrollback(t *testing.T) {
	const cols, rows = 20, 4
	cfg := SessionConfig{ID: "shell", InitialCols: cols, InitialRows: rows}
	term := newSessionTerminal(cfg, newFakeProcess(), defaultScrollback, 0)
	t.Cleanup(func() { _ = term.close() })

	// Print more lines than the viewport height so the earliest lines scroll off
	// into the scrollback buffer. The emulator stays on the normal screen.
	var input strings.Builder
	for i := 1; i <= 8; i++ {
		fmt.Fprintf(&input, "line-%d\r\n", i)
	}
	input.WriteString("prompt$ ")
	feed(term, input.String())

	term.mu.Lock()
	snapshot := term.snapshot()
	wantVisible := term.emulator.String()
	wantCursor := term.emulator.CursorPosition()
	wantAlt := term.emulator.IsAltScreen()
	scrollbackLen := term.emulator.ScrollbackLen()
	term.mu.Unlock()

	if wantAlt {
		t.Fatal("normal-screen session should not be in the alternate screen")
	}
	if scrollbackLen == 0 {
		t.Fatal("expected lines to have scrolled into the scrollback buffer")
	}

	fresh := vt.NewSafeEmulator(cols, rows)
	if _, err := fresh.Write(snapshot); err != nil {
		t.Fatalf("write snapshot into fresh emulator: %v", err)
	}

	// Visible grid must match exactly.
	if got := fresh.String(); got != wantVisible {
		t.Fatalf("visible screen mismatch:\n--- want ---\n%q\n--- got ---\n%q", wantVisible, got)
	}
	if fresh.IsAltScreen() {
		t.Fatal("snapshot wrongly put a normal-screen session into the alternate screen")
	}
	if got := fresh.CursorPosition(); got != wantCursor {
		t.Fatalf("cursor mismatch: want %+v got %+v", wantCursor, got)
	}

	// The latest content (the prompt and the last lines) must be visible.
	if !strings.Contains(fresh.String(), "prompt$") || !strings.Contains(fresh.String(), "line-8") {
		t.Fatalf("reconstructed visible screen missing tail content: %q", fresh.String())
	}

	// Scrolled-off history must be replayed into the fresh client's scrollback so
	// the user can scroll back up to the earliest lines.
	if got := fresh.ScrollbackLen(); got == 0 {
		t.Fatal("snapshot did not replay any scrollback history")
	}
	var history strings.Builder
	if sb := fresh.Scrollback(); sb != nil {
		for _, line := range sb.Lines() {
			history.WriteString(line.String())
			history.WriteByte('\n')
		}
	}
	if !strings.Contains(history.String(), "line-1") {
		t.Fatalf("earliest scrolled-off line not preserved in snapshot history: %q", history.String())
	}
}

// TestSnapshotIsNotRawByteTail nails the core regression: the snapshot is a
// reconstructed repaint, distinct from the raw bytes that were written. A long
// stream whose setup bytes would have aged out of any fixed byte window still
// produces a correct screen.
func TestSnapshotIsNotRawByteTail(t *testing.T) {
	const cols, rows = 30, 6
	cfg := SessionConfig{ID: "tui", InitialCols: cols, InitialRows: rows}
	term := newSessionTerminal(cfg, newFakeProcess(), defaultScrollback, 0)
	t.Cleanup(func() { _ = term.close() })

	// Enter alt screen, then emit a large volume of churn (repeated repaints)
	// that would overflow any small byte buffer, the way a real TUI redraws.
	feed(term, "\x1b[?1049h")
	for i := 0; i < 500; i++ {
		feed(term, fmt.Sprintf("\x1b[2J\x1b[H\x1b[1;1Hframe %d of churn", i))
	}
	feed(term, "\x1b[2J\x1b[H\x1b[2;3HFINAL FRAME\x1b[4;1Hdone")

	term.mu.Lock()
	snapshot := term.snapshot()
	wantScreen := term.emulator.String()
	term.mu.Unlock()

	// The snapshot is bounded by screen size, not by the volume of churn fed in.
	if len(snapshot) > 4096 {
		t.Fatalf("snapshot unexpectedly large (%d bytes); it should be screen-bounded, not stream-bounded", len(snapshot))
	}

	fresh := vt.NewSafeEmulator(cols, rows)
	if _, err := fresh.Write(snapshot); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}
	if got := fresh.String(); got != wantScreen {
		t.Fatalf("snapshot did not reconstruct final screen:\n--- want ---\n%q\n--- got ---\n%q", wantScreen, got)
	}
	if !strings.Contains(fresh.String(), "FINAL FRAME") || strings.Contains(fresh.String(), "churn") {
		t.Fatalf("expected only the final frame, got %q", fresh.String())
	}
}
