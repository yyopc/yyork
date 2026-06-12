package durabilityprovider

import (
	"os"
	"strings"
	"testing"
)

func TestConfigureSocketDirSetsWhenUnset(t *testing.T) {
	t.Setenv(zellijSocketDirEnv, "placeholder") // registers restore-on-cleanup
	os.Unsetenv(zellijSocketDirEnv)

	ConfigureSocketDir()

	if got := os.Getenv(zellijSocketDirEnv); got != SocketDir() {
		t.Fatalf("ZELLIJ_SOCKET_DIR = %q, want %q", got, SocketDir())
	}
}

func TestConfigureSocketDirRespectsExistingValue(t *testing.T) {
	t.Setenv(zellijSocketDirEnv, "/custom/socket/dir")

	ConfigureSocketDir()

	if got := os.Getenv(zellijSocketDirEnv); got != "/custom/socket/dir" {
		t.Fatalf("ConfigureSocketDir overrode user value: got %q", got)
	}
}

// SocketDir must stay short: zellij appends "/contract_version_1/<id>", and a
// Unix-domain socket path is capped near 103 bytes.
func TestSocketDirIsShort(t *testing.T) {
	dir := SocketDir()
	if !strings.HasPrefix(dir, "/tmp/") {
		t.Fatalf("expected socket dir under /tmp, got %q", dir)
	}
	if len(dir) > 40 {
		t.Fatalf("socket dir %q is too long (%d bytes)", dir, len(dir))
	}
}
