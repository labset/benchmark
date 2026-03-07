package content

import (
	"context"

	"github.com/gofrs/uuid/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlccontent "content-api-connect-rpc/gen/sqlc/content"
	"content-api-connect-rpc/pkg/cache"
	"content-api-connect-rpc/pkg/outbox"
)

type Service interface {
	Create(ctx context.Context, params sqlccontent.CreateContentParams) (*sqlccontent.Content, error)
	Get(ctx context.Context, id uuid.UUID) (*sqlccontent.Content, error)
	List(ctx context.Context, pageSize int32, pageToken string) ([]sqlccontent.Content, string, error)
	Update(ctx context.Context, id uuid.UUID, params sqlccontent.UpdateContentParams) (*sqlccontent.Content, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type Dependencies struct {
	Pool    *pgxpool.Pool
	Queries *sqlccontent.Queries
	Cache   cache.Cache[uuid.UUID, *sqlccontent.Content]
	Outbox  outbox.Outbox[pgx.Tx]
}

func New(deps Dependencies) Service {
	return &service{
		pool:    deps.Pool,
		queries: deps.Queries,
		cache:   deps.Cache,
		outbox:  deps.Outbox,
	}
}

type service struct {
	pool    *pgxpool.Pool
	queries *sqlccontent.Queries
	cache   cache.Cache[uuid.UUID, *sqlccontent.Content]
	outbox  outbox.Outbox[pgx.Tx]
}
