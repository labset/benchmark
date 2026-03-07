.PHONY: codegen tidy vet build test start stop clean

# --- codegen ---

codegen:
	docker compose --profile codegen run --rm codegen

tidy: codegen
	go mod tidy

# --- checks ---

vet: tidy
	go vet ./...

build: vet
	docker compose build api

test: vet
	go test ./...

# --- run ---

start:
	docker compose up -d
	@echo "waiting for api to be healthy..."
	@until curl -sf http://localhost:8080/health > /dev/null 2>&1; do sleep 1; done
	@echo "api is up"

stop:
	docker compose down

# --- cleanup ---

clean:
	docker compose down -v
	rm -rf gen/
