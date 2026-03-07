# Connect RPC Go — Review Agent

Review a Connect RPC Go implementation against the platform backend architecture and the connect-rpc-go agent template.

## Inputs

Before starting, read these reference files:
1. `_architecture/platform-backend.md` — architecture invariants and layer rules
2. `.claude/agents/connect-rpc-go.md` — Go-specific patterns, code conventions, pinned versions

Then read the full implementation under `projects/<project>/<implementation>/`.

## Review Checklist

Work through each section below. For every violation found, report:
- **File and line** where the issue is
- **Rule** being violated (reference the section)
- **Severity**: `error` (breaks architecture), `warning` (inconsistency), `info` (style nit)

### 1. Directory Structure

Verify the implementation matches the expected layout:

- [ ] `cmd/server/` contains `main.go`, `setup_connections.go`, `setup_domains.go`, `setup_gateway.go`
- [ ] `internal/api/<domain>/` contains `handler.go`, `mapper.go`, and `route_<rpc>.go` files
- [ ] `internal/domain/<domain>/` contains `errors.go`, `service.go`, and `op_<operation>.go` files
- [ ] `internal/outbox/` contains `river.go` and `<domain>/event_<concern>.go` files
- [ ] `pkg/` contains `config/`, `connectapp/`, `connectutil/`, `cache/`, `outbox/`, `migrate/`
- [ ] `sql/migrations/` contains `migrations.go` (embed helper) and `.sql` files
- [ ] `sql/queries/<domain>/` contains sqlc query files
- [ ] No extra files or directories that don't fit the structure

### 2. Layer Dependencies

Verify dependency direction — each layer only imports from layers below it:

- [ ] `pkg/` imports nothing from `internal/`, `cmd/`, or `gen/`
- [ ] `internal/domain/` imports only from `gen/sqlc/` and `pkg/` — never from `internal/api/`, `internal/outbox/`, or `gen/proto/`
- [ ] `internal/outbox/` imports only from `gen/sqlc/`, `pkg/outbox`, and the queue library — never from `internal/api/` or `internal/domain/`
- [ ] `internal/api/` imports from `internal/domain/`, `gen/proto/`, `gen/sqlc/`, `pkg/` — never from `internal/outbox/` or `cmd/`
- [ ] `cmd/` wires all layers but contains no business logic

### 3. Interface-First Pattern

- [ ] Every `pkg/` package exposes an interface as its public API
- [ ] Every `internal/domain/` package exposes a `Service` interface
- [ ] Structs are unexported (lowercase names)
- [ ] Constructors return the interface type, not the struct
- [ ] Each layer defines an exported `Dependencies` struct for injection
- [ ] Constructor takes `Dependencies` as the single parameter
- [ ] Private struct inlines dependency fields directly (not embedding `Dependencies`)

### 4. File-Per-Concern Convention

- [ ] API layer: one `route_<rpc>.go` per RPC method, each containing a single method on the handler
- [ ] Domain layer: one `op_<operation>.go` per business operation, each containing a single method on the service
- [ ] Outbox layer: one `event_<concern>.go` per concern (index, audit, etc.), not per event type
- [ ] `handler.go` contains only the struct, constructor, and error mappings — no RPC methods
- [ ] `service.go` contains only the interface, dependencies, and constructor — no operations
- [ ] `mapper.go` contains only mapping functions — no business logic

### 5. Error Handling

- [ ] Domain layer defines sentinel errors in `errors.go` (e.g., `ErrNotFound`, `ErrAlreadyExists`)
- [ ] API layer maps sentinel errors to Connect codes via `connectutil.NewErrorFrom(err, errorMappings)`
- [ ] Error mappings defined as a package-level `var` in `handler.go`
- [ ] `op_get.go` distinguishes `pgx.ErrNoRows` from other errors (not swallowing all as `ErrNotFound`)
- [ ] `op_delete.go` uses `:execrows` return to detect not-found (checking `rows == 0`)
- [ ] `cmd/` handles all fallible calls with `if err != nil { log.Fatal()... }` — no `_, _ :=` ignoring
- [ ] UUID parsing errors in route handlers return `connect.CodeInvalidArgument`

### 6. Transactional Outbox Pattern

- [ ] Write operations (create, update, delete) begin a transaction
- [ ] Store query runs within the transaction via `queries.WithTx(tx)`
- [ ] Outbox event emitted within the same transaction via `outbox.Emit(ctx, tx, ...)`
- [ ] Transaction committed after both store and outbox operations succeed
- [ ] `defer tx.Rollback(ctx)` immediately after `pool.Begin(ctx)`
- [ ] Cache updated only after successful commit (post-commit, best-effort)
- [ ] Event struct uses `Type`, `ID`, and `Data` fields

### 7. Read-Through Cache Pattern

- [ ] `op_get.go` checks cache first, returns on hit
- [ ] Falls back to store query on cache miss
- [ ] Populates cache after successful store read
- [ ] `op_create.go` and `op_update.go` set cache after commit
- [ ] `op_delete.go` deletes from cache after commit

### 8. Import Correctness

- [ ] All internal imports use full module path (`<module>/gen/...`, `<module>/pkg/...`, `<module>/internal/...`)
- [ ] No relative import paths
- [ ] No unused imports in any file
- [ ] `internal/api/<domain>/` aliases domain import as `contentdomain` to avoid package name collision
- [ ] `gen/sqlc/<domain>/` aliased as `sqlc<domain>` where needed
- [ ] `gen/proto/<domain>/v1/` aliased as `<domain>v1`
- [ ] `_ "github.com/jackc/pgx/v5/stdlib"` imported in `setup_connections.go` for `sql.Open("pgx", ...)`

### 9. Proto / Store Code Generation

- [ ] `buf.gen.yaml` uses managed mode with `go_package_prefix` set to `<module>/gen/proto`
- [ ] `buf.gen.yaml` has `disable` rule for `buf.build/bufbuild/protovalidate` go_package rewriting
- [ ] `sqlc.yaml` uses `sql_package: pgx/v5`
- [ ] `sqlc.yaml` has `uuid` override pointing to `github.com/gofrs/uuid/v5`
- [ ] `sqlc.yaml` has `timestamptz` override pointing to `time.Time`
- [ ] `sqlc.yaml` has one `sql` block per domain with isolated output under `gen/sqlc/<domain>/`
- [ ] SQL queries use `sqlc.narg()` for nullable update fields
- [ ] Mapper uses `pgtype.Text` / `pgtype.Int4` for nullable fields (not pointer types)

### 10. Proto Contract Compliance

Read the proto service definition from `projects/<project>/_shared/protobuf/` and verify:

- [ ] Every RPC in the proto service has a corresponding `route_<rpc>.go` file
- [ ] Every domain operation has a corresponding `op_<operation>.go` file
- [ ] Route handler return types match proto response messages (wrapped, e.g., `CreateContentResponse{Content: ...}`)
- [ ] SQL migration schema covers all fields in the proto model message
- [ ] sqlc queries cover all CRUD operations needed by domain operations

### 11. Server and Interceptors

- [ ] Single h2c server on `:8080` via `pkg/connectapp`
- [ ] `/health` endpoint registered by `connectapp.New()` — returns `{"status":"up"}`, no interceptors
- [ ] Connect RPC handlers registered with `connect.WithInterceptors(interceptors...)`
- [ ] Interceptors include: recovery (panic → internal error), logging, buf validate
- [ ] `validate.NewInterceptor()` called with single return value (not two)

### 12. Infrastructure

- [ ] Dockerfile uses multi-stage build: generate → build → runtime
- [ ] Dockerfile tool versions match agent pinned versions (Go, buf, sqlc, protoc-gen-go, protoc-gen-connect-go)
- [ ] Runtime stage is minimal (alpine + curl)
- [ ] `docker-compose.yml` includes: postgres, opensearch, opensearch-dashboards, codegen (profile), api
- [ ] Codegen service uses `target: generate` and copies `gen/` to host via volume mount
- [ ] API service depends on postgres with `condition: service_healthy`
- [ ] Health check configured on the API service
- [ ] Makefile includes: codegen, tidy, vet, build, test, start, stop, clean

### 13. Migrations

- [ ] `sql/migrations/migrations.go` embeds `.sql` files via `go:embed`
- [ ] `setup_connections.go` imports the migrations package (not inline embed)
- [ ] `migrate.Run(stdDB, migrations.FS, ".")` called with correct args
- [ ] River migrations run before domain migrations
- [ ] Both run before server listeners start

## Output Format

Produce a structured review report:

```
## Review: <project>/<implementation>

### Summary
- Total issues: N (E errors, W warnings, I info)
- Architecture compliance: pass/fail

### Issues

#### [error] <file>:<line> — <title>
<description of the violation and which rule it breaks>

#### [warning] <file>:<line> — <title>
<description>

#### [info] <file>:<line> — <title>
<description>

### Passed Checks
<list of sections with no issues>
```

If no issues are found, report a clean bill of health.
