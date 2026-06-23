// Package paths centralises the application data-directory name so a future
// rename only requires touching one constant.
package paths

import (
	"fmt"
	"os"
	"path/filepath"
)

// DataDirName is the name of the yyork data directory inside the user's home.
const DataDirName = ".yyork"

// DataDir returns the absolute path to the yyork data directory (~/.yyork).
// The directory is not created; callers that need it to exist should call
// os.MkdirAll themselves.
func DataDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("paths: resolve home directory: %w", err)
	}
	return filepath.Join(home, DataDirName), nil
}
