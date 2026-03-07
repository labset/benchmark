# Connect RPC Go — Architecture Agent

Generate a layered Go + Connect RPC implementation following the platform backend architecture.

Read the API spec and k6 script from `projects/<project>/_shared/<api-style>/` to understand the contract, then generate ALL files listed below.

## Directory Structure

```
<implementation>/
├── cmd/server/
│   ├── main.go
│   ├── setup_connections.go
│   ├── setup_domains.go
│   └── setup_gateway.go
├── internal/
│   ├── api/<domain>/
│   │   ├── handler.go
│   │   ├── mapper.go
│   │   ├── route_create_<domain>.go
│   │   ├── route_get_<domain>.go
│   │   ├── route_list_<domain>.go
│   │   ├── route_update_<domain>.go
│   │   └── route_delete_<domain>.go
│   ├── domain/<domain>/
│   │   ├── errors.go
│   │   ├── service.go
│   │   ├── op_create.go
│   │   ├── op_get.go
│   │   ├── op_list.go
│   │   ├── op_update.go
│   │   └── op_delete.go
│   └── outbox/
│       ├── river.go                            # River implementation of pkg/outbox.Outbox
│       └── <domain>/
│           ├── event_created.go                # River worker + job args
│           ├── event_updated.go
│           └── event_deleted.go
├── pkg/
│   ├── config/config.go                       # Env-based config loaded via godotenv
│   ├── connectapp/app.go
│   ├── connectutil/errors.go
│   ├── connectutil/interceptors.go
│   ├── cache/cache.go
│   ├── outbox/outbox.go
│   └── migrate/migrate.go
├── gen/
│   ├── proto/                              # buf-generated (proto + connect)
│   └── sqlc/<domain>/                      # sqlc-generated (per-domain)
├── sql/
│   ├── migrations/001_create_<domain>.sql
│   └── queries/<domain>/<domain>.sql
├── sqlc.yaml
├── buf.gen.yaml
├── go.mod
├── Makefile
├── Dockerfile
└── docker-compose.yml
```

## Conventions

- **Interface-first**: every package exposes an interface as its public API. Structs are unexported (lowercase). Constructors return the interface type (e.g., `func New(deps Dependencies) Service`).
- **Dependencies struct**: each layer defines an exported `Dependencies` struct listing its injected dependencies. Constructors take `Dependencies` as the single parameter. The private struct inlines the dependencies directly (not `deps Dependencies`) — the `Dependencies` struct is only for the public constructor signature.
- **File prefixes**: `route_<rpc>.go` in API, `op_<operation>.go` in domain, `event_<name>.go` in outbox.
- **Single server**: one h2c server on `:8080` serves `/health` (no interceptors) and Connect RPC paths (with per-handler interceptors via `connect.WithInterceptors`).
- **No unused imports**: every import in every file must be used. Only import a package in files that directly reference it — do not import packages just because sibling files in the same Go package use them. Run `go vet ./...` after generation to catch issues.

## Layer Rules

- `pkg/` depends on nothing — purely generic, extractable as a shared module
- `domain/` depends on `gen/sqlc/` + `pkg/` — business logic, orchestrates cache/store/outbox
- `outbox/` depends on `gen/sqlc/` + `pkg/outbox` + river — implements outbox, defines workers
- `api/` depends on `domain/`, `gen/proto/`, `gen/sqlc/`, `pkg/`
- `cmd/` wires all layers together

## pkg/ — Generic Reusable Packages

### pkg/config/config.go

Env-based configuration loaded via godotenv. Consolidates all environment variables into a typed struct. Loaded once at startup in `main.go`.

```go
package config

import (
    "os"

    "github.com/joho/godotenv"
)

type Config struct {
    DatabaseURL   string
    OpenSearchURL string
    ServerAddr    string
}

func Load() (*Config, error) {
    _ = godotenv.Load() // .env file is optional, env vars take precedence
    return &Config{
        DatabaseURL:   getEnv("DATABASE_URL", "postgres://benchmark:benchmark@localhost:5432/benchmark?sslmode=disable"),
        OpenSearchURL: getEnv("OPENSEARCH_URL", "http://localhost:9200"),
        ServerAddr:    getEnv("SERVER_ADDR", ":8080"),
    }, nil
}

func getEnv(key, fallback string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return fallback
}
```

### pkg/connectapp/app.go

Reusable Connect RPC application lifecycle. Single server with h2c, path-based routing, graceful shutdown. Health and API handlers served from different paths on the same port — enabling different interceptor chains per path via Connect's `WithInterceptors`.

```go
package connectapp

import (
    "context"
    "net/http"

    "github.com/rs/zerolog/log"
    "golang.org/x/net/http2"
    "golang.org/x/net/http2/h2c"
)

// App is the public interface for the Connect RPC application.
type App interface {
    Handle(path string, handler http.Handler)
    Run(ctx context.Context) error
}

type Option func(*app)

func WithAddr(addr string) Option { return func(a *app) { a.addr = addr } }

func New(opts ...Option) App {
    a := &app{addr: ":8080", mux: http.NewServeMux()}
    for _, o := range opts {
        o(a)
    }
    // /health is always registered — no interceptors, plain HTTP
    a.mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        w.Write([]byte(`{"status":"up"}`))
    })
    return a
}

type app struct {
    addr string
    mux  *http.ServeMux
}

func (a *app) Handle(path string, handler http.Handler) {
    a.mux.Handle(path, handler)
}

func (a *app) Run(ctx context.Context) error {
    server := &http.Server{
        Addr:    a.addr,
        Handler: h2c.NewHandler(a.mux, &http2.Server{}),
    }

    log.Info().Str("addr", a.addr).Msg("server started")

    errCh := make(chan error, 1)
    go func() { errCh <- server.ListenAndServe() }()

    select {
    case <-ctx.Done():
        return server.Close()
    case err := <-errCh:
        return err
    }
}
```

Single port serves both `/health` (plain HTTP, no auth) and Connect RPC paths (e.g., `/content.v1.ContentService/*`). Different interceptor chains are configured per handler via `connect.WithInterceptors()` when calling `NewContentServiceHandler`.

### pkg/connectutil/errors.go

Map domain sentinel errors to connect error codes.

```go
package connectutil

import (
    "errors"

    "connectrpc.com/connect"
)

func NewErrorFrom(err error, mappings map[error]connect.Code) *connect.Error {
    for sentinel, code := range mappings {
        if errors.Is(err, sentinel) {
            return connect.NewError(code, err)
        }
    }
    return connect.NewError(connect.CodeInternal, err)
}
```

### pkg/connectutil/interceptors.go

Shared interceptors: recovery, logging, buf validate.

```go
package connectutil

import (
    "context"
    "fmt"
    "time"

    "connectrpc.com/connect"
    "connectrpc.com/validate"
    "github.com/rs/zerolog"
    "github.com/rs/zerolog/log"
)

func NewInterceptors() []connect.Interceptor {
    validateInterceptor := validate.NewInterceptor()
    return []connect.Interceptor{
        NewRecoveryInterceptor(),
        NewLoggingInterceptor(),
        validateInterceptor,
    }
}

func NewRecoveryInterceptor() connect.UnaryInterceptorFunc {
    return func(next connect.UnaryFunc) connect.UnaryFunc {
        return func(ctx context.Context, req connect.AnyRequest) (resp connect.AnyResponse, err error) {
            defer func() {
                if r := recover(); r != nil {
                    err = connect.NewError(connect.CodeInternal, fmt.Errorf("panic: %v", r))
                }
            }()
            return next(ctx, req)
        }
    }
}

func NewLoggingInterceptor() connect.UnaryInterceptorFunc {
    return func(next connect.UnaryFunc) connect.UnaryFunc {
        return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
            start := time.Now()
            resp, err := next(ctx, req)
            evt := log.Info()
            if err != nil {
                evt = log.Error().Err(err)
            }
            evt.
                Str("procedure", req.Spec().Procedure).
                Dur("duration", time.Since(start)).
                Msg("rpc")
            return resp, err
        }
    }
}
```

### pkg/cache/cache.go

Generic cache interface. Struct is private; constructor returns the interface.

```go
package cache

import (
    "sync"
    "time"
)

// Cache is the public interface. Implementations are private.
type Cache[K comparable, V any] interface {
    Get(key K) (V, bool)
    Set(key K, value V, ttl time.Duration)
    Delete(key K)
}

// NewInMemory returns a Cache backed by a sync.RWMutex map.
func NewInMemory[K comparable, V any]() Cache[K, V] {
    return &inMemory[K, V]{items: make(map[K]entry[V])}
}

type inMemory[K comparable, V any] struct {
    mu    sync.RWMutex
    items map[K]entry[V]
}

type entry[V any] struct {
    value     V
    expiresAt time.Time
}

func (c *inMemory[K, V]) Get(key K) (V, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    e, ok := c.items[key]
    if !ok || (!e.expiresAt.IsZero() && time.Now().After(e.expiresAt)) {
        var zero V
        return zero, false
    }
    return e.value, true
}

func (c *inMemory[K, V]) Set(key K, value V, ttl time.Duration) {
    c.mu.Lock()
    defer c.mu.Unlock()
    var exp time.Time
    if ttl > 0 {
        exp = time.Now().Add(ttl)
    }
    c.items[key] = entry[V]{value: value, expiresAt: exp}
}

func (c *inMemory[K, V]) Delete(key K) {
    c.mu.Lock()
    defer c.mu.Unlock()
    delete(c.items, key)
}
```

### pkg/outbox/outbox.go

Outbox interface for emitting domain events. The domain doesn't know about jobs or queues — it just emits events. The implementation decides what to do (e.g., insert river jobs for indexing, auditing, analytics).

```go
package outbox

import "context"

// Event represents a domain event to be processed asynchronously.
type Event struct {
    Type    string
    Payload any
}

// Outbox emits domain events within a transaction.
// Generic over the transaction type to avoid unsafe casts while keeping pkg dependency-free.
type Outbox[T any] interface {
    Emit(ctx context.Context, tx T, events ...Event) error
}
```

### pkg/migrate/migrate.go

Goose wrapper with embedded migrations.

```go
package migrate

import (
    "database/sql"
    "embed"

    "github.com/pressly/goose/v3"
)

func Run(db *sql.DB, migrations embed.FS, dir string) error {
    goose.SetBaseFS(migrations)
    if err := goose.SetDialect("postgres"); err != nil {
        return err
    }
    return goose.Up(db, dir)
}
```

## internal/api/ — API Layer

### handler.go

Private struct implementing the generated Connect service interface. Constructor returns the Connect-generated interface type.

```go
package content

import (
    "internal/domain/content"
    contentv1connect "gen/proto/content/v1/contentv1connect"
)

// Dependencies defines the dependencies for the content API handler.
type Dependencies struct {
    Service content.Service
}

// New returns the Connect-generated interface. Struct is private.
func New(deps Dependencies) contentv1connect.ContentServiceHandler {
    return &handler{service: deps.Service}
}

type handler struct {
    service content.Service
}
```

### mapper.go

Mapping functions between proto types (`gen/proto/`) and sqlc models (`gen/sqlc/`). For update params, sqlc generates `pgtype.Text` / `pgtype.Int4` for nullable fields (from `sqlc.narg()`), NOT pointer types.

```go
package content

// toProto maps a sqlc model to a proto response message
// fromProtoCreate maps a proto create request to sqlc create params
// fromProtoUpdate maps a proto update request to sqlc update params
//   - uses pgtype.Text{String: val, Valid: true} for nullable string fields
//   - uses pgtype.Int4{Int32: val, Valid: true} for nullable int fields
//   - only sets Valid: true for fields in the update mask
```

### route_*.go — One file per RPC

Each file contains a single method on the Handler struct:

```go
// route_create_content.go
func (h *handler) CreateContent(
    ctx context.Context,
    req *connect.Request[contentv1.CreateContentRequest],
) (*connect.Response[contentv1.Content], error) {
    result, err := h.service.Create(ctx, fromProtoCreate(req.Msg))
    if err != nil {
        return nil, connectutil.NewErrorFrom(err, errorMappings)
    }
    return connect.NewResponse(toProto(result)), nil
}
```

Error mappings defined as a package-level var:

```go
var errorMappings = map[error]connect.Code{
    content.ErrNotFound:      connect.CodeNotFound,
    content.ErrAlreadyExists: connect.CodeAlreadyExists,
}
```

## internal/domain/ — Domain Layer

### errors.go

Sentinel errors used across the domain.

```go
package content

import "errors"

var (
    ErrNotFound      = errors.New("content not found")
    ErrAlreadyExists = errors.New("content already exists")
)
```

### service.go

Service interface is public; struct is private. No store abstraction — sqlc IS the store.

```go
package content

import (
    "context"

    "github.com/gofrs/uuid/v5"
    "github.com/jackc/pgx/v5/pgxpool"

    "github.com/jackc/pgx/v5"

    "pkg/cache"
    "pkg/outbox"
    sqlccontent "gen/sqlc/content"
)

// Service is the public interface for the content domain.
type Service interface {
    Create(ctx context.Context, params sqlccontent.CreateContentParams) (*sqlccontent.Content, error)
    Get(ctx context.Context, id uuid.UUID) (*sqlccontent.Content, error)
    List(ctx context.Context, limit, offset int32) ([]sqlccontent.Content, int64, error)
    Update(ctx context.Context, id uuid.UUID, params sqlccontent.UpdateContentParams) (*sqlccontent.Content, error)
    Delete(ctx context.Context, id uuid.UUID) error
}

// Dependencies defines the dependencies for the content domain service.
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
```

### op_*.go — One file per operation

Each operation runs within a DB transaction for transactional outbox:

```go
// op_create.go
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

    if err := s.outbox.Emit(ctx, tx, outbox.Event{Type: "content.created", Payload: item}); err != nil {
        return nil, err
    }

    if err := tx.Commit(ctx); err != nil {
        return nil, err
    }

    s.cache.Set(item.ID, &item, 0)
    return &item, nil
}
```

For reads, check cache first:

```go
// op_get.go
func (s *service) Get(ctx context.Context, id uuid.UUID) (*sqlccontent.Content, error) {
    if cached, ok := s.cache.Get(id); ok {
        return cached, nil
    }
    item, err := s.queries.GetContent(ctx, id)
    if err != nil {
        return nil, ErrNotFound
    }
    s.cache.Set(id, &item, 0)
    return &item, nil
}
```

## internal/outbox/ — Outbox Layer

### river.go — River implementation of pkg/outbox.Outbox

Maps domain events to river jobs. Each event type can fan out to multiple jobs (index, audit, analytics).

```go
package outbox

import (
    "context"
    "fmt"

    "github.com/jackc/pgx/v5"
    "github.com/riverqueue/river"

    "pkg/outbox"
    contentevents "<module>/internal/outbox/content"
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

// mapEvent fans out a domain event into one or more river jobs.
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
```

### event_*.go — One file per event type

Each file contains river `JobArgs` + `Worker` for a specific concern (index, audit, analytics).

```go
// event_created.go — indexing concern
package content

import (
    "context"
    "github.com/riverqueue/river"
    "pkg/outbox"
)

type IndexArgs struct {
    ID   string `json:"id"`
    Type string `json:"type"`
}

func (IndexArgs) Kind() string { return "content.index" }

func NewIndexArgs(event outbox.Event) *IndexArgs {
    // extract ID from event payload
    return &IndexArgs{ID: "...", Type: event.Type}
}

type IndexWorker struct {
    river.WorkerDefaults[IndexArgs]
    // opensearch client injected here
}

func (w *IndexWorker) Work(ctx context.Context, job *river.Job[IndexArgs]) error {
    // index/update/delete content in OpenSearch based on job.Args.Type
    return nil
}
```

```go
// event_audit.go — auditing concern
package content

type AuditArgs struct {
    ID     string `json:"id"`
    Action string `json:"action"`
}

func (AuditArgs) Kind() string { return "content.audit" }

func NewAuditArgs(event outbox.Event) *AuditArgs { ... }

type AuditWorker struct {
    river.WorkerDefaults[AuditArgs]
}

func (w *AuditWorker) Work(ctx context.Context, job *river.Job[AuditArgs]) error {
    // write audit trail
    return nil
}
```

## SQL — Migrations & Queries

### sql/migrations/001_create_content.sql

```sql
-- +goose Up
CREATE TABLE content (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    status     INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS content;
```

### sql/queries/content/content.sql

sqlc annotated queries — one query per operation.

```sql
-- name: GetContent :one
SELECT * FROM content WHERE id = sqlc.arg('id');

-- name: ListContent :many
SELECT * FROM content ORDER BY created_at LIMIT sqlc.arg('limit') OFFSET sqlc.arg('offset');

-- name: CountContent :one
SELECT count(*) FROM content;

-- name: CreateContent :one
INSERT INTO content (title, body, status)
VALUES (sqlc.arg('title'), sqlc.arg('body'), sqlc.arg('status'))
RETURNING *;

-- name: UpdateContent :one
UPDATE content
SET title = COALESCE(sqlc.narg('title'), title),
    body = COALESCE(sqlc.narg('body'), body),
    status = COALESCE(sqlc.narg('status'), status),
    updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteContent :exec
DELETE FROM content WHERE id = sqlc.arg('id');
```

### sqlc.yaml

One `sql` block per domain. Generated code isolated under `gen/sqlc/<domain>/`.

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "sql/queries/content/"
    schema: "sql/migrations/"
    gen:
      go:
        package: "content"
        out: "gen/sqlc/content"
        sql_package: "pgx/v5"
        overrides:
          - db_type: "uuid"
            go_type:
              import: "github.com/gofrs/uuid/v5"
              type: "UUID"
```

## buf.gen.yaml

Uses buf v2 config with managed mode to rewrite `go_package` imports to match the Go module path. Without managed mode, generated connect code imports the raw proto `go_package` (e.g., `content/v1`) which won't resolve.

```yaml
version: v2
managed:
  enabled: true
  disable:
    - file_option: go_package
      module: buf.build/bufbuild/protovalidate
  override:
    - file_option: go_package_prefix
      value: <module>/gen/proto
plugins:
  - protoc_builtin: go
    out: gen/proto
    opt: paths=source_relative
  - remote: buf.build/connectrpc/go
    out: gen/proto
    opt: paths=source_relative
```

Key points:
- `go_package_prefix` rewrites proto `go_package` to `<module>/gen/proto/<proto_path>` so Go imports resolve correctly
- `disable` for `buf.build/bufbuild/protovalidate` prevents rewriting third-party dep go_packages
- Replace `<module>` with the actual Go module name

## cmd/server/ — App Wiring

Split into focused setup files so bootstrapping is easy to reason about:

```
cmd/server/
├── main.go
├── setup_connections.go
├── setup_domains.go
└── setup_gateway.go
```

### cmd/server/main.go

```go
package main

import (
    "context"
    "os/signal"
    "syscall"

    "github.com/rs/zerolog/log"

    "pkg/config"
)

func main() {
    ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
    defer cancel()

    cfg, _ := config.Load()
    connections := setupConnections(ctx, cfg)
    defer connections.Close(ctx)

    domains := setupDomains(connections)
    application := setupGateway(cfg, domains)

    if err := application.Run(ctx); err != nil {
        log.Fatal().Err(err).Msg("server error")
    }
}
```

### cmd/server/setup_connections.go

Establishes infrastructure connections: database pool, migrations, river client.

```go
package main

import (
    "context"
    "database/sql"
    "embed"

    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/riverqueue/river"
    "github.com/riverqueue/river/riverdriver/riverpgxv5"
    "github.com/riverqueue/river/rivermigrate"

    "pkg/config"
    "pkg/migrate"
    outboxcontent "<module>/internal/outbox/content"
)

//go:embed sql/migrations/*.sql
var migrations embed.FS

type Connections struct {
    Pool        *pgxpool.Pool
    RiverClient *river.Client[pgx.Tx]
}

func (c *Connections) Close(ctx context.Context) {
    c.RiverClient.Stop(ctx)
    c.Pool.Close()
}

func setupConnections(ctx context.Context, cfg *config.Config) *Connections {
    pool, _ := pgxpool.New(ctx, cfg.DatabaseURL)

    // River migrations (independent)
    riverMigrator, _ := rivermigrate.New(riverpgxv5.New(pool), nil)
    riverMigrator.Migrate(ctx, rivermigrate.DirectionUp, nil)

    // Domain migrations (goose)
    stdDB, _ := sql.Open("pgx", cfg.DatabaseURL)
    migrate.Run(stdDB, migrations, "sql/migrations")
    stdDB.Close()

    // River client + workers
    workers := river.NewWorkers()
    river.AddWorker(workers, &outboxcontent.IndexWorker{})
    river.AddWorker(workers, &outboxcontent.AuditWorker{})
    riverClient, _ := river.NewClient(riverpgxv5.New(pool), &river.Config{
        Queues:  map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: 100}},
        Workers: workers,
    })
    riverClient.Start(ctx)

    return &Connections{Pool: pool, RiverClient: riverClient}
}
```

### cmd/server/setup_domains.go

Wires domain services with their dependencies: sqlc queries, cache, outbox.

```go
package main

import (
    "github.com/gofrs/uuid/v5"

    "pkg/cache"
    contentdomain "<module>/internal/domain/content"
    internaloutbox "<module>/internal/outbox"
    sqlccontent "<module>/gen/sqlc/content"
)

type Domains struct {
    Content contentdomain.Service
}

func setupDomains(conn *Connections) *Domains {
    queries := sqlccontent.New(conn.Pool)
    contentCache := cache.NewInMemory[uuid.UUID, *sqlccontent.Content]()
    contentOutbox := internaloutbox.NewRiverOutbox(conn.RiverClient)

    contentService := contentdomain.New(contentdomain.Dependencies{
        Pool:    conn.Pool,
        Queries: queries,
        Cache:   contentCache,
        Outbox:  contentOutbox,
    })

    return &Domains{Content: contentService}
}
```

### cmd/server/setup_gateway.go

Registers Connect RPC handlers with interceptors on the app.

```go
package main

import (
    "connectrpc.com/connect"

    "pkg/config"
    "pkg/connectapp"
    "pkg/connectutil"
    contentapi "<module>/internal/api/content"
    contentv1connect "<module>/gen/proto/content/v1/contentv1connect"
)

func setupGateway(cfg *config.Config, domains *Domains) connectapp.App {
    application := connectapp.New(connectapp.WithAddr(cfg.ServerAddr))
    interceptors := connectutil.NewInterceptors()

    contentHandler := contentapi.New(contentapi.Dependencies{Service: domains.Content})
    path, h := contentv1connect.NewContentServiceHandler(
        contentHandler,
        connect.WithInterceptors(interceptors...),
    )
    application.Handle(path, h)

    return application
}
```

## Dockerfile

Multi-stage build: generate (buf + sqlc) → build → runtime.

```dockerfile
# Stage 1: Generate proto + sqlc code
FROM golang:1.25.6-alpine AS generate

RUN apk add --no-cache git
RUN go install github.com/bufbuild/buf/cmd/buf@v1.66.0
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.11
RUN go install connectrpc.com/connect/cmd/protoc-gen-connect-go@v1.19.1
RUN go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0

WORKDIR /build

# buf generate
COPY <implementation>/buf.gen.yaml ./
COPY _shared/protobuf/ proto/
RUN buf dep update proto
RUN buf generate proto

# sqlc generate
COPY <implementation>/sqlc.yaml ./
COPY <implementation>/sql ./sql
RUN sqlc generate

# Stage 2: Build
FROM golang:1.25.6-alpine AS builder

WORKDIR /app
COPY <implementation>/ .
COPY --from=generate /build/gen ./gen
RUN go mod tidy
RUN CGO_ENABLED=0 go build -o /server ./cmd/server

# Stage 3: Runtime
FROM alpine:3.20

RUN apk add --no-cache curl
COPY --from=builder /server /server

EXPOSE 8080
CMD ["/server"]
```

Replace `<implementation>` with the actual directory name (e.g., `connect-rpc`).

## docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: benchmark
      POSTGRES_USER: benchmark
      POSTGRES_PASSWORD: benchmark
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U benchmark"]
      interval: 2s
      timeout: 2s
      retries: 10

  opensearch:
    image: opensearchproject/opensearch:3.5.0
    environment:
      - discovery.type=single-node
      - DISABLE_SECURITY_PLUGIN=true
    ports:
      - "9200:9200"

  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:3.5.0
    environment:
      - OPENSEARCH_HOSTS=["http://opensearch:9200"]
      - DISABLE_SECURITY_DASHBOARDS_PLUGIN=true
    ports:
      - "5601:5601"
    depends_on:
      - opensearch

  codegen:
    build:
      context: ..
      dockerfile: <implementation>/Dockerfile
      target: generate
    volumes:
      - ./gen:/out/gen
    entrypoint: ["cp", "-r", "/build/gen/.", "/out/gen/"]
    profiles:
      - codegen

  api:
    build:
      context: ..
      dockerfile: <implementation>/Dockerfile
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://benchmark:benchmark@postgres:5432/benchmark?sslmode=disable
      - OPENSEARCH_URL=http://opensearch:9200
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
```

## Error Handling

| Domain Error      | Connect Code             | HTTP |
|-------------------|--------------------------|------|
| ErrNotFound       | CodeNotFound             | 404  |
| ErrAlreadyExists  | CodeAlreadyExists        | 409  |
| ErrInvalidArgument| CodeInvalidArgument      | 400  |
| ErrPrecondition   | CodeFailedPrecondition   | 412  |
| ErrPermission     | CodePermissionDenied     | 403  |
| ErrUnauthenticated| CodeUnauthenticated      | 401  |
| (default)         | CodeInternal             | 500  |

## Pinned Versions

| Dependency | Version |
|---|---|
| Go | 1.25.6 |
| connectrpc.com/connect | v1.19.1 |
| connectrpc.com/validate | latest stable |
| google.golang.org/protobuf | v1.36.11 |
| github.com/jackc/pgx/v5 | latest stable |
| github.com/riverqueue/river | latest stable |
| github.com/pressly/goose/v3 | latest stable |
| github.com/rs/zerolog | latest stable |
| github.com/joho/godotenv | latest stable |
| github.com/gofrs/uuid/v5 | latest stable |
| golang.org/x/net | v0.25.0 |
| buf | v1.66.0 |
| protoc-gen-go | v1.36.11 |
| protoc-gen-connect-go | v1.19.1 |
| sqlc | v1.30.0 |

## Makefile

Generate a `Makefile` with at least these targets:

```makefile
.PHONY: codegen tidy

codegen:
	docker compose --profile codegen run --rm codegen

tidy: codegen
	go mod tidy
```

## Post-Generation

After writing all source files, run `make tidy` inside the implementation directory. This:
1. Runs `make codegen` — builds the generate Docker stage and copies `gen/` (proto + sqlc) to the host via the codegen compose profile
2. Runs `go mod tidy` — resolves dependencies from scaffolded imports, populates `go.mod` with correct versions and generates `go.sum`

Both steps are required because `go mod tidy` needs the generated code under `gen/` to resolve imports.

## Checklist

Before finishing generation, verify:
- [ ] All RPCs from the proto file are implemented as `route_*.go` files
- [ ] Each domain operation has its own `op_*.go` file
- [ ] Each outbox event has its own `event_*.go` file
- [ ] sqlc queries cover all CRUD operations
- [ ] Migration creates the correct table schema
- [ ] Dockerfile builds successfully with both buf and sqlc generation
- [ ] docker-compose includes postgres, opensearch, and the api service
- [ ] Single server on :8080 via h2c — `/health` (plain HTTP) and Connect RPC paths (with interceptors)
- [ ] All env vars consolidated in `pkg/config` with godotenv loading
- [ ] sqlc uses `sql_package: pgx/v5` and `gofrs/uuid/v5` override
- [ ] Every package exposes interfaces; structs are private implementation details
- [ ] Different interceptor chains possible per handler via `connect.WithInterceptors()`
- [ ] The k6 test script expectations are met (set `GRPC_HOST=localhost:8080`)
- [ ] `make tidy` has been run (codegen + dependency resolution)
