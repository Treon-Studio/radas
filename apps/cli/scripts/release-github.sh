#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

CURRENT_VERSION=$(go run -mod=mod github.com/raizora/radas/v4/constants 2>/dev/null || grep "Version = " constants/version.go | head -1 | sed 's/.*"\(.*\)".*/\1/')
VERSION="${1:-$CURRENT_VERSION}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 [version]"
  echo "  (defaults to version from constants/version.go)"
  exit 1
fi

echo "==> Releasing radas $VERSION"

# Update version constant if different
if [ "$VERSION" != "$CURRENT_VERSION" ]; then
  echo "==> Bumping version: $CURRENT_VERSION → $VERSION"
  sed -i '' "s/Version = \"$CURRENT_VERSION\"/Version = \"$VERSION\"/" constants/version.go
fi

echo "==> Building for all platforms..."
BIN_DIR="release"
rm -rf "$BIN_DIR"
mkdir -p "$BIN_DIR"

echo "  linux/amd64..."
GOOS=linux   GOARCH=amd64 go build -ldflags="-s -w -X github.com/raizora/radas/v4/constants.Version=$VERSION" -o "$BIN_DIR/radas-linux-amd64" .

echo "  darwin/amd64..."
GOOS=darwin  GOARCH=amd64 go build -ldflags="-s -w -X github.com/raizora/radas/v4/constants.Version=$VERSION" -o "$BIN_DIR/radas-darwin-amd64" .

echo "  darwin/arm64..."
GOOS=darwin  GOARCH=arm64 go build -ldflags="-s -w -X github.com/raizora/radas/v4/constants.Version=$VERSION" -o "$BIN_DIR/radas-darwin-arm64" .

echo "  windows/amd64..."
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -X github.com/raizora/radas/v4/constants.Version=$VERSION" -o "$BIN_DIR/radas-windows-amd64.exe" .

echo "==> Compressing..."
cd "$BIN_DIR"
tar czf "radas-linux-amd64.tar.gz" radas-linux-amd64
tar czf "radas-darwin-amd64.tar.gz" radas-darwin-amd64
tar czf "radas-darwin-arm64.tar.gz" radas-darwin-arm64
zip -q "radas-windows-amd64.zip" radas-windows-amd64.exe
rm -f radas-linux-amd64 radas-darwin-amd64 radas-darwin-arm64 radas-windows-amd64.exe
cd "$PROJECT_DIR"

echo "==> Verifying binaries..."
for f in "$BIN_DIR"/*.tar.gz "$BIN_DIR"/*.zip; do
  echo "  $(ls -lh "$f" | awk '{print $5, $NF}')"
done

echo ""
echo "==> Release $VERSION ready in $BIN_DIR/"
echo ""
echo "To publish: gh release create \"$VERSION\" --title \"Release $VERSION\" --notes \"\" $BIN_DIR/*"
