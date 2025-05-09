.PHONY: build build-all clean install

# Default target
all: build

# Build using standard Go build for current platform
build:
	@echo "Building radas for current platform..."
	@mkdir -p bin
	@go build -ldflags="-s -w" -o bin/radas

# Build for all platforms using direct Go commands
build-all:
	@chmod +x scripts/build.sh
	@./scripts/build.sh

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf bin dist .build_temp

# Install for current platform
install: build
	@echo "Installing radas..."
	@if [ "$$(uname)" = "Darwin" ]; then \
		cp bin/radas /usr/local/bin/radas; \
	elif [ "$$(uname)" = "Linux" ]; then \
		sudo cp bin/radas /usr/local/bin/radas; \
	else \
		echo "Please copy the binary to a location in your PATH manually."; \
	fi
	@echo "Installation complete!"