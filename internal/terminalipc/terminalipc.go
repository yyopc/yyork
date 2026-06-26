package terminalipc

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/yyopc/yyork/internal/paths"
)

const (
	FrameOutput byte = 1
	FrameInput  byte = 2
	FrameResize byte = 3

	maxFrameSize = 4 * 1024 * 1024
)

func SocketPath(sessionName string) (string, error) {
	sessionName = sanitizeSessionName(sessionName)
	if sessionName == "" {
		return "", errors.New("terminal ipc socket requires a session name")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("terminal ipc socket home: %w", err)
	}
	return filepath.Join(home, paths.DataDirName, "terminal", sessionName+".sock"), nil
}

func EnsureSocketDir(socketPath string) error {
	if strings.TrimSpace(socketPath) == "" {
		return errors.New("terminal ipc socket path is required")
	}
	return os.MkdirAll(filepath.Dir(socketPath), 0o755)
}

func WriteFrame(w io.Writer, frameType byte, payload []byte) error {
	if len(payload) > maxFrameSize {
		return fmt.Errorf("terminal ipc frame too large: %d bytes", len(payload))
	}
	var header [5]byte
	header[0] = frameType
	binary.BigEndian.PutUint32(header[1:], uint32(len(payload)))
	if _, err := w.Write(header[:]); err != nil {
		return err
	}
	if len(payload) == 0 {
		return nil
	}
	_, err := w.Write(payload)
	return err
}

func ReadFrame(r io.Reader) (byte, []byte, error) {
	var header [5]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return 0, nil, err
	}
	size := binary.BigEndian.Uint32(header[1:])
	if size > maxFrameSize {
		return 0, nil, fmt.Errorf("terminal ipc frame too large: %d bytes", size)
	}
	payload := make([]byte, size)
	if size > 0 {
		if _, err := io.ReadFull(r, payload); err != nil {
			return 0, nil, err
		}
	}
	return header[0], payload, nil
}

func EncodeResize(cols int, rows int) []byte {
	var payload [8]byte
	binary.BigEndian.PutUint32(payload[0:4], uint32(cols))
	binary.BigEndian.PutUint32(payload[4:8], uint32(rows))
	return payload[:]
}

func DecodeResize(payload []byte) (int, int, error) {
	if len(payload) != 8 {
		return 0, 0, fmt.Errorf("terminal resize payload is %d bytes, want 8", len(payload))
	}
	cols := int(binary.BigEndian.Uint32(payload[0:4]))
	rows := int(binary.BigEndian.Uint32(payload[4:8]))
	if cols <= 0 || rows <= 0 {
		return 0, 0, errors.New("terminal resize requires positive cols and rows")
	}
	return cols, rows, nil
}

func sanitizeSessionName(sessionName string) string {
	sessionName = strings.TrimSpace(sessionName)
	sessionName = strings.ReplaceAll(sessionName, "/", "_")
	sessionName = strings.ReplaceAll(sessionName, string(filepath.Separator), "_")
	return sessionName
}
