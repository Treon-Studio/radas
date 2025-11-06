#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Infisical Setup for Radas Chrome Ext${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if Infisical CLI is installed
if ! command -v infisical &> /dev/null; then
    echo -e "${YELLOW}Infisical CLI not found. Installing...${NC}"

    # Detect OS and install accordingly
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            echo -e "${BLUE}Installing via Homebrew...${NC}"
            brew install infisical/get-cli/infisical
        else
            echo -e "${RED}Homebrew not found. Please install Homebrew first or install Infisical manually.${NC}"
            echo -e "${YELLOW}Visit: https://infisical.com/docs/cli/overview${NC}"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        echo -e "${BLUE}Installing via bash script...${NC}"
        bash <(curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh')
    else
        echo -e "${RED}Unsupported OS. Please install Infisical CLI manually.${NC}"
        echo -e "${YELLOW}Visit: https://infisical.com/docs/cli/overview${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Infisical CLI already installed${NC}"
fi

# Check if already logged in
if infisical user &> /dev/null; then
    echo -e "${GREEN}✓ Already logged in to Infisical${NC}"
else
    echo -e "${YELLOW}Logging in to Infisical...${NC}"
    infisical login
fi

# Initialize Infisical in the project
if [ -f ".infisical.json" ]; then
    echo -e "${YELLOW}⚠ .infisical.json already exists${NC}"
    read -p "Do you want to reinitialize? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm .infisical.json
        infisical init
    fi
else
    echo -e "${BLUE}Initializing Infisical project...${NC}"
    infisical init
fi

# Pull secrets
echo -e "${BLUE}Pulling secrets from Infisical...${NC}"
./scripts/pull-secrets.sh

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "You can now run your development server with:"
echo -e "${BLUE}  pnpm dev${NC}"
echo ""
echo -e "To pull latest secrets anytime, run:"
echo -e "${BLUE}  ./scripts/pull-secrets.sh${NC}"
echo ""
