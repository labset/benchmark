# Platform Backend Architecture

A layered architecture for API services with transactional outbox, designed to be portable across language/framework stacks.

## Layers

```
┌─────────────────────────────────────────────────────┐
│  APP (cmd/server/)                                  │
│  Bootstrap, wiring, lifecycle                       │
├─────────────────────────────────────────────────────┤
│  API (internal/api/<domain>/)                       │
│  Proto/HTTP ↔ domain translation, error mapping     │
├─────────────────────────────────────────────────────┤
│  DOMAIN (internal/domain/<domain>/)                 │
│  Business logic, orchestrates store + cache + outbox│
├─────────────────────────────────────────────────────┤
│  OUTBOX (internal/outbox/)                          │
│  Async event processing (indexing, audit, etc.)     │
├─────────────────────────────────────────────────────┤
│  pkg/ — Generic reusable packages                   │
│  Framework-agnostic, extractable as shared module   │
└─────────────────────────────────────────────────────┘
```

## Directory Structure

```
<implementation>/
├── cmd/server/
│   ├── main.go                          # Signal handling, lifecycle
│   ├── setup_connections.go             # DB pool, migrations, queue client
│   ├── setup_domains.go                 # Wire domain services
│   └── setup_gateway.go                 # Register API handlers
├── internal/
│   ├── api/<domain>/
│   │   ├── handler.go                   # Handler struct + constructor + error mappings
│   │   ├── mapper.go                    # Proto ↔ store model mapping
│   │   ├── route_create_<domain>.go     # One file per RPC
│   │   ├── route_get_<domain>.go
│   │   ├── route_list_<domain>.go
│   │   ├── route_update_<domain>.go
│   │   └── route_delete_<domain>.go
│   ├── domain/<domain>/
│   │   ├── errors.go                    # Sentinel errors (ErrNotFound, etc.)
│   │   ├── service.go                   # Service interface + constructor
│   │   ├── op_create.go                 # One file per operation
│   │   ├── op_get.go
│   │   ├── op_list.go
│   │   ├── op_update.go
│   │   └── op_delete.go
│   └── outbox/
│       ├── river.go                     # Queue implementation of pkg/outbox
│       └── <domain>/
│           ├── event_index.go           # Worker per concern (indexing)
│           └── event_audit.go           # Worker per concern (auditing)
├── pkg/
│   ├── config/config.go                 # Env-based configuration
│   ├── connectapp/app.go                # Server lifecycle (h2c, health, shutdown)
│   ├── connectutil/errors.go            # Domain error → API error mapping
│   ├── connectutil/interceptors.go      # Recovery, logging, validation
│   ├── cache/cache.go                   # Generic Cache[K,V] interface
│   ├── outbox/outbox.go                 # Generic Outbox[T] interface
│   └── migrate/migrate.go              # Migration runner wrapper
├── gen/
│   ├── proto/                           # Generated proto + connect code
│   └── sqlc/<domain>/                   # Generated type-safe queries
├── sql/
│   ├── migrations/
│   │   ├── migrations.go                # go:embed for .sql files
│   │   └── 001_create_<domain>.sql
│   └── queries/<domain>/<domain>.sql    # sqlc annotated queries
├── sqlc.yaml
├── buf.gen.yaml
├── go.mod
├── Makefile
├── Dockerfile
└── docker-compose.yml
```

## Layer Rules & Dependency Direction

Dependencies flow downward only. No layer imports from a layer above it.

| Layer | Depends On | Responsibility |
|-------|-----------|----------------|
| **pkg/** | nothing | Generic, reusable, extractable as shared module |
| **domain/** | `gen/sqlc/`, `pkg/` | Business logic, transactional operations |
| **outbox/** | `gen/sqlc/`, `pkg/outbox`, queue library | Async event processing (workers) |
| **api/** | `domain/`, `gen/proto/`, `gen/sqlc/`, `pkg/` | Request/response translation, error mapping |
| **cmd/** | all layers | Wiring, bootstrap, lifecycle |

## Design Principles

### Interface-First

Every package exposes an **interface** as its public API. Structs are unexported (lowercase). Constructors return the interface type.

```
// Public
type Service interface { ... }
type Dependencies struct { ... }
func New(deps Dependencies) Service { ... }

// Private
type service struct { ... }
```

### Dependencies Struct

Each layer defines an exported `Dependencies` struct listing its injected dependencies. The constructor takes `Dependencies` as a single parameter. The private struct inlines the dependency fields directly — `Dependencies` is only for the public constructor signature.

### File-Per-Concern

- **API**: `route_<rpc>.go` — one RPC handler per file
- **Domain**: `op_<operation>.go` — one business operation per file
- **Outbox**: `event_<concern>.go` — one worker per concern (index, audit), not per event type

### No Store Abstraction

The code generation tool (sqlc) IS the store. Domain services depend directly on generated query types. No additional repository/DAO layer.

### Transactional Outbox

Write operations follow the transactional outbox pattern:

1. Begin transaction
2. Execute store operation (via generated queries + `WithTx(tx)`)
3. Emit domain event (queue inserts job within same transaction)
4. Commit transaction
5. Update cache (post-commit, best-effort)

This ensures the store mutation and event emission are atomic.

### Read-Through Cache

Read operations check cache first, fall back to store, then populate cache:

1. Check cache → return if hit
2. Query store → return `ErrNotFound` if no rows
3. Set cache → return result

### Error Handling

Domain layer defines sentinel errors. API layer maps them to protocol-specific error codes.

| Domain Error | Connect Code | HTTP | gRPC |
|---|---|---|---|
| `ErrNotFound` | `CodeNotFound` | 404 | NOT_FOUND |
| `ErrAlreadyExists` | `CodeAlreadyExists` | 409 | ALREADY_EXISTS |
| `ErrInvalidArgument` | `CodeInvalidArgument` | 400 | INVALID_ARGUMENT |
| `ErrFailedPrecondition` | `CodeFailedPrecondition` | 412 | FAILED_PRECONDITION |
| (default) | `CodeInternal` | 500 | INTERNAL |

Error mapping is a package-level var in `handler.go`, applied via a shared `NewErrorFrom(err, mappings)` utility.

### Single Server

One h2c server on `:8080` serves:
- `/health` — plain HTTP, no interceptors
- Connect RPC paths — with per-handler interceptors (recovery, logging, validation)

Different interceptor chains are configured per handler via the framework's interceptor mechanism, not per-server.

## Code Generation

### Proto (buf)

- **buf.gen.yaml** with managed mode — `go_package_prefix` rewrites proto imports to match Go module path
- `disable` rule for third-party deps (e.g., `buf.build/bufbuild/protovalidate`) to prevent import rewriting
- Validation rules defined in proto annotations, enforced by interceptor

### SQL (sqlc)

- **sqlc.yaml** with one `sql` block per domain — generated code isolated under `gen/sqlc/<domain>/`
- Uses `pgx/v5` driver with overrides for `uuid` (gofrs) and `timestamptz` (time.Time)
- `sqlc.narg()` for nullable update params generates `pgtype.Text` / `pgtype.Int4`, not pointer types
- `:execrows` return type for delete operations to detect not-found

## Outbox Architecture

Domain events are simple structs:

```
Event { Type string, ID string, Data any }
```

The outbox interface is generic over the transaction type:

```
Outbox[T any] { Emit(ctx, tx T, events ...Event) error }
```

The implementation (e.g., River) maps each event type to one or more jobs by concern:
- `content.created` → IndexArgs + AuditArgs
- `content.updated` → IndexArgs
- `content.deleted` → IndexArgs + AuditArgs

Workers process jobs asynchronously within the same process, polling the job table.

## Infrastructure

### Docker Multi-Stage Build

```
Stage 1 (generate): Install code-gen tools → buf generate → sqlc generate
Stage 2 (build):    Copy source + generated code → go mod tidy → go build
Stage 3 (runtime):  Alpine + curl (for health checks) + binary
```

### Docker Compose

| Service | Purpose | Port |
|---------|---------|------|
| postgres | Primary store + job queue tables | 5432 |
| opensearch | Search index (outbox target) | 9200 |
| opensearch-dashboards | Search UI | 5601 |
| codegen | Copies generated code to host (profile: codegen) | — |
| api | Application server | 8080 |

### Startup Sequence

1. Connect to database
2. Run queue migrations (queue library manages its own tables)
3. Run domain migrations (goose with embedded SQL)
4. Start queue client (begins polling for jobs)
5. Start server (health + API handlers)

### Makefile Devloop

```
codegen   → docker compose codegen (generate proto + sqlc)
tidy      → codegen + go mod tidy
vet       → tidy + go vet ./...
build     → vet + docker compose build api
test      → vet + go test ./...
start     → docker compose up + wait for health
stop      → docker compose down
clean     → docker compose down -v + rm -rf gen/
```

## Applying to Other Stacks

The architecture is stack-agnostic. Key decisions to adapt per stack:

| Concern | Go + Connect RPC | Spring Boot + gRPC | Ktor + gRPC |
|---------|------------------|-------------------|-------------|
| **Code gen** | buf + sqlc | buf + jOOQ/Exposed | buf + Exposed |
| **Store** | sqlc (generated) | jOOQ/Spring Data | Exposed |
| **Cache** | `sync.RWMutex` map | Caffeine | ConcurrentHashMap |
| **Queue** | River (pgx) | Spring AMQP / Outbox | kotlinx.coroutines |
| **Migrations** | goose (embedded) | Flyway/Liquibase | Flyway |
| **Server** | h2c (net/http) | Netty (grpc-java) | Netty (grpc-kotlin) |
| **Validation** | buf validate interceptor | buf validate interceptor | buf validate interceptor |
| **DI** | Manual (setup files) | Spring IoC | Koin/manual |

The invariants that stay the same across stacks:
- Layer separation and dependency direction
- Interface-first with dependency injection
- File-per-concern naming convention
- Transactional outbox pattern
- Read-through cache pattern
- Sentinel errors mapped to API codes
- Single server with path-based routing
- Docker multi-stage build with codegen stage
