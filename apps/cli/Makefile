.PHONY: build build-all clean install

# Default target
all: build

# Derive version from git tag, or fallback to commit SHA
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null | sed 's/^v//')
ifeq ($(VERSION),)
VERSION := dev
endif

# ldflags to inject version into the binary
LDFLAGS := -s -w -X github.com/raizora/radas/v4/constants.Version=$(VERSION)

# Build using standard Go build for current platform
build:
	@echo "Building radas v$(VERSION) for current platform..."
	@mkdir -p bin
	@go build -ldflags="$(LDFLAGS)" -o bin/radas

# Build for all platforms using direct Go commands
build-all:
	@echo "Building radas v$(VERSION) for all platforms..."
	@chmod +x scripts/build.sh
	@./scripts/build.sh

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf bin dist .build_temp

# Install for current platform
install: build
	@echo "Installing radas v$(VERSION)..."
	@if [ "$$(uname)" = "Darwin" ]; then \
		cp bin/radas /usr/local/bin/radas; \
	elif [ "$$(uname)" = "Linux" ]; then \
		sudo cp bin/radas /usr/local/bin/radas; \
	else \
		echo "Please copy the binary to a location in your PATH manually."; \
	fi
	@echo "Installation complete!"
