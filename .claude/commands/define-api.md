# Define a new API project

Guide the user interactively through creating a new API project with shared specs and k6 load test scripts.

## Step 1 — Name the project

Ask the user for a project name in kebab-case (e.g., `content-api`, `user-api`, `order-api`). This becomes the directory under `projects/`.

## Step 2 — Define the domain model

Ask the user to describe the domain:
- The primary entity name (e.g., `content`, `user`, `order`)
- The fields on the entity, with types (e.g., `title: string`, `price: number`, `status: enum(draft, published, archived)`)
- Which fields are required on create vs optional on update
- Whether the entity uses UUID or auto-increment IDs (default: UUID)

## Step 3 — Choose API styles

Ask which API styles to generate specs for. The user can pick one or more:
- `openapi` — REST API with OpenAPI 3.1 spec
- `graphql` — GraphQL schema
- `protobuf` — Protocol Buffers / gRPC service definition

All selected styles will define the same logical operations over the same domain model, so implementations across styles are directly comparable in benchmarks.

## Step 4 — Generate the shared specs

Create the `projects/<project>/_shared/` directory with a subdirectory per chosen style.

Health checks (`GET /health` returning `{"status": "up"}`) are an implementation convention — they are NOT part of the API spec. Do not include health endpoints in any spec.

Every style must define these standard operations:
1. **Create** — create a new entity (all required fields)
2. **Get** — retrieve a single entity by ID (not found if missing)
3. **List** — paginated list with `limit` and `offset`
4. **Update** — partial update by ID (not found if missing)
5. **Delete** — delete by ID (not found if missing)

Use the existing `projects/content-api/_shared/` as the reference for conventions and structure.

### openapi — `_shared/openapi/api-spec.yaml`

Generate an OpenAPI 3.1.0 spec following the content-api conventions:
- `GET /api/v1/<entity>` with `limit` and `offset` query params, returns paginated list with `items`, `total`, `limit`, `offset`
- `POST /api/v1/<entity>` with request body, returns 201
- `GET /api/v1/<entity>/{id}` returns single item, 404 if not found
- `PUT /api/v1/<entity>/{id}` partial update, 404 if not found
- `DELETE /api/v1/<entity>/{id}` returns 204, 404 if not found
- All entities include `id` (UUID), `createdAt`, `updatedAt` (ISO 8601 timestamps)
- Use camelCase for JSON fields

### graphql — `_shared/graphql/schema.graphql`

Generate a GraphQL schema following the content-api conventions:
- `Query.<entity>(id: ID!)` returning the entity type
- `Query.<entities>(limit: Int = 20, offset: Int = 0)` returning a list type with `items`, `total`, `limit`, `offset`
- `Mutation.create<Entity>(input: Create<Entity>Input!)` returning the entity
- `Mutation.update<Entity>(id: ID!, input: Update<Entity>Input!)` returning the entity
- `Mutation.delete<Entity>(id: ID!)` returning `Boolean`
- Enum types where applicable
- Timestamps as `DateTime` scalars (ISO 8601 strings)

### protobuf — `_shared/protobuf/<entity>/v1/`

The proto file path must match the package path. For example, package `content.v1` lives at `_shared/protobuf/content/v1/`.

Split the proto definition into three files:

- **`<entity>_refs.proto`** — Reference types that wrap an ID field with `(buf.validate.field).string.uuid = true`. Refs are for **cross-package** use — when another package needs to reference this entity (e.g., a `comment` service referencing `ContentRef`). Within the same package, request messages use plain `string id` fields directly.
- **`<entity>_model.proto`** — The entity model message and any enum types. This is the core domain type.
- **`<entity>_service.proto`** — The service definition with all RPCs, plus request/response messages. Imports `_model.proto`. Uses plain `string id` fields in requests within the same package.

Also generate a `buf.yaml` at `_shared/protobuf/buf.yaml`:
```yaml
version: v2
deps:
  - buf.build/bufbuild/protovalidate
```

Proto conventions:
- Package: `<entity>.v1`
- Language options for multi-stack compatibility:
  - `option go_package = "<entity>/v1;<entity>v1";`
  - `option java_multiple_files = true;`
  - `option java_package = "com.labset.benchmark.<entity>.v1";`
  - `option csharp_namespace = "Labset.Benchmark.<Entity>.V1";`
- Service with RPCs: `Create<Entity>`, `Get<Entity>`, `List<Entity>`, `Update<Entity>`, `Delete<Entity>`
- Consistent naming: every RPC has a `<RpcName>Request` and `<RpcName>Response` message pair
- Response messages that return an entity wrap it in a named field (e.g., `CreateContentResponse { Content content = 1; }`)
- Within the same package, requests use plain `string id` fields (e.g., `GetContentRequest { string id = 1; }`)
- Ref types in `_refs.proto` are for cross-package references and validate the ID with `(buf.validate.field).string.uuid = true`
- Enum types with `UNSPECIFIED = 0` sentinel
- Update requests use `google.protobuf.FieldMask` for partial updates — send the entity and a mask of fields to update (import `google/protobuf/field_mask.proto`)
- List requests use `page_size` / `page_token` cursor-based pagination; responses return `repeated <Entity> items` and `next_page_token`
- List response items field is always named `items` for consistency across all entities
- Timestamps as `google.protobuf.Timestamp` (import `google/protobuf/timestamp.proto`)
- **buf validate annotations** on all request fields:
  - ID fields: `(buf.validate.field).string.uuid = true`
  - String fields: `(buf.validate.field).string = {min_len: N, max_len: N}` as appropriate
  - Enum fields: `(buf.validate.field).enum = {defined_only: true, not_in: [0]}` to reject UNSPECIFIED
  - Pagination: `page_size` with `{gte: 1, lte: 100}`
  - Update: `content` and `update_mask` fields with `required = true`
  - Import `buf/validate/validate.proto` in the service proto

## Step 5 — Generate k6 load test scripts

For each chosen style, generate a k6 script at `_shared/<style>/k6/<project>.js`.

Use the existing content-api k6 scripts as the reference. Each script must:
- Follow the same group structure: create → get → list → update → delete
- Use `randomString()` from `k6-utils` for generating test data
- Extract the entity ID from the create response and use it in subsequent operations
- Include `check()` assertions for status codes and response shape
- Include `sleep(0.1)` between iterations
- Set appropriate thresholds

### openapi k6 script
- Use `k6/http` module
- `BASE_URL` env var (default: `http://localhost:8080`)
- Thresholds: `http_req_duration p95 < 500ms`, `http_req_failed rate < 0.01`
- Validate HTTP status codes (201, 200, 204)

### graphql k6 script
- Use `k6/http` module with POST to `${BASE_URL}/graphql`
- `BASE_URL` env var (default: `http://localhost:8080`)
- Thresholds: `http_req_duration p95 < 500ms`, `http_req_failed rate < 0.01`
- Send queries/mutations as JSON with variables

### protobuf k6 script
- Use `k6/net/grpc` module
- `GRPC_HOST` env var (default: `localhost:8080`), `PROTO_DIR` env var pointing to the protobuf root (e.g., `./projects/<project>/_shared/protobuf`)
- Threshold: `grpc_req_duration p95 < 500ms`
- Connect with `plaintext: true`
- Validate gRPC `StatusOK`

## Step 6 — Verify

List the generated files and confirm with the user. The project is now ready for implementations to be scaffolded with `/scaffold-implementation`.
