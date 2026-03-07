# Stage 1: Generate proto + sqlc code
FROM golang:1.25.6-alpine AS generate

RUN apk add --no-cache git
RUN go install github.com/bufbuild/buf/cmd/buf@v1.66.0
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install connectrpc.com/connect/cmd/protoc-gen-connect-go@latest
RUN go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0

WORKDIR /build

# buf generate
COPY connect-rpc/buf.gen.yaml ./
COPY _shared/protobuf/ proto/
RUN buf dep update proto
RUN buf generate proto

# sqlc generate
COPY connect-rpc/sqlc.yaml ./
COPY connect-rpc/sql ./sql
RUN sqlc generate

# Stage 2: Build
FROM golang:1.25.6-alpine AS builder

WORKDIR /app
COPY connect-rpc/ .
COPY --from=generate /build/gen ./gen
RUN go mod tidy
RUN CGO_ENABLED=0 go build -o /server ./cmd/server

# Stage 3: Runtime
FROM alpine:3.20

RUN apk add --no-cache curl
COPY --from=builder /server /server

EXPOSE 8080
CMD ["/server"]
