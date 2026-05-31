package durabilityprovider

import (
	"fmt"
	"os"
)

// zellijSocketDirEnv is the environment variable Zellij reads to locate the
// directory it places its IPC control sockets in.
const zellijSocketDirEnv = "ZELLIJ_SOCKET_DIR"

// SocketDir returns a short Zellij IPC socket directory anchored at /tmp.
//
// Zellij builds its control socket at <dir>/<contract-version>/<session-name>,
// and a Unix-domain socket path is capped at ~103 bytes (sun_path). Zellij's
// default <dir> is $TMPDIR/zellij-<uid>, but on macOS $TMPDIR is a long
// per-user path under /var/folders/...., which pushes the socket past the limit
// and makes `zellij attach` fail with "the IPC socket path is too long".
// Anchoring at /tmp/zellij-<uid> keeps the prefix short while preserving
// Zellij's per-uid namespacing.
func SocketDir() string {
	return fmt.Sprintf("/tmp/zellij-%d", os.Getuid())
}

// ConfigureSocketDir sets ZELLIJ_SOCKET_DIR for the current process — unless
// the user already set one — so every Zellij invocation in this process shares
// one short socket path: session create, terminal attach, and the
// list/kill/exists probes. Child zellij processes inherit it via os.Environ(),
// which both the lifecycle env (buildEnv) and the terminal PTY env build on, so
// this single call covers all paths. Call it once at process start.
//
// The directory is created 0700 so other local users can't reach the sockets.
// Zellij would create it lazily, but pre-creating pins the permissions and
// guarantees create and attach agree on its existence.
func ConfigureSocketDir() {
	if os.Getenv(zellijSocketDirEnv) != "" {
		return
	}
	dir := SocketDir()
	_ = os.MkdirAll(dir, 0o700)
	_ = os.Setenv(zellijSocketDirEnv, dir)
}
