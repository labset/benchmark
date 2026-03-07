# Platform Backend Architecture

See `platform-backend.png` for the visual reference.

## Codebase Layers

Four layers with strict dependency direction — each layer only depends on layers below it.

```
APP/        entry point, application bootstrap
  │ runs
API/        api definitions, maps to protobuf or GraphQL
  │ registers handlers, invokes
DOMAIN/     service layer, business logic, transactions
  │ triggers
OUTBOX/     async event processing, data projections
```

### APP/

**Purpose**: Application bootstrap and wiring. Creates infrastructure connections (database, queue, search), initialises domain services, registers API handlers, and manages server lifecycle.

**Exposes**: The application entry point (server).

**Consumes**: All other layers — wires them together. This is the only layer that knows about all dependencies.

**Contains**:
- Server initialisation with graceful shutdown
- Connection setup (database pool, migrations, queue client)
- Domain service construction with dependency injection
- API handler registration on the server

### API/

**Purpose**: API definitions. Translates between the external protocol (protobuf/GraphQL/REST) and the domain layer. Handles request validation, response mapping, and error translation.

**Exposes**: Protocol-specific handlers that the APP layer registers on the server. One handler per domain, one file per RPC/endpoint (`route_<rpc_name>`).

**Consumes**:
- `DOMAIN/` — invokes domain services
- Generated protocol code (proto stubs, GraphQL resolvers)
- Generated store models (for mapping between protocol and store types)
- Shared utilities (error mapping, interceptors)

**Contains**:
- `handler` — handler struct, constructor, error mapping table
- `mapper` — bidirectional mapping between protocol types and store models
- `route_<rpc>` — one file per RPC, each a single method on the handler

**Request lifecycle** (per the diagram):
1. Interceptors run first: validate context, validate request
2. Handler validates domain state
3. Handler invokes domain service
4. Handler maps response

### DOMAIN/

**Purpose**: Service layer where business logic lives. Ensures operations happen in a transaction. Deals with simple canonical data from the store. Orchestrates cache, store, and outbox.

**Exposes**: A service interface per domain. One file per operation (`op_<operation>`).

**Consumes**:
- Generated store queries (the code-gen tool IS the store — no extra repository layer)
- Cache interface (get/set/delete with TTL)
- Outbox interface (emit events within a transaction)

**Contains**:
- `errors` — sentinel domain errors (not found, already exists, etc.)
- `service` — interface definition, dependencies struct, constructor
- `op_<operation>` — one file per business operation (create, get, list, update, delete)

**Operation patterns**:
- **Writes** (create/update/delete): begin transaction → execute store query via `WithTx(tx)` → emit outbox event within same transaction → commit → update cache post-commit
- **Reads** (get): check cache → fall back to store → populate cache on miss
- **List**: pass-through to store (no caching)

### OUTBOX/

**Purpose**: Async event processing. Handles data projections for different event styles. Each worker represents a concern (audit, index, analytics, graph), not an event type.

**Exposes**: A queue implementation of the outbox interface. Worker definitions that the APP layer registers with the queue client.

**Consumes**:
- Outbox interface (from shared packages)
- Store models (for event payload typing)
- Queue library (for job insertion and worker definitions)

**Contains**:
- Queue implementation — maps domain events to one or more jobs by concern (fan-out)
- `event_<concern>` — one file per concern (index, audit, analytics), each defining job args + worker

**Event fan-out**:
- A single domain event (e.g., `content.created`) can trigger multiple workers (index + audit)
- Workers run asynchronously within the same process, polling the job table
- Job insertion happens within the domain transaction (transactional outbox guarantee)

## Shared Packages (pkg/)

Reusable, framework-agnostic packages. Depend on nothing from the application — extractable as a shared module.

| Package | Exposes | Purpose |
|---------|---------|---------|
| `config` | Typed config struct, `Load()` | Env-based configuration with defaults |
| `connectapp` | `App` interface with `Handle()`, `Run()` | Server lifecycle: h2c, health endpoint, graceful shutdown |
| `connectutil/errors` | `NewErrorFrom(err, mappings)` | Maps domain sentinel errors to protocol error codes |
| `connectutil/interceptors` | `NewInterceptors()` | Recovery (panic → internal error), logging, request validation |
| `cache` | `Cache[K,V]` interface | Generic cache with get/set/delete and TTL support |
| `outbox` | `Outbox[T]` interface, `Event` struct | Generic outbox for emitting domain events within a transaction |
| `migrate` | `Run(db, fs, dir)` | Migration runner wrapper (embeds SQL, runs on startup) |

## Request Lifecycle

From the diagram, a request flows through:

```
RPC(ctx, Request) → (Response, error)
    │
    ├── interceptors
    │     validate ctx (authentication, authorization)
    │     validate request (field constraints, required fields)
    │
    ├── handler
    │     validate state (business preconditions)
    │     invoke domain service
    │     map response
    │
    ├── service (synchronous)
    │     cache → DB → Index → External
    │
    └── workers (asynchronous, via outbox)
          audit, index, analytics, graph
```

## Error Mapping

Domain errors map to protocol-specific error codes. The mapping is defined per handler as a lookup table.

| gRPC Error | HTTP Code | When |
|---|---|---|
| CANCELLED | 499 | Client cancelled |
| UNAUTHENTICATED | 401 Unauthorized | Missing/invalid credentials |
| INVALID ARGUMENT | 400 Bad Request | Request validation failure |
| PERMISSION DENIED | 403 Forbidden | Insufficient permissions |
| NOT FOUND | 404 Not Found | Entity does not exist |
| ALREADY EXISTS | 409 Conflict | Duplicate creation |
| PRECONDITION FAILED | 412 Precondition Failed | State constraint violated |
| INTERNAL | 500 Internal Server Error | Unexpected failure |
| UNAVAILABLE | 503 Service Unavailable | Downstream dependency down |
| DEADLINE EXCEEDED | 504 Gateway Timeout | Operation timed out |

## Infrastructure

### Code Generation

Two code-gen tools run before compilation:
- **Protocol codegen** (buf) — generates typed stubs and service interfaces from proto/GraphQL definitions
- **Store codegen** (sqlc) — generates type-safe query functions from annotated SQL

Generated code lives under `gen/` and is never manually edited. Each domain gets its own isolated output directory.

### Migrations

Two migration systems run on startup, in order:
1. **Queue migrations** — the queue library manages its own tables independently
2. **Domain migrations** — application schema (embedded SQL files, shared sequence across domains)

### Docker

- **Multi-stage build**: generate (codegen tools) → build (compile) → runtime (minimal image + curl for health checks)
- **Compose services**: database (primary store + queue tables), search engine (outbox indexing target), dashboards (search UI), codegen (copies generated code to host for IDE support), api (application)
- **Codegen profile**: runs the generate stage and copies output to host, enabling IDE navigation of generated code

### Devloop

```
codegen  →  tidy  →  vet  →  build / test  →  start  →  stop
```

Each step depends on the previous. Fix errors at each stage before proceeding.

## Design Invariants

These hold across all stacks:

1. **Layer separation** — dependencies flow downward only, never upward or sideways
2. **Interface-first** — packages expose interfaces, structs are private, constructors return the interface
3. **Dependencies struct** — each layer declares its dependencies as an exported struct, constructor takes it as a single parameter
4. **File-per-concern** — `route_<rpc>`, `op_<operation>`, `event_<concern>` — one responsibility per file
5. **No store abstraction** — the code-gen tool IS the store, no extra repository/DAO layer
6. **Transactional outbox** — store mutation and event emission are atomic (same transaction)
7. **Read-through cache** — cache check → store fallback → cache populate
8. **Sentinel errors** — domain defines errors, API layer maps them to protocol codes via a lookup table
9. **Single server** — one port serves health (no interceptors) and API (with interceptors) on different paths
10. **Embedded migrations** — SQL files embedded in binary, run on startup before listeners
