package terminal

import (
	"bytes"
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"
)

// TestResolveStrategyPrecedence asserts the selector rule: an explicit config
// field overrides the env var, the env var overrides the default, and the
// default is the direct terminal-host strategy. Invalid values fall through to
// the next source. Legacy strategy names are accepted as aliases.
func TestResolveStrategyPrecedence(t *testing.T) {
	t.Run("default when unset", func(t *testing.T) {
		t.Setenv("YYORK_TERMINAL_ATTACH", "")
		if got := resolveStrategy(""); got != StrategyDirect {
			t.Fatalf("expected default %q, got %q", StrategyDirect, got)
		}
	})

	t.Run("default when invalid", func(t *testing.T) {
		t.Setenv("YYORK_TERMINAL_ATTACH", "bogus")
		if got := resolveStrategy("nonsense"); got != StrategyDirect {
			t.Fatalf("expected invalid values to fall through to default %q, got %q", StrategyDirect, got)
		}
	})

	t.Run("env legacy alias overrides default", func(t *testing.T) {
		t.Setenv("YYORK_TERMINAL_ATTACH", string(StrategyPerClient))
		if got := resolveStrategy(""); got != StrategyDirect {
			t.Fatalf("expected env alias to select %q, got %q", StrategyDirect, got)
		}
	})

	t.Run("config field overrides env", func(t *testing.T) {
		t.Setenv("YYORK_TERMINAL_ATTACH", string(StrategyPerClient))
		if got := resolveStrategy(StrategyDirect); got != StrategyDirect {
			t.Fatalf("expected config field to override env, got %q", got)
		}
	})

	t.Run("invalid config field falls through to env", func(t *testing.T) {
		t.Setenv("YYORK_TERMINAL_ATTACH", string(StrategyEmulator))
		if got := resolveStrategy("garbage"); got != StrategyDirect {
			t.Fatalf("expected invalid config field to fall through to env alias %q, got %q", StrategyDirect, got)
		}
	})

	t.Run("NewManager resolves and exposes the strategy", func(t *testing.T) {
		t.Setenv("YYORK_TERMINAL_ATTACH", "")
		m := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient})
		t.Cleanup(func() { _ = m.Close() })
		if got := m.Strategy(); got != StrategyDirect {
			t.Fatalf("expected manager strategy %q, got %q", StrategyDirect, got)
		}
	})
}

// --- shared test doubles ---------------------------------------------------

type fakeRunner struct {
	mu        sync.Mutex
	options   []StartOptions
	processes []*fakeProcess
}

func (r *fakeRunner) Start(_ context.Context, opts StartOptions) (Process, error) {
	process := newFakeProcess()
	process.cols = opts.Cols
	process.rows = opts.Rows

	r.mu.Lock()
	r.options = append(r.options, StartOptions{
		Command: append([]string(nil), opts.Command...),
		CWD:     opts.CWD,
		Cols:    opts.Cols,
		Env:     append([]string(nil), opts.Env...),
		Rows:    opts.Rows,
	})
	r.processes = append(r.processes, process)
	r.mu.Unlock()

	return process, nil
}

func (r *fakeRunner) lastProcess() *fakeProcess {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.processes[len(r.processes)-1]
}

func (r *fakeRunner) startCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.processes)
}

func (r *fakeRunner) lastStartOptions() StartOptions {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.options[len(r.options)-1]
}

type fakeProcess struct {
	closed  bool
	cols    int
	done    sync.Once
	mu      sync.Mutex
	output  chan fakeRead
	rows    int
	waitErr error
	written bytes.Buffer
}

type fakeRead struct {
	data []byte
	err  error
}

func newFakeProcess() *fakeProcess {
	return &fakeProcess{
		output: make(chan fakeRead, 8),
	}
}

func (p *fakeProcess) Read(buf []byte) (int, error) {
	read, ok := <-p.output
	if !ok {
		return 0, io.EOF
	}

	n := copy(buf, read.data)
	return n, read.err
}

func (p *fakeProcess) Write(buf []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.written.Write(buf)
}

func (p *fakeProcess) Close() error {
	p.mu.Lock()
	p.closed = true
	p.mu.Unlock()
	p.finish(io.EOF)
	return nil
}

func (p *fakeProcess) Resize(cols int, rows int) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.cols = cols
	p.rows = rows
	return nil
}

func (p *fakeProcess) Wait() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.waitErr
}

func (p *fakeProcess) emit(data []byte) {
	p.output <- fakeRead{data: data}
}

func (p *fakeProcess) finish(err error) {
	p.done.Do(func() {
		p.mu.Lock()
		p.waitErr = errors.Join(p.waitErr, err)
		p.mu.Unlock()
		close(p.output)
	})
}

// --- shared polling helpers ------------------------------------------------

func waitForLastProcess(t *testing.T, runner *fakeRunner) *fakeProcess {
	t.Helper()
	waitForStartCount(t, runner, 1)
	return runner.lastProcess()
}

func waitForStartCount(t *testing.T, runner *fakeRunner, want int) {
	t.Helper()

	deadline := time.After(time.Second)
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()

	for {
		if got := runner.startCount(); got >= want {
			if got > want {
				t.Fatalf("expected %d attach starts, got %d", want, got)
			}
			return
		}

		select {
		case <-deadline:
			t.Fatalf("timed out waiting for %d attach starts, got %d", want, runner.startCount())
		case <-tick.C:
		}
	}
}

func waitForProcessSize(t *testing.T, process *fakeProcess, expectedCols int, expectedRows int) {
	t.Helper()

	deadline := time.After(time.Second)
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()

	for {
		process.mu.Lock()
		cols := process.cols
		rows := process.rows
		process.mu.Unlock()

		if cols == expectedCols && rows == expectedRows {
			return
		}

		select {
		case <-deadline:
			t.Fatalf("timed out waiting for process size %dx%d, got %dx%d", expectedCols, expectedRows, cols, rows)
		case <-tick.C:
		}
	}
}

func waitForProcessInput(t *testing.T, process *fakeProcess, expected string) {
	t.Helper()

	deadline := time.After(time.Second)
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()

	for {
		process.mu.Lock()
		written := process.written.String()
		process.mu.Unlock()

		if written == expected {
			return
		}

		select {
		case <-deadline:
			t.Fatalf("timed out waiting for process input %q, got %q", expected, written)
		case <-tick.C:
		}
	}
}

func waitForProcessWritten(t *testing.T, process *fakeProcess, substr string) {
	t.Helper()

	deadline := time.After(2 * time.Second)
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()

	for {
		process.mu.Lock()
		written := append([]byte(nil), process.written.Bytes()...)
		process.mu.Unlock()

		if bytes.Contains(written, []byte(substr)) {
			return
		}

		select {
		case <-deadline:
			t.Fatalf("timed out waiting for process to receive %q, got %q", substr, written)
		case <-tick.C:
		}
	}
}

func waitForProcessClosed(t *testing.T, process *fakeProcess) {
	t.Helper()

	deadline := time.After(time.Second)
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()

	for {
		process.mu.Lock()
		closed := process.closed
		process.mu.Unlock()

		if closed {
			return
		}

		select {
		case <-deadline:
			t.Fatal("timed out waiting for process to close")
		case <-tick.C:
		}
	}
}

// waitForManagerSessionRemoved waits until sessionID is absent from the direct
// attach bookkeeping map.
func waitForManagerSessionRemoved(t *testing.T, manager *Manager, sessionID string) {
	t.Helper()

	deadline := time.After(time.Second)
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()

	for {
		manager.mu.Lock()
		_, perClient := manager.perClient[sessionID]
		manager.mu.Unlock()

		if !perClient {
			return
		}

		select {
		case <-deadline:
			t.Fatalf("timed out waiting for manager session %q to be removed", sessionID)
		case <-tick.C:
		}
	}
}
