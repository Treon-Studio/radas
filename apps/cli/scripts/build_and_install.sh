#!/bin/bash
set -e

# Build the radas binary
GO111MODULE=on go build -o bin/radas .

# Install to /usr/local/bin (requires sudo)
if [ -f bin/radas ]; then
  echo "radas binary built to $(pwd)/bin/radas. Installing system-wide (requires sudo)..."
  sudo cp $(pwd)/bin/radas /usr/local/bin/radas
  sudo chmod +x /usr/local/bin/radas
  echo "radas installed locally!"
else
  echo "Build failed, binary not found."
  exit 1
fi
