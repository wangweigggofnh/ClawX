.PHONY: build run dev clean

BINARY := clawx-relay

build:
	go build -o $(BINARY) ./cmd/clawx-relay/

run: build
	./$(BINARY) -config config/config.yaml -web web/static

dev:
	go run ./cmd/clawx-relay/ -config config/config.yaml -web web/static

clean:
	rm -f $(BINARY)
