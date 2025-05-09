#!/bin/bash
set -e

# Build the radas binary
GO111MODULE=on go build -o bin/radas .

# Install to /usr/local/bin (requires sudo)
if [ -f bin/radas ]; then
  echo "Installing radas to /usr/local/bin (requires sudo)..."
  sudo cp bin/radas /usr/local/bin/radas
  sudo chmod +x /usr/local/bin/radas
  echo "radas installed successfully!"
else
  echo "Build failed, binary not found."
  exit 1
fi
