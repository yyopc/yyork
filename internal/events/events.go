// Package events provides a small in-process pub/sub bus for session
// lifecycle events.
//
// The engine publishes Event values; the HTTP server's SSE handler
// subscribes. The bus is in-memory only — there is no persistence and no
// replay for late subscribers. SSE clients that connect after an event
// missed it just re-query the initial state via the regular GET endpoint.
//
// Publish is non-blocking: a subscriber whose buffered channel is full
// drops events rather than blocking publishers. This protects the engine
// from a slow consumer.
package events

import "sync"

// Type is the event-type discriminator.
type Type string

const (
	// TypeSessionCreated fires after a session row is INSERTed into the
	// store. The payload is the new session's id.
	TypeSessionCreated Type = "session.created"

	// TypeSessionTerminated fires after a session row is DELETEd, whether
	// by explicit stop or reconciler-detected zellij gone. The payload is
	// the terminated session's id so SSE subscribers can drop the entry
	// from the running view.
	TypeSessionTerminated Type = "session.terminated"

	// TypeSessionUpdated fires after mutable session metadata changes. The
	// payload is the session id so subscribers can re-query the row.
	TypeSessionUpdated Type = "session.updated"
)

// Event is a single message on the bus.
//
// Payload is intentionally a free-form map so consumers can read any
// future fields without the bus knowing about them. In v1 it carries
// at least {"id": <sessionId>}.
type Event struct {
	Type    Type
	Payload map[string]any
}

// Publisher is the publish side of the bus. *Bus satisfies it directly. The
// engine depends on this interface rather than *Bus so different processes can
// supply different implementations: the server uses the in-process *Bus (which
// fans out to SSE subscribers), while short-lived CLI commands use a
// forwarding implementation that ships events to a running server's bus over
// localhost. This is what lets a `spawn` from the terminal light up a board
// that's already open, without polling.
type Publisher interface {
	Publish(Event)
}

// defaultBuffer is the per-subscriber channel buffer size. Tunable later
// if drops become a real problem.
const defaultBuffer = 32

// Bus is the publisher side of the in-process pub/sub bus. Safe for
// concurrent Publish and Subscribe calls.
//
// Synchronization: an RWMutex guards the subscriber map. Publish holds the
// RLock for the duration of fan-out (multiple Publish calls can run
// concurrently). Subscribe and unsubscribe hold the write Lock, which
// guarantees they observe — and the publisher does not race against — a
// stable subscriber set. This makes channel-close in unsubscribe safe: no
// publisher can hold a stale channel reference after unsubscribe returns.
type Bus struct {
	mu          sync.RWMutex
	nextID      uint64
	subscribers map[uint64]chan Event
	bufferSize  int
}

// NewBus returns a Bus with the default per-subscriber buffer size.
func NewBus() *Bus {
	return &Bus{
		subscribers: map[uint64]chan Event{},
		bufferSize:  defaultBuffer,
	}
}

// Subscribe returns a channel that receives every event published from now
// on, plus an unsubscribe function that closes the channel and removes the
// subscriber. The caller MUST eventually call unsubscribe; otherwise the
// subscriber's channel leaks.
//
// Late subscribers do not see past events. The bus has no replay buffer.
func (b *Bus) Subscribe() (<-chan Event, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	id := b.nextID
	b.nextID++
	ch := make(chan Event, b.bufferSize)
	b.subscribers[id] = ch

	unsubscribe := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		if existing, ok := b.subscribers[id]; ok {
			delete(b.subscribers, id)
			close(existing)
		}
	}
	return ch, unsubscribe
}

// Publish fans out e to every current subscriber. A subscriber whose
// buffered channel is full has the event dropped silently — this guarantees
// Publish never blocks, protecting publishers from slow consumers.
//
// Publish holds an RLock for the fan-out. Concurrent Publish calls can
// proceed in parallel; concurrent unsubscribe calls wait for all current
// publishers to finish before closing channels, eliminating the
// "send on closed channel" race.
func (b *Bus) Publish(e Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, ch := range b.subscribers {
		select {
		case ch <- e:
		default:
			// Subscriber buffer full; drop rather than block.
		}
	}
}

// NewSessionCreated builds a TypeSessionCreated event for sessionID.
func NewSessionCreated(sessionID string) Event {
	return Event{
		Type:    TypeSessionCreated,
		Payload: map[string]any{"id": sessionID},
	}
}

// NewSessionTerminated builds a TypeSessionTerminated event for sessionID.
func NewSessionTerminated(sessionID string) Event {
	return Event{
		Type:    TypeSessionTerminated,
		Payload: map[string]any{"id": sessionID},
	}
}

// NewSessionUpdated builds a TypeSessionUpdated event for sessionID.
func NewSessionUpdated(sessionID string) Event {
	return Event{
		Type:    TypeSessionUpdated,
		Payload: map[string]any{"id": sessionID},
	}
}
