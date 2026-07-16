package cli

import (
	"os/exec"
	"time"
)

func configureDevChildProcess(cmd *exec.Cmd) {
	// CommandContext's default cancellation terminates the direct child on
	// Windows. Unix process-group signaling is unavailable there, but WaitDelay
	// still bounds shutdown if inherited pipes remain open in descendants.
	cmd.WaitDelay = 5 * time.Second
}
