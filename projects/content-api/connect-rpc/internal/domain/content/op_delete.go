package content

import (
	"context"

	"github.com/gofrs/uuid/v5"

	"content-api-connect-rpc/pkg/outbox"
)

func (s *service) Delete(ctx context.Context, id uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := s.queries.WithTx(tx).DeleteContent(ctx, id)
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}

	if err := s.outbox.Emit(ctx, tx, outbox.Event{Type: "content.deleted", ID: id.String()}); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	s.cache.Delete(id)
	return nil
}
