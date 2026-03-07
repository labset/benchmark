package outbox

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	contentevents "content-api-connect-rpc/internal/outbox/content"
	"content-api-connect-rpc/pkg/outbox"
)

func NewRiverOutbox(client *river.Client[pgx.Tx]) outbox.Outbox[pgx.Tx] {
	return &riverOutbox{client: client}
}

type riverOutbox struct {
	client *river.Client[pgx.Tx]
}

func (o *riverOutbox) Emit(ctx context.Context, tx pgx.Tx, events ...outbox.Event) error {
	for _, event := range events {
		jobs, err := o.mapEvent(event)
		if err != nil {
			return err
		}
		for _, args := range jobs {
			if _, err := o.client.InsertTx(ctx, tx, args, nil); err != nil {
				return err
			}
		}
	}
	return nil
}

func (o *riverOutbox) mapEvent(event outbox.Event) ([]river.JobArgs, error) {
	switch event.Type {
	case "content.created":
		return []river.JobArgs{
			contentevents.NewIndexArgs(event),
			contentevents.NewAuditArgs(event),
		}, nil
	case "content.updated":
		return []river.JobArgs{
			contentevents.NewIndexArgs(event),
		}, nil
	case "content.deleted":
		return []river.JobArgs{
			contentevents.NewIndexArgs(event),
			contentevents.NewAuditArgs(event),
		}, nil
	default:
		return nil, fmt.Errorf("unknown event type: %s", event.Type)
	}
}
