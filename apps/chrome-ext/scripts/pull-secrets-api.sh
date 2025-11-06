#!/bin/bash
set -e

# =============================================================================
# Infisical Secrets Puller (API-based - No CLI Installation Required)
# =============================================================================
# This script pulls secrets directly from Infisical API using service tokens
# No need to install Infisical CLI!
#
# Usage:
#   ./scripts/pull-secrets-api.sh [environment]
#
# Examples:
#   ./scripts/pull-secrets-api.sh          # Pull dev secrets
#   ./scripts/pull-secrets-api.sh staging  # Pull staging secrets
#   ./scripts/pull-secrets-api.sh prod     # Pull production secrets
#
# Token Setup:
#   1. Get token from Infisical Dashboard → Settings → Service Tokens
#   2. Save to .infisical-token file OR set environment variable
#
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get environment (default to dev)
ENV="${1:-dev}"

# =============================================================================
# Determine Infisical API URL
# =============================================================================
# Priority:
# 1. Environment variable INFISICAL_API_URL
# 2. Config file .infisical-config
# 3. Default to cloud (https://app.infisical.com)

INFISICAL_BASE_URL=""

# Priority 1: Environment variable
if [ -n "$INFISICAL_API_URL" ]; then
    INFISICAL_BASE_URL="$INFISICAL_API_URL"
fi

# Priority 2: Config file
if [ -z "$INFISICAL_BASE_URL" ] && [ -f ".infisical-config" ]; then
    INFISICAL_BASE_URL=$(grep "^INFISICAL_API_URL=" .infisical-config | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi

# Priority 3: Default to cloud
if [ -z "$INFISICAL_BASE_URL" ]; then
    INFISICAL_BASE_URL="https://app.infisical.com"
fi

# Remove trailing slash if exists
INFISICAL_BASE_URL="${INFISICAL_BASE_URL%/}"

# Construct API endpoint
INFISICAL_API="${INFISICAL_BASE_URL}/api/v3/secrets/raw"

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Infisical Secrets Puller (API Mode)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Environment: ${ENV}${NC}"
echo -e "${CYAN}Infisical URL: ${INFISICAL_BASE_URL}${NC}"
echo ""

# =============================================================================
# Function: Find token
# =============================================================================
find_token() {
    local token=""

    # Priority 1: Environment variable (e.g., INFISICAL_TOKEN_DEV)
    local env_var_name="INFISICAL_TOKEN_$(echo ${ENV} | tr '[:lower:]' '[:upper:]')"
    if [ -n "${!env_var_name}" ]; then
        token="${!env_var_name}"
        echo -e "${GREEN}✓ Using token from environment variable: ${env_var_name}${NC}"
        echo "$token"
        return 0
    fi

    # Priority 2: .infisical-token file (environment-specific)
    if [ -f ".infisical-token.${ENV}" ]; then
        token=$(cat .infisical-token.${ENV} | tr -d '[:space:]')
        echo -e "${GREEN}✓ Using token from file: .infisical-token.${ENV}${NC}"
        echo "$token"
        return 0
    fi

    # Priority 3: .infisical-token file (default)
    if [ -f ".infisical-token" ]; then
        token=$(cat .infisical-token | tr -d '[:space:]')
        echo -e "${GREEN}✓ Using token from file: .infisical-token${NC}"
        echo "$token"
        return 0
    fi

    # No token found
    echo -e "${RED}✗ No Infisical token found${NC}"
    echo ""
    echo -e "${YELLOW}Please provide a token using one of these methods:${NC}"
    echo ""
    echo -e "  ${CYAN}Option 1: Environment Variable${NC}"
    echo -e "  export INFISICAL_TOKEN_$(echo ${ENV} | tr '[:lower:]' '[:upper:]')='st.xxx...xxx'"
    echo ""
    echo -e "  ${CYAN}Option 2: Token File (environment-specific)${NC}"
    echo -e "  echo 'st.xxx...xxx' > .infisical-token.${ENV}"
    echo ""
    echo -e "  ${CYAN}Option 3: Token File (default)${NC}"
    echo -e "  echo 'st.xxx...xxx' > .infisical-token"
    echo ""
    echo -e "${YELLOW}To get a token:${NC}"
    echo -e "  1. Go to Infisical Dashboard: ${CYAN}https://app.infisical.com${NC}"
    echo -e "  2. Select your project"
    echo -e "  3. Go to Settings → Service Tokens"
    echo -e "  4. Create new token with '${ENV}' environment and 'Read' permission"
    echo -e "  5. Copy the token (starts with 'st.')"
    echo ""
    return 1
}

# =============================================================================
# Function: Pull secrets from Infisical API
# =============================================================================
pull_secrets() {
    local token="$1"
    local temp_file=$(mktemp)

    echo -e "${BLUE}Fetching secrets from Infisical API...${NC}"

    # Make API request
    local response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer ${token}" \
        "${INFISICAL_API}?environment=${ENV}&workspaceId=auto" 2>&1)

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')

    # Success
    if [ "$http_code" = "200" ]; then
        # Continue to parse secrets below
        :
    else
        # Error handling
        echo -e "${RED}✗ Failed to fetch secrets (HTTP ${http_code})${NC}"
        echo ""

        # Parse error message if available
        local error_msg=""
        if command -v jq &> /dev/null && [ -n "$body" ]; then
            error_msg=$(echo "$body" | jq -r '.message // .error // empty' 2>/dev/null)
            if [ -n "$error_msg" ]; then
                echo -e "${YELLOW}Server Response: ${error_msg}${NC}"
                echo ""
            fi
        fi

        # Specific error messages based on HTTP code
        case $http_code in
            000)
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo -e "${RED}  CONNECTION FAILED${NC}"
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo ""
                echo -e "${YELLOW}Cannot connect to: ${CYAN}${INFISICAL_BASE_URL}${NC}"
                echo ""
                echo -e "${CYAN}Quick checks:${NC}"
                echo -e "  curl -v ${INFISICAL_BASE_URL}/api/status"
                echo -e "  ping ${INFISICAL_BASE_URL#*://}"
                ;;
            401)
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo -e "${RED}  UNAUTHORIZED (401)${NC}"
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo ""
                echo -e "${YELLOW}Token is invalid or expired${NC}"
                echo ""
                echo -e "${CYAN}Fix:${NC}"
                echo -e "  1. Create new token at: ${CYAN}${INFISICAL_BASE_URL}${NC}"
                echo -e "  2. Run: ${CYAN}pnpm secrets:setup:token${NC}"
                ;;
            403)
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo -e "${RED}  FORBIDDEN (403)${NC}"
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo ""
                echo -e "${YELLOW}Token doesn't have permission for '${ENV}' environment${NC}"
                echo ""
                echo -e "${CYAN}Check:${NC}"
                echo -e "  - Token has 'Read' permission"
                echo -e "  - Token has access to '${ENV}' environment"
                echo -e "  - Token is for correct project"
                ;;
            404)
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo -e "${RED}  NOT FOUND (404)${NC}"
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo ""
                echo -e "${YELLOW}API endpoint not found${NC}"
                echo ""
                echo -e "${YELLOW}Tried: ${CYAN}${INFISICAL_API}${NC}"
                echo ""
                echo -e "${YELLOW}Common fixes:${NC}"
                echo -e "  1. Verify Infisical URL: ${CYAN}${INFISICAL_BASE_URL}${NC}"
                echo -e "  2. Remove trailing slash from URL"
                echo -e "  3. Check reverse proxy config"
                echo -e "  4. Verify Infisical version >= 0.20.0"
                echo ""
                echo -e "${CYAN}Test endpoints:${NC}"
                echo -e "  curl ${INFISICAL_BASE_URL}/api/status"
                echo -e "  curl ${INFISICAL_BASE_URL}/api/v3/secrets/raw"
                echo ""
                echo -e "${YELLOW}Your config:${NC}"
                if [ -f ".infisical-config" ]; then
                    echo -e "  Config file: ${CYAN}.infisical-config${NC}"
                    cat .infisical-config
                else
                    echo -e "  Using default: ${CYAN}https://app.infisical.com${NC}"
                fi
                ;;
            500|502|503)
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo -e "${RED}  SERVER ERROR (${http_code})${NC}"
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo ""
                echo -e "${YELLOW}Infisical server error - check server logs${NC}"
                ;;
            *)
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo -e "${RED}  UNEXPECTED ERROR (${http_code})${NC}"
                echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo ""
                echo -e "${YELLOW}Debug Info:${NC}"
                echo -e "  URL: ${CYAN}${INFISICAL_BASE_URL}${NC}"
                echo -e "  API: ${CYAN}${INFISICAL_API}${NC}"
                echo -e "  Env: ${CYAN}${ENV}${NC}"
                echo -e "  HTTP: ${CYAN}${http_code}${NC}"
                if [ -n "$body" ]; then
                    echo ""
                    echo -e "${YELLOW}Response:${NC}"
                    echo "$body" | head -10
                fi
                ;;
        esac

        echo ""
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo -e "${CYAN}See: SELF_HOSTED_INFISICAL.md for troubleshooting${NC}"
        echo ""

        rm -f "$temp_file"
        return 1
    fi

    # Check if jq is available for JSON parsing
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}✗ 'jq' command not found${NC}"
        echo -e "${YELLOW}Please install jq to parse JSON:${NC}"
        echo -e "  macOS: ${CYAN}brew install jq${NC}"
        echo -e "  Ubuntu/Debian: ${CYAN}sudo apt-get install jq${NC}"
        rm -f "$temp_file"
        return 1
    fi

    # Parse JSON and convert to .env format
    echo "$body" | jq -r '.secrets[] | "\(.secretKey)=\(.secretValue)"' > "$temp_file"

    # Check if secrets were found
    if [ ! -s "$temp_file" ]; then
        echo -e "${YELLOW}⚠ No secrets found in '${ENV}' environment${NC}"
        echo ""
        echo -e "${CYAN}Please check:${NC}"
        echo -e "  1. Environment name is correct (dev/staging/prod)"
        echo -e "  2. Secrets exist in Infisical for this environment"
        echo -e "  3. Token has access to this environment"
        rm -f "$temp_file"
        return 1
    fi

    local secret_count=$(wc -l < "$temp_file" | tr -d '[:space:]')
    echo -e "${GREEN}✓ Successfully fetched ${secret_count} secrets${NC}"

    echo "$temp_file"
    return 0
}

# =============================================================================
# Main execution
# =============================================================================

# Find token
TOKEN=$(find_token)
if [ $? -ne 0 ]; then
    exit 1
fi

echo ""

# Backup existing .env
if [ -f ".env" ]; then
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    echo -e "${YELLOW}Backing up existing .env to .env.backup.${TIMESTAMP}${NC}"
    cp .env .env.backup.${TIMESTAMP}
fi

# Pull secrets
TEMP_FILE=$(pull_secrets "$TOKEN")
if [ $? -ne 0 ]; then
    # Restore backup if exists
    if [ -f ".env.backup.${TIMESTAMP}" ]; then
        echo -e "${YELLOW}Restoring previous .env file...${NC}"
        mv .env.backup.${TIMESTAMP} .env
    fi
    exit 1
fi

# Move temp file to .env
mv "$TEMP_FILE" .env
echo -e "${GREEN}✓ Environment file (.env) updated${NC}"

# Clean up old backups (keep only last 5)
echo -e "${BLUE}Cleaning up old backups...${NC}"
ls -t .env.backup.* 2>/dev/null | tail -n +6 | xargs -r rm

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Secrets successfully synced!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}You can now run: ${NC}pnpm dev"
echo ""
