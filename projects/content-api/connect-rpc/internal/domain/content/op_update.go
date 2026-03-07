package content

import (
	"context"
	"errors"

	"github.com/gofrs/uuid/v5"
	"github.com/jackc/pgx/v5"

	sqlccontent "content-api-connect-rpc/gen/sqlc/content"
	"content-api-connect-rpc/pkg/outbox"
)

func (s *service) Update(ctx context.Context, id uuid.UUID, params sqlccontent.UpdateContentParams) (*sqlccontent.Content, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	params.ID = id
	item, err := s.queries.WithTx(tx).UpdateContent(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if err := s.outbox.Emit(ctx, tx, outbox.Event{Type: "content.updated", ID: item.ID.String(), Data: item}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	s.cache.Set(item.ID, &item, 0)
	return &item, nil
}
