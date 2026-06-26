package terminalipc

import (
	"bytes"
	"testing"
)

func TestFrameRoundTrip(t *testing.T) {
	var buf bytes.Buffer
	if err := WriteFrame(&buf, FrameInput, []byte("hello")); err != nil {
		t.Fatalf("write frame: %v", err)
	}
	frameType, payload, err := ReadFrame(&buf)
	if err != nil {
		t.Fatalf("read frame: %v", err)
	}
	if frameType != FrameInput {
		t.Fatalf("frame type = %d, want %d", frameType, FrameInput)
	}
	if string(payload) != "hello" {
		t.Fatalf("payload = %q, want hello", payload)
	}
}

func TestResizeRoundTrip(t *testing.T) {
	cols, rows, err := DecodeResize(EncodeResize(132, 43))
	if err != nil {
		t.Fatalf("decode resize: %v", err)
	}
	if cols != 132 || rows != 43 {
		t.Fatalf("resize = %dx%d, want 132x43", cols, rows)
	}
}
