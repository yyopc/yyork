package terminal

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"sync"
	"time"

	"github.com/yyopc/yyork/internal/terminalipc"
)

const terminalHostDialTimeout = 2 * time.Second

type socketProcess struct {
	conn    net.Conn
	readBuf []byte
	readMu  sync.Mutex
	writeMu sync.Mutex
}

func dialTerminalHost(ctx context.Context, socketPath string) (Process, error) {
	dialCtx, cancel := context.WithTimeout(ctx, terminalHostDialTimeout)
	defer cancel()
	dialer := net.Dialer{}

	var lastErr error
	for {
		if _, err := os.Stat(socketPath); err != nil {
			lastErr = err
		} else {
			conn, err := dialer.DialContext(dialCtx, "unix", socketPath)
			if err == nil {
				return &socketProcess{conn: conn}, nil
			}
			lastErr = err
		}

		select {
		case <-dialCtx.Done():
			if lastErr != nil {
				return nil, fmt.Errorf("dial terminal host %s: %w", socketPath, lastErr)
			}
			return nil, dialCtx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
}

func (p *socketProcess) Read(buf []byte) (int, error) {
	p.readMu.Lock()
	defer p.readMu.Unlock()

	for len(p.readBuf) == 0 {
		frameType, payload, err := terminalipc.ReadFrame(p.conn)
		if err != nil {
			return 0, err
		}
		if frameType != terminalipc.FrameOutput {
			return 0, fmt.Errorf("unexpected terminal host frame type %d", frameType)
		}
		p.readBuf = payload
	}

	n := copy(buf, p.readBuf)
	p.readBuf = p.readBuf[n:]
	return n, nil
}

func (p *socketProcess) Write(buf []byte) (int, error) {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if err := terminalipc.WriteFrame(p.conn, terminalipc.FrameInput, buf); err != nil {
		return 0, err
	}
	return len(buf), nil
}

func (p *socketProcess) Resize(cols int, rows int) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	return terminalipc.WriteFrame(p.conn, terminalipc.FrameResize, terminalipc.EncodeResize(cols, rows))
}

func (p *socketProcess) Close() error {
	return p.conn.Close()
}

func (p *socketProcess) Wait() error {
	_, err := io.Copy(io.Discard, p)
	if errors.Is(err, net.ErrClosed) || errors.Is(err, io.EOF) {
		return nil
	}
	return err
}
