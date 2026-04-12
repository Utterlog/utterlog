APP_NAME=aibridge

.PHONY: build run fmt test docker-build

build:
	go build -o bin/$(APP_NAME) ./cmd/server

run:
	go run ./cmd/server

fmt:
	gofmt -w $$(find . -name '*.go' | sort)

test:
	go test ./...

docker-build:
	docker build -t $(APP_NAME):local .
