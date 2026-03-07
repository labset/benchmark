package outbox

import "context"

type Event struct {
	Type string
	ID   string
	Data any
}

type Outbox[T any] interface {
	Emit(ctx context.Context, tx T, events ...Event) error
}
