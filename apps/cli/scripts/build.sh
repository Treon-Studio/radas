#!/bin/bash

# Derive version from git tag, or fallback to commit SHA
# Priority: most recent tag → tag-with-distance → commit SHA → "dev"
if VERSION=$(git describe --tags --always --dirty 2>/dev/null); then
    # Strip leading 'v' if present for consistent format
    VERSION="${VERSION#v}"
else
    VERSION="dev"
fi

# ldflags to inject version into the binary
# The path must match the package import path
VERSION_PKG="github.com/raizora/radas/v4/constants"
LDFLAGS="-s -w -X ${VERSION_PKG}.Version=${VERSION}"

echo "Building radas CLI v${VERSION} for all platforms..."

# Ensure the bin directory exists
mkdir -p bin

# Create a temporary build directory
mkdir -p .build_temp

# Build for Windows
GOOS=windows GOARCH=amd64 go build -ldflags="${LDFLAGS}" -o bin/radas-windows-amd64.exe
echo "✓ Windows (amd64) build complete"

# Build for Linux (amd64)
GOOS=linux GOARCH=amd64 go build -ldflags="${LDFLAGS}" -o bin/radas-linux-amd64
echo "✓ Linux (amd64) build complete"

# Build for Linux (arm64)
GOOS=linux GOARCH=arm64 go build -ldflags="${LDFLAGS}" -o bin/radas-linux-arm64
echo "✓ Linux (arm64) build complete"

# Build for macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -ldflags="${LDFLAGS}" -o bin/radas-darwin-amd64
echo "✓ macOS (Intel) build complete"

# Build for macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -ldflags="${LDFLAGS}" -o bin/radas-darwin-arm64
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

echo "Build complete! Binaries are available in the bin directory (version: ${VERSION})"
