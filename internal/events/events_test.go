package events_test

import (
	"testing"
	"time"

	"github.com/yyovil/better-ao/internal/events"
)

func TestPublishDeliversToAllSubscribers(t *testing.T) {
	t.Parallel()
	bus := events.NewBus()

	ch1, unsub1 := bus.Subscribe()
	defer unsub1()
	ch2, unsub2 := bus.Subscribe()
	defer unsub2()

	want := events.NewSessionCreated("01HRABC0000000000000000000")
	bus.Publish(want)

	got1 := mustReceive(t, ch1, 100*time.Millisecond)
	got2 := mustReceive(t, ch2, 100*time.Millisecond)

	if got1.Type != want.Type || got1.Payload["id"] != want.Payload["id"] {
		t.Errorf("subscriber 1 got %+v, want %+v", got1, want)
	}
	if got2.Type != want.Type || got2.Payload["id"] != want.Payload["id"] {
		t.Errorf("subscriber 2 got %+v, want %+v", got2, want)
	}
}

func TestLateSubscriberDoesNotSeePastEvents(t *testing.T) {
	t.Parallel()
	bus := events.NewBus()

	bus.Publish(events.NewSessionCreated("earlier"))

	ch, unsub := bus.Subscribe()
	defer unsub()

	select {
	case e := <-ch:
		t.Fatalf("late subscriber unexpectedly received past event: %+v", e)
	case <-time.After(20 * time.Millisecond):
		// good — no replay.
	}

	// Subsequent events still flow.
	bus.Publish(events.NewSessionTerminated("later"))
	got := mustReceive(t, ch, 100*time.Millisecond)
	if got.Type != events.TypeSessionTerminated || got.Payload["id"] != "later" {
		t.Errorf("late subscriber got %+v, want session.terminated of 'later'", got)
	}
}

func TestUnsubscribeStopsDelivery(t *testing.T) {
	t.Parallel()
	bus := events.NewBus()

	ch, unsub := bus.Subscribe()
	bus.Publish(events.NewSessionCreated("first"))
	_ = mustReceive(t, ch, 100*time.Millisecond)

	unsub()

	// After unsubscribe the channel should be closed; reading returns zero
	// value with ok=false on a closed channel.
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("expected channel closed, got value with ok=true")
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("channel still open after unsubscribe")
	}

	// Publishing further events does not panic or block.
	bus.Publish(events.NewSessionCreated("after-unsub"))
}

func TestPublishDoesNotBlockOnSlowSubscriber(t *testing.T) {
	t.Parallel()
	bus := events.NewBus()

	// Subscribe but never read.
	_, unsub := bus.Subscribe()
	defer unsub()

	done := make(chan struct{})
	go func() {
		for i := 0; i < 1_000; i++ {
			bus.Publish(events.NewSessionCreated("flood"))
		}
		close(done)
	}()

	select {
	case <-done:
		// Publish completed without blocking — slow subscriber drops events
		// rather than wedging the publisher.
	case <-time.After(2 * time.Second):
		t.Fatal("Publish blocked on a slow subscriber")
	}
}

func TestSubscribeIsConcurrencySafe(t *testing.T) {
	t.Parallel()
	bus := events.NewBus()

	// Hammer subscribe/unsubscribe and publish in parallel to surface any
	// races under `go test -race`.
	const workers = 16
	done := make(chan struct{}, workers)

	for i := 0; i < workers; i++ {
		go func() {
			for j := 0; j < 50; j++ {
				_, unsub := bus.Subscribe()
				bus.Publish(events.NewSessionCreated("x"))
				unsub()
			}
			done <- struct{}{}
		}()
	}

	for i := 0; i < workers; i++ {
		<-done
	}
}

func mustReceive(t *testing.T, ch <-chan events.Event, timeout time.Duration) events.Event {
	t.Helper()
	select {
	case e := <-ch:
		return e
	case <-time.After(timeout):
		t.Fatalf("timed out waiting for event after %s", timeout)
		return events.Event{}
	}
}
