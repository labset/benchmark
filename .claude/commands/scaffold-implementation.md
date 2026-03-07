# Scaffold a new benchmark implementation

Guide the user interactively through creating a new implementation for a benchmark project.

## Step 1 — Discover available projects

List directories under `projects/` that contain a `_shared/` subdirectory. Present them to the user and ask which project they want to add an implementation for (e.g., `content-api`).

## Step 2 — Pick API style

List the API style subdirectories available under `projects/<project>/_shared/` (e.g., `openapi`, `graphql`, `protobuf`). Ask the user to choose which API style this implementation will use.

## Step 3 — Name the implementation

Ask the user for the implementation name in kebab-case (e.g., `spring-boot`, `express`, `ktor`, `actix-web`). This becomes the directory name under the project.

## Step 4 — Specify language and framework

Ask the user for:
- The programming language (e.g., `java`, `kotlin`, `javascript`, `typescript`, `go`, `rust`)
- The framework name (e.g., `spring-boot`, `express`, `ktor`, `actix-web`, `gin`)

These are used in benchmark tags and guide code generation.

## Step 5 — Generate the implementation

### Agent delegation

Check if a specialized agent prompt exists at `.claude/agents/<implementation>-<language>.md` (e.g., `.claude/agents/connect-rpc-go.md`). If found, read that file and follow its architecture guide to generate the implementation under `projects/<project>/<implementation>/`. Then skip directly to Step 6.

If no agent prompt exists, fall through to the generic generation instructions below.

### Generic generation (fallback)

Read the API spec and k6 script from `projects/<project>/_shared/<api-style>/` to understand the contract.

Generate the following files under `projects/<project>/<implementation>/`:

### Dockerfile
- Use an appropriate base image for the language/framework
- Multi-stage build where applicable (build stage + runtime stage)
- The final image should be as small as practical
- Expose port 8080

### docker-compose.yml
- Primary service named `api` on port 8080
- Add a database service if the framework conventionally uses one
- Include healthcheck in the compose file
- Example structure:
```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - SERVER_PORT=8080
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
```

### Application source code
- Implement ALL endpoints defined in the API spec
- Every implementation must register `GET /health` returning `{"status": "up"}` — this is an implementation convention, not part of the API spec
- For openapi style:
  - Implement all paths from the OpenAPI spec
- For graphql style:
  - Implement all queries and mutations defined in the schema
  - Serve at `/graphql` endpoint
- For protobuf style:
  - Implement all RPCs defined in the proto service
  - Serve on port 8080 using h2c (HTTP/2 cleartext)
- Use in-memory storage (a simple map/list) unless the user specifically requests a database
- Generate UUIDs for content IDs
- Track createdAt and updatedAt timestamps
- Return proper HTTP status codes / gRPC status codes as specified
- Follow idiomatic conventions for the chosen language and framework

### Build files
- Language-appropriate build file (pom.xml, package.json, build.gradle.kts, go.mod, Cargo.toml, etc.)
- Include only the dependencies needed for a minimal implementation

## Step 6 — Register the target

Add a target entry to `benchmark.config.json`:

```json
"<project>/<implementation>": {
  "path": "./projects/<project>/<implementation>",
  "composeFile": "docker-compose.yml",
  "service": "api",
  "port": 8080,
  "protocol": "<http for openapi/graphql, grpc for protobuf>",
  "readinessProbe": {
    "httpGet": {
      "path": "/health",
      "port": 8080,
      "expectedStatus": 200
    }
  },
  "k6": {
    "script": "./projects/<project>/_shared/<api-style>/k6/<project>.js",
    "vus": 50,
    "duration": "30s",
    "env": {
      "BASE_URL": "http://localhost:8080"
    }
  },
  "tags": {
    "project": "<project>",
    "language": "<language>",
    "framework": "<framework>",
    "api-style": "<api-style>"
  }
}
```

For protobuf targets, adjust:
- `protocol`: `"grpc"`
- `k6.env`: use `GRPC_HOST` (set to `localhost:8080`) and `PROTO_DIR` (e.g., `./projects/<project>/_shared/protobuf`) instead of `BASE_URL`

## Step 7 — Verify

Run `npm run benchmark -- list` to confirm the new target appears in the output.
