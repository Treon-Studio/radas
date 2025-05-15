#!/bin/bash
set -e

# Detect OS and architecture
OS=$(uname | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
  ARCH="amd64"
elif [[ "$ARCH" == "arm64" || "$ARCH" == "aarch64" ]]; then
  ARCH="arm64"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi

# Get latest version from GitHub API
VERSION=$(curl -s https://api.github.com/repos/Treon-Studio/radas/releases/latest | grep tag_name | cut -d '"' -f 4)

# Build download URL for tar.gz
FILENAME="radas-${OS}-${ARCH}.tar.gz"
URL="https://github.com/Treon-Studio/radas/releases/download/${VERSION}/${FILENAME}"

# Download and extract
TMPDIR=$(mktemp -d)
wget -O "$TMPDIR/$FILENAME" "$URL"
tar -xzf "$TMPDIR/$FILENAME" -C "$TMPDIR"

# Find the first executable file and move it to /usr/local/bin/radas
BIN_PATH=$(find "$TMPDIR" -type f -perm +111 | head -n 1)
if [[ ! -f "$BIN_PATH" ]]; then
  echo "Could not find the radas binary in the archive."
  exit 1
fi
sudo mv "$BIN_PATH" /usr/local/bin/radas
sudo chmod +x /usr/local/bin/radas

# Clean up
rm -rf "$TMPDIR"

echo "radas successfully installed! Run it with: radas"