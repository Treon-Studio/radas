#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if Infisical CLI is installed
if ! command -v infisical &> /dev/null; then
    echo -e "${RED}✗ Infisical CLI not found${NC}"
    echo -e "${YELLOW}Please run: ./scripts/setup-infisical.sh${NC}"
    exit 1
fi

# Get environment (default to dev)
ENV="${1:-dev}"

# Determine authentication method
AUTH_METHOD=""
TOKEN=""

# Priority 1: Environment variable (e.g., INFISICAL_TOKEN_DEV)
ENV_VAR_NAME="INFISICAL_TOKEN_$(echo ${ENV} | tr '[:lower:]' '[:upper:]')"
if [ -n "${!ENV_VAR_NAME}" ]; then
    TOKEN="${!ENV_VAR_NAME}"
    AUTH_METHOD="environment variable"
    echo -e "${CYAN}ℹ Using token from ${ENV_VAR_NAME}${NC}"
fi

# Priority 2: .infisical-token file (environment-specific)
if [ -z "$TOKEN" ] && [ -f ".infisical-token.${ENV}" ]; then
    TOKEN=$(cat .infisical-token.${ENV})
    AUTH_METHOD="token file (.infisical-token.${ENV})"
    echo -e "${CYAN}ℹ Using token from .infisical-token.${ENV}${NC}"
fi

# Priority 3: .infisical-token file (default)
if [ -z "$TOKEN" ] && [ -f ".infisical-token" ]; then
    TOKEN=$(cat .infisical-token)
    AUTH_METHOD="token file (.infisical-token)"
    echo -e "${CYAN}ℹ Using token from .infisical-token${NC}"
fi

# Priority 4: Login-based authentication (requires .infisical.json)
if [ -z "$TOKEN" ]; then
    if [ ! -f ".infisical.json" ]; then
        echo -e "${RED}✗ No authentication method found${NC}"
        echo -e "${YELLOW}Options:${NC}"
        echo -e "  1. Run: ${CYAN}./scripts/setup-infisical.sh${NC} (login-based)"
        echo -e "  2. Run: ${CYAN}./scripts/setup-token.sh${NC} (token-based)"
        echo -e "  3. Set environment variable: ${CYAN}export INFISICAL_TOKEN_${ENV^^}=<token>${NC}"
        exit 1
    fi
    AUTH_METHOD="login-based authentication"
    echo -e "${CYAN}ℹ Using login-based authentication${NC}"
fi

echo -e "${BLUE}Pulling secrets from Infisical (${ENV} environment)...${NC}"

# Backup existing .env if it exists
if [ -f ".env" ]; then
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    echo -e "${YELLOW}Backing up existing .env to .env.backup.${TIMESTAMP}${NC}"
    cp .env .env.backup.${TIMESTAMP}
fi

# Pull secrets from Infisical
if [ -n "$TOKEN" ]; then
    # Token-based authentication
    if infisical export --token="${TOKEN}" --env="${ENV}" --format=dotenv > .env 2>/dev/null; then
        echo -e "${GREEN}✓ Secrets successfully synced from Infisical${NC}"
        echo -e "${GREEN}✓ Authentication: ${AUTH_METHOD}${NC}"
        echo -e "${GREEN}✓ Environment file (.env) updated${NC}"
    else
        echo -e "${RED}✗ Failed to pull secrets${NC}"
        echo -e "${YELLOW}Token may be invalid or expired. Try:${NC}"
        echo -e "  - Check token validity in Infisical dashboard"
        echo -e "  - Run: ${CYAN}./scripts/setup-token.sh${NC} to get a new token"
        echo -e "  - Or use login-based: ${CYAN}./scripts/setup-infisical.sh${NC}"

        # Restore backup if pull failed
        if [ -f ".env.backup.${TIMESTAMP}" ]; then
            echo -e "${YELLOW}Restoring previous .env file...${NC}"
            mv .env.backup.${TIMESTAMP} .env
        fi
        exit 1
    fi
else
    # Login-based authentication
    if infisical export --env="${ENV}" --format=dotenv > .env 2>/dev/null; then
        echo -e "${GREEN}✓ Secrets successfully synced from Infisical${NC}"
        echo -e "${GREEN}✓ Authentication: ${AUTH_METHOD}${NC}"
        echo -e "${GREEN}✓ Environment file (.env) updated${NC}"
    else
        echo -e "${RED}✗ Failed to pull secrets${NC}"
        echo -e "${YELLOW}Please check your Infisical configuration and try again${NC}"
        echo -e "${YELLOW}Or use token-based auth: ${CYAN}./scripts/setup-token.sh${NC}"

        # Restore backup if pull failed
        if [ -f ".env.backup.${TIMESTAMP}" ]; then
            echo -e "${YELLOW}Restoring previous .env file...${NC}"
            mv .env.backup.${TIMESTAMP} .env
        fi
        exit 1
    fi
fi

# Clean up old backups (keep only last 5)
echo -e "${BLUE}Cleaning up old backups...${NC}"
ls -t .env.backup.* 2>/dev/null | tail -n +6 | xargs -r rm

echo ""
echo -e "${GREEN}Done! You can now run: pnpm dev${NC}"
