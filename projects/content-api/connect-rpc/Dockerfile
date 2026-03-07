# Stage 1: Generate protobuf + Connect RPC code
FROM golang:1.25.6-alpine AS generate

RUN apk add --no-cache git
RUN go install github.com/bufbuild/buf/cmd/buf@v1.66.0
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.11
RUN go install connectrpc.com/connect/cmd/protoc-gen-connect-go@v1.19.1

WORKDIR /build
COPY connect-rpc/buf.gen.yaml ./
RUN mkdir -p proto/content/v1
COPY _shared/protobuf/content.proto proto/content/v1/content.proto
RUN echo 'version: v2' > proto/buf.yaml
RUN buf generate proto

# Stage 2: Build Go binary
FROM golang:1.25.6-alpine AS builder

WORKDIR /app
COPY connect-rpc/ .
COPY --from=generate /build/gen ./gen
RUN go mod tidy
RUN CGO_ENABLED=0 go build -o /server ./cmd/server

# Stage 3: Minimal runtime
FROM alpine:3.20

RUN apk add --no-cache curl
COPY --from=builder /server /server

EXPOSE 8080 50051
CMD ["/server"]
