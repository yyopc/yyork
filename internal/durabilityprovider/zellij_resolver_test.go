package durabilityprovider

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestResolveZellijBinaryUsesEnvOverride(t *testing.T) {
	dir := t.TempDir()
	override := writeExecutable(t, filepath.Join(dir, zellijExecutableName(runtime.GOOS)))

	got, err := resolveZellijBinary(testZellijResolver(t, "", map[string]string{
		zellijPathEnv: override,
	}, nil))
	if err != nil {
		t.Fatalf("resolveZellijBinary returned error: %v", err)
	}
	if got.Path != override || got.Source != ZellijBinarySourceOverride {
		t.Fatalf("ResolveZellijBinary = %#v, want override %s", got, override)
	}
}

func TestResolveZellijBinaryRejectsBadEnvOverride(t *testing.T) {
	got, err := resolveZellijBinary(testZellijResolver(t, "", map[string]string{
		zellijPathEnv: filepath.Join(t.TempDir(), "missing-zellij"),
	}, nil))
	if err == nil {
		t.Fatalf("expected bad override to fail, got %#v", got)
	}
}

func TestResolveZellijBinaryFindsBundledRuntime(t *testing.T) {
	root := t.TempDir()
	exe := filepath.Join(root, "bin", "yyork")
	bundled := writeExecutable(t, filepath.Join(root, "libexec", "yyork", "bin", zellijExecutableName(runtime.GOOS)))

	got, err := resolveZellijBinary(testZellijResolver(t, exe, nil, nil))
	if err != nil {
		t.Fatalf("resolveZellijBinary returned error: %v", err)
	}
	if got.Path != bundled || got.Source != ZellijBinarySourceBundled {
		t.Fatalf("ResolveZellijBinary = %#v, want bundled %s", got, bundled)
	}
}

func TestResolveZellijBinaryFallsBackToPath(t *testing.T) {
	pathZellij := filepath.Join(t.TempDir(), "bin", zellijExecutableName(runtime.GOOS))
	got, err := resolveZellijBinary(testZellijResolver(t, "", nil, map[string]string{
		zellijExecutableName(runtime.GOOS): pathZellij,
	}))
	if err != nil {
		t.Fatalf("resolveZellijBinary returned error: %v", err)
	}
	if got.Path != pathZellij || got.Source != ZellijBinarySourcePath {
		t.Fatalf("ResolveZellijBinary = %#v, want PATH %s", got, pathZellij)
	}
}

func testZellijResolver(t *testing.T, executable string, env map[string]string, path map[string]string) zellijResolver {
	t.Helper()
	return zellijResolver{
		getenv: func(key string) string {
			return env[key]
		},
		lookPath: func(command string) (string, error) {
			if resolved, ok := path[command]; ok {
				return resolved, nil
			}
			return "", errors.New("not found")
		},
		executable: func() (string, error) {
			if executable == "" {
				return "", errors.New("no executable")
			}
			return executable, nil
		},
		stat:   os.Stat,
		goos:   runtime.GOOS,
		goarch: runtime.GOARCH,
	}
}

func writeExecutable(t *testing.T, path string) string {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}
