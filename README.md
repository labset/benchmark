# benchmark

API benchmark platform for comparing backend service implementations. Measures build time, deploy time, and load test performance across different tech stacks, then publishes results to Grafana Cloud for comparison.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Docker](https://docs.docker.com/get-docker/) with Compose v2
- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) for load testing
- A [Grafana Cloud](https://grafana.com/products/cloud/) account (for publishing results)

## Setup

```bash
npm install
```

## Quick start

```bash
# list configured targets
npm run benchmark -- list

# run a full benchmark (build + deploy + loadtest + collect)
npm run benchmark -- run my-api

# run and publish results to Grafana Cloud
npm run benchmark -- run my-api --publish

# compare results from multiple runs
npm run benchmark -- compare results/go-api-2026-03-04T12-00-00-000Z.json results/java-api-2026-03-04T12-00-00-000Z.json
```

## Configuration

All targets are defined in `benchmark.config.json` at the repo root. Each target points to a directory containing a `docker-compose.yml`.

```json
{
  "targets": {
    "my-go-api": {
      "path": "./examples/go-api",
      "composeFile": "docker-compose.yml",
      "service": "api",
      "port": 8080,
      "protocol": "http",
      "readinessProbe": {
        "httpGet": {
          "path": "/health",
          "port": 8080,
          "expectedStatus": 200
        },
        "initialDelayMs": 2000,
        "intervalMs": 1000,
        "timeoutMs": 120000
      },
      "k6": {
        "script": "toolkit/k6/scripts/default-http.js",
        "vus": 50,
        "duration": "30s",
        "env": {
          "BASE_URL": "http://localhost:8080"
        }
      },
      "tags": {
        "language": "go",
        "framework": "stdlib"
      }
    }
  },
  "defaults": {
    "k6": { "vus": 50, "duration": "30s" },
    "readinessProbe": {
      "initialDelayMs": 2000,
      "intervalMs": 1000,
      "timeoutMs": 120000
    }
  },
  "grafana": {
    "endpoint": "https://otlp-gateway-prod-us-central-0.grafana.net/otlp",
    "instanceId": "${GRAFANA_INSTANCE_ID}",
    "apiKey": "${GRAFANA_API_KEY}"
  },
  "output": { "dir": "./results" }
}
```

### Target fields

| Field            | Required | Default              | Description                                               |
| ---------------- | -------- | -------------------- | --------------------------------------------------------- |
| `path`           | yes      |                      | Path to the project directory containing the compose file |
| `composeFile`    | no       | `docker-compose.yml` | Compose file name                                         |
| `service`        | yes      |                      | Primary service name in the compose file                  |
| `port`           | yes      |                      | Port the service exposes on localhost                     |
| `protocol`       | no       | `http`               | `http` or `grpc`                                          |
| `readinessProbe` | no       | see defaults         | How to check if the service is ready                      |
| `k6`             | no       | see defaults         | k6 load test configuration                                |
| `tags`           | no       | `{}`                 | Metadata labels (language, framework, etc.)               |

### Environment variables

Grafana Cloud credentials are resolved from environment variables. Create a `.env` file or export them in your shell:

```bash
export GRAFANA_INSTANCE_ID=your-instance-id
export GRAFANA_API_KEY=your-api-key
```

Values in the config using `${VAR_NAME}` syntax are interpolated from the environment at load time.

## Commands

### `benchmark run <target>`

Runs the full benchmark pipeline: **build** → **deploy** → **loadtest** → **collect** → **cleanup**.

```bash
npm run benchmark -- run my-api
npm run benchmark -- run my-api --tag "go-v1.22" --publish
npm run benchmark -- run my-api --skip-build --k6-vus 100 --k6-duration 60s
```

| Option              | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `--skip-build`      | Skip the Docker build step                                       |
| `--skip-loadtest`   | Skip the k6 load test step                                       |
| `--k6-vus <n>`      | Override virtual users count                                     |
| `--k6-duration <d>` | Override test duration (e.g. `30s`, `1m`)                        |
| `--tag <label>`     | Label this run for comparison                                    |
| `--publish`         | Push results to Grafana Cloud after the run                      |
| `--cache`           | Allow Docker build cache (default: no cache for fair benchmarks) |

Results are written to `results/<target>-<timestamp>.json`.

### `benchmark build <target>`

Runs only the Docker Compose build step and reports the build time.

```bash
npm run benchmark -- build my-api
npm run benchmark -- build my-api --cache
```

### `benchmark deploy <target>`

Starts the service with `docker compose up -d` and waits for it to become healthy. Reports the time from start to ready.

```bash
npm run benchmark -- deploy my-api
```

### `benchmark loadtest <target>`

Runs a k6 load test against an already-running target.

```bash
npm run benchmark -- loadtest my-api
npm run benchmark -- loadtest my-api --k6-vus 100 --k6-duration 1m
```

### `benchmark publish <results>`

Publishes a results JSON file to Grafana Cloud.

```bash
npm run benchmark -- publish results/my-api-2026-03-04T12-00-00-000Z.json
```

### `benchmark compare <targets...>`

Compares multiple result files side-by-side in a terminal table. Best values are highlighted in green.

```bash
npm run benchmark -- compare results/go-api-*.json results/java-api-*.json
```

### `benchmark list`

Lists all targets defined in the config file.

```bash
npm run benchmark -- list
```

### `benchmark clean <target>`

Tears down a target with `docker compose down`.

```bash
npm run benchmark -- clean my-api
npm run benchmark -- clean my-api --no-volumes  # keep volumes
```

### Global options

| Option                | Default                 | Description                |
| --------------------- | ----------------------- | -------------------------- |
| `-c, --config <path>` | `benchmark.config.json` | Path to config file        |
| `-o, --output <dir>`  | `./results`             | Directory for result files |
| `-v, --verbose`       | `false`                 | Enable debug logging       |

## Metrics captured

### Build time

Wall-clock time of `docker compose build --no-cache`, measured with `process.hrtime.bigint()`.

### Deploy time

Time from `docker compose up -d` until the service health check passes. Health is verified by polling the configured `readinessProbe.httpGet` endpoint.

### Load test (k6)

Parsed from k6's `--summary-export` JSON output:

| Metric                | Description                        |
| --------------------- | ---------------------------------- |
| `httpReqs`            | Total HTTP requests                |
| `httpReqsPerSec`      | Throughput (requests/second)       |
| `httpReqDuration.avg` | Average response time (ms)         |
| `httpReqDuration.med` | Median / p50 response time (ms)    |
| `httpReqDuration.p90` | 90th percentile response time (ms) |
| `httpReqDuration.p95` | 95th percentile response time (ms) |
| `httpReqDuration.p99` | 99th percentile response time (ms) |
| `httpReqFailed`       | Error rate (0.0 - 1.0)             |
| `checksPassRate`      | k6 check pass rate (0.0 - 1.0)     |

## Grafana Cloud publishing

Results are pushed to Grafana Cloud using the [OTLP/HTTP JSON](https://opentelemetry.io/docs/specs/otlp/) protocol. Each metric is sent as a gauge data point labeled with the target name, tag, and environment info.

Metrics appear in Grafana with the `benchmark.*` prefix:

- `benchmark.build.duration`
- `benchmark.deploy.duration`
- `benchmark.http_reqs_per_sec`
- `benchmark.http_req.duration.{avg,med,p90,p95,p99}`
- `benchmark.http_req_failed_rate`
- `benchmark.checks_pass_rate`

## Custom k6 scripts

The toolkit ships with default k6 scripts for HTTP and gRPC APIs in `toolkit/k6/scripts/`. To use a custom script, set the `k6.script` path in your target config:

```json
{
  "k6": {
    "script": "./my-custom-k6-script.js",
    "env": {
      "BASE_URL": "http://localhost:8080",
      "ENDPOINT": "/api/v1/users"
    }
  }
}
```

Custom scripts receive environment variables defined in `k6.env`. The bundled scripts support `BASE_URL` and `ENDPOINT`.

## Adding a target project

1. Create your project under `examples/` (or anywhere) with a `docker-compose.yml`
2. Make sure the service has a health endpoint
3. Add a target entry to `benchmark.config.json`
4. Run `npm run benchmark -- list` to verify
5. Run `npm run benchmark -- run <target-name>`

## Project structure

```
benchmark.config.json          # central config (targets, grafana, defaults)
toolkit/                       # the benchmark CLI toolkit
  bin/benchmark.js             # CLI entry point
  src/
    cli/commands/              # command implementations
    config/                    # zod schema, loader, defaults
    core/                      # docker, k6, timer, health check
    metrics/                   # result collector, k6 parser
    publish/                   # OTLP formatter, Grafana Cloud client
    report/                    # comparison logic, terminal table, JSON writer
  k6/scripts/                  # bundled k6 test scripts
examples/                      # target projects for benchmarking
results/                       # benchmark output (gitignored)
```

## License

Apache-2.0
