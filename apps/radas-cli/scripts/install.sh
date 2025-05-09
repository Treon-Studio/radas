#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Binary name (will be set based on OS)
BINARY_NAME="radas"

# Determine OS type and set target directory and source binary
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    TARGET_DIR="/usr/local/bin"
    SOURCE_BIN="./bin/radas-darwin-amd64"
    # Check for Apple Silicon
    if [[ $(uname -m) == 'arm64' ]]; then
        SOURCE_BIN="./bin/radas-darwin-arm64"
    fi
    echo -e "${YELLOW}Installing for macOS ($(uname -m))...${NC}"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    TARGET_DIR="/usr/local/bin"
    SOURCE_BIN="./bin/radas-linux-amd64"
    # Check for ARM
    if [[ $(uname -m) == 'arm'* || $(uname -m) == 'aarch64' ]]; then
        SOURCE_BIN="./bin/radas-linux-arm64"
    fi
    echo -e "${YELLOW}Installing for Linux ($(uname -m))...${NC}"
else
    # Windows or other
    echo -e "${RED}Unsupported OS. Please manually copy the binary to your PATH.${NC}"
    exit 1
fi

# Check if binary exists for this platform
if [ ! -f "$SOURCE_BIN" ]; then
    # Try the default binary as fallback
    SOURCE_BIN="./bin/radas"
    if [ ! -f "$SOURCE_BIN" ]; then
        echo -e "${RED}Error: Binary not found at $SOURCE_BIN${NC}"
        echo -e "${YELLOW}Please build the project first with 'make build' or 'go build'${NC}"
        echo -e "${YELLOW}Available binaries:${NC}"
        ls -la ./bin/
        exit 1
    else
        echo -e "${YELLOW}Using default binary: $SOURCE_BIN${NC}"
    fi
else
    echo -e "${YELLOW}Using platform-specific binary: $SOURCE_BIN${NC}"
fi

# Check if we have permission to write to target directory
if [ ! -w "$TARGET_DIR" ]; then
    echo -e "${YELLOW}Need elevated privileges to copy to $TARGET_DIR${NC}"
    # Use sudo to copy
    sudo cp "$SOURCE_BIN" "$TARGET_DIR/$BINARY_NAME"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully installed radas to $TARGET_DIR${NC}"
    else
        echo -e "${RED}Failed to install binary${NC}"
        exit 1
    fi
else
    # Copy directly if we have permission
    cp "$SOURCE_BIN" "$TARGET_DIR/$BINARY_NAME"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully installed radas to $TARGET_DIR${NC}"
    else
        echo -e "${RED}Failed to install binary${NC}"
        exit 1
    fi
fi

# Make sure it's executable
sudo chmod +x "$TARGET_DIR/$BINARY_NAME"

echo -e "${GREEN}Installation complete!${NC}"
echo -e "${YELLOW}You can now use '$BINARY_NAME' command from anywhere.${NC}" 