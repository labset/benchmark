.PHONY: codegen tidy

codegen:
	docker compose --profile codegen run --rm codegen

tidy: codegen
	go mod tidy
