#!/bin/bash
set -e

# Set your version/tag
VERSION="$1"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

# Build for all platforms
BIN_DIR="release"
mkdir -p "$BIN_DIR"

GOOS=linux   GOARCH=amd64 go build -o "$BIN_DIR/radas-linux-amd64" .
GOOS=darwin  GOARCH=amd64 go build -o "$BIN_DIR/radas-darwin-amd64" .
GOOS=darwin  GOARCH=arm64 go build -o "$BIN_DIR/radas-darwin-arm64" .
GOOS=windows GOARCH=amd64 go build -o "$BIN_DIR/radas-windows-amd64.exe" .

# (Optional) Compress binaries
cd "$BIN_DIR"
tar czf "radas-linux-amd64.tar.gz" radas-linux-amd64
tar czf "radas-darwin-amd64.tar.gz" radas-darwin-amd64
tar czf "radas-darwin-arm64.tar.gz" radas-darwin-arm64
zip "radas-windows-amd64.zip" radas-windows-amd64.exe
cd ..

# Create a GitHub release (draft, or publish directly)
gh release create "$VERSION" \
  --title "Release $VERSION" \
  --notes "See CHANGELOG.md for details." \
  release/radas-linux-amd64.tar.gz \
  release/radas-darwin-amd64.tar.gz \
  release/radas-darwin-arm64.tar.gz \
  release/radas-windows-amd64.zip

echo "GitHub release $VERSION created with binaries!"