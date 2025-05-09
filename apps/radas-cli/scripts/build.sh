#!/bin/bash

# Ensure the bin directory exists
mkdir -p bin

# Create a temporary build directory
mkdir -p .build_temp

# Manual cross-compilation since we're having issues with the gf CLI config
echo "Building radas CLI for all platforms..."

# Build for Windows
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/radas-windows-amd64.exe
echo "✓ Windows (amd64) build complete"

# Build for Linux (amd64)
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/radas-linux-amd64
echo "✓ Linux (amd64) build complete"

# Build for Linux (arm64)
GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o bin/radas-linux-arm64
echo "✓ Linux (arm64) build complete"

# Build for macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o bin/radas-darwin-amd64
echo "✓ macOS (Intel) build complete"

# Build for macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/radas-darwin-arm64
echo "✓ macOS (Apple Silicon) build complete"

# Copy current platform binary to default name
if [[ "$OSTYPE" == "darwin"* ]]; then
    if [[ $(uname -m) == 'arm64' ]]; then
        cp bin/radas-darwin-arm64 bin/radas
    else
        cp bin/radas-darwin-amd64 bin/radas
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if [[ $(uname -m) == 'arm'* || $(uname -m) == 'aarch64' ]]; then
        cp bin/radas-linux-arm64 bin/radas
    else
        cp bin/radas-linux-amd64 bin/radas
    fi
fi

# Make all the binaries executable
chmod +x bin/radas-linux-amd64
chmod +x bin/radas-linux-arm64
chmod +x bin/radas-darwin-amd64
chmod +x bin/radas-darwin-arm64

# # Make install script executable
# chmod +x scripts/install.sh

# echo "Build complete! Binaries are available in the bin directory:"
# ls -la bin/

# echo ""
# echo "Installation instructions:"
# echo "* Run: ./radas install"
# echo "* Or manually:"
# echo "  - Windows: Copy bin/radas-windows-amd64.exe to a directory in your PATH"
# echo "  - Linux (amd64): Copy bin/radas-linux-amd64 to /usr/local/bin/radas"
# echo "  - Linux (arm64): Copy bin/radas-linux-arm64 to /usr/local/bin/radas"
# echo "  - macOS (Intel): Copy bin/radas-darwin-amd64 to /usr/local/bin/radas"
# echo "  - macOS (Apple Silicon): Copy bin/radas-darwin-arm64 to /usr/local/bin/radas"