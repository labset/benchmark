package content

import (
	"context"

	sqlccontent "content-api-connect-rpc/gen/sqlc/content"
	"content-api-connect-rpc/pkg/outbox"
)

func (s *service) Create(ctx context.Context, params sqlccontent.CreateContentParams) (*sqlccontent.Content, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	item, err := s.queries.WithTx(tx).CreateContent(ctx, params)
	if err != nil {
		return nil, err
	}

	if err := s.outbox.Emit(ctx, tx, outbox.Event{Type: "content.created", ID: item.ID.String(), Data: item}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	s.cache.Set(item.ID, &item, 0)
	return &item, nil
}
