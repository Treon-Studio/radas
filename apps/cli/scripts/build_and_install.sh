#!/bin/bash
set -e

# Build the radas binary
GO111MODULE=on go build -o bin/radas .

# Ad-hoc codesign binary on macOS to prevent SIGKILL (killed process) on ARM64
if [[ "$OSTYPE" == "darwin"* ]]; then
  codesign -s - -f bin/radas 2>/dev/null || true
fi

# Update GOPATH/bin/radas if present (no sudo needed)
GOPATH_BIN="$(go env GOPATH 2>/dev/null)/bin"
if [ -d "$GOPATH_BIN" ]; then
  cp bin/radas "$GOPATH_BIN/radas" 2>/dev/null || true
  if [[ "$OSTYPE" == "darwin"* ]]; then
    codesign -s - -f "$GOPATH_BIN/radas" 2>/dev/null || true
  fi
fi

# Install to /usr/local/bin (requires sudo)
if [ -f bin/radas ]; then
  echo "radas binary built to $(pwd)/bin/radas. Installing system-wide (requires sudo)..."
  sudo rm -f /usr/local/bin/radas 2>/dev/null || true
  sudo cp bin/radas /usr/local/bin/radas
  sudo chmod +x /usr/local/bin/radas
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sudo codesign -s - -f /usr/local/bin/radas 2>/dev/null || true
  fi
  echo "radas installed locally!"
else
  echo "Build failed, binary not found."
  exit 1
fi
