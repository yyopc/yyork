// Package durabilityprovider delivers user messages into the runtime that hosts
// a session's CLI agent. AO tags each session with a runtime (e.g. "zellij"),
// and a Provider knows how to inject a message into that runtime.
package durabilityprovider

import (
	"context"

	"github.com/yyopc/yyork/internal/session"
)

// Provider delivers a message into the runtime backing a session's agent.
// Implementations are keyed by the AO runtime name reported by Name.
type Provider interface {
	// Name is the AO runtime name this provider handles, e.g. "zellij".
	Name() string

	// SendMessage delivers message to the agent running in sess as if the user
	// typed it, then submits it.
	SendMessage(ctx context.Context, sess session.Session, message string) error
}

// Registry resolves providers by runtime name.
type Registry struct {
	providers map[string]Provider
}

// NewRegistry builds a registry from providers, keyed by each provider's Name.
func NewRegistry(providers ...Provider) *Registry {
	registry := &Registry{providers: make(map[string]Provider, len(providers))}
	for _, provider := range providers {
		if provider == nil {
			continue
		}
		registry.providers[provider.Name()] = provider
	}

	return registry
}

// NewDefaultRegistry returns a registry with the built-in providers.
func NewDefaultRegistry() *Registry {
	return NewRegistry(NewZellijProvider())
}

// For returns the provider registered for runtimeName, if any.
func (r *Registry) For(runtimeName string) (Provider, bool) {
	provider, ok := r.providers[runtimeName]
	return provider, ok
}
