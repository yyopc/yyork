package app

import (
	"testing"

	"github.com/yyopc/yyork/internal/plugin"
)

func TestRegisterBuiltInPluginsIncludesCursor(t *testing.T) {
	registry := plugin.NewRegistry()
	if err := registerBuiltInPlugins(registry); err != nil {
		t.Fatal(err)
	}
	registered, ok := registry.Get("cursor")
	if !ok {
		t.Fatal("Cursor plugin is not registered")
	}
	if got := registered.Manifest().Name; got != "Cursor" {
		t.Fatalf("Cursor manifest name = %q, want Cursor", got)
	}
}
