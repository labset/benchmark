package content

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	sqlccontent "content-api-connect-rpc/gen/sqlc/content"
)

func (s *service) Get(ctx context.Context, id uuid.UUID) (*sqlccontent.Content, error) {
	if cached, ok := s.cache.Get(id); ok {
		return cached, nil
	}
	item, err := s.queries.GetContent(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	s.cache.Set(id, &item, 0)
	return &item, nil
}
