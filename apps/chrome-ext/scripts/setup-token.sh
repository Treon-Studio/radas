#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

clear

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Infisical Token Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "This script will help you set up Infisical tokens for"
echo -e "pulling secrets ${CYAN}without installing Infisical CLI${NC}."
echo ""
echo -e "${YELLOW}Prerequisites:${NC}"
echo -e "  ✓ Access to Infisical Dashboard"
echo -e "  ✓ Permission to create service tokens"
echo ""
echo -e "Press ${CYAN}Enter${NC} to continue or ${CYAN}Ctrl+C${NC} to cancel..."
read

# =============================================================================
# Step 1: Configure Infisical URL
# =============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 1: Configure Infisical URL${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "Are you using self-hosted Infisical or Infisical Cloud?"
echo ""
echo -e "${CYAN}1.${NC} Infisical Cloud (https://app.infisical.com)"
echo -e "${CYAN}2.${NC} Self-hosted Infisical"
echo ""
read -p "Enter choice (1-2): " hosting_choice

INFISICAL_URL=""

case $hosting_choice in
    1)
        INFISICAL_URL="https://app.infisical.com"
        echo -e "${GREEN}✓ Using Infisical Cloud${NC}"
        ;;
    2)
        echo ""
        echo -e "${YELLOW}Enter your self-hosted Infisical URL:${NC}"
        echo -e "${CYAN}Example: https://infisical.yourcompany.com${NC}"
        echo ""
        read -p "URL: " custom_url

        # Remove trailing slash if exists
        INFISICAL_URL="${custom_url%/}"

        # Validate URL format
        if [[ ! $INFISICAL_URL =~ ^https?:// ]]; then
            echo -e "${RED}✗ Invalid URL format. Must start with http:// or https://${NC}"
            exit 1
        fi

        echo -e "${GREEN}✓ Using self-hosted: ${INFISICAL_URL}${NC}"

        # Save to config file
        echo "INFISICAL_API_URL=\"${INFISICAL_URL}\"" > .infisical-config
        chmod 600 .infisical-config
        echo -e "${GREEN}✓ Configuration saved to .infisical-config${NC}"
        ;;
    *)
        echo -e "${RED}✗ Invalid choice${NC}"
        exit 1
        ;;
esac

# =============================================================================
# Step 2: Create Service Token
# =============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 2: Create Service Token in Infisical${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "Follow these steps to create a service token:"
echo ""
echo -e "${CYAN}1.${NC} Open Infisical Dashboard: ${CYAN}${INFISICAL_URL}${NC}"
echo -e "${CYAN}2.${NC} Select your project (e.g., 'Radas Chrome Extension')"
echo -e "${CYAN}3.${NC} Go to: ${CYAN}Settings → Service Tokens${NC}"
echo -e "${CYAN}4.${NC} Click: ${CYAN}Create Token${NC}"
echo -e "${CYAN}5.${NC} Configure:"
echo -e "     • Name: ${CYAN}Local Development${NC} (or your name)"
echo -e "     • Environment: ${CYAN}dev${NC} (or staging/prod)"
echo -e "     • Permission: ${CYAN}Read${NC}"
echo -e "     • Expiration: ${CYAN}Never${NC} (or set a date)"
echo -e "${CYAN}6.${NC} Click ${CYAN}Create${NC} and ${CYAN}copy the token${NC}"
echo ""
echo -e "${YELLOW}⚠ Important: Token is shown only once!${NC}"
echo ""

# =============================================================================
# Step 3: Choose environment
# =============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 3: Select Environment${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "Which environment is this token for?"
echo ""
echo -e "${CYAN}1.${NC} Development (dev) - ${GREEN}Recommended for local development${NC}"
echo -e "${CYAN}2.${NC} Staging (staging)"
echo -e "${CYAN}3.${NC} Production (prod)"
echo -e "${CYAN}4.${NC} All environments (shared token)"
echo ""
read -p "Enter choice (1-4): " env_choice

case $env_choice in
    1)
        ENV="dev"
        TOKEN_FILE=".infisical-token.dev"
        ;;
    2)
        ENV="staging"
        TOKEN_FILE=".infisical-token.staging"
        ;;
    3)
        ENV="prod"
        TOKEN_FILE=".infisical-token.prod"
        ;;
    4)
        ENV="all"
        TOKEN_FILE=".infisical-token"
        ;;
    *)
        echo -e "${RED}✗ Invalid choice${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✓ Selected: ${ENV}${NC}"

# =============================================================================
# Step 4: Enter token
# =============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 4: Enter Your Token${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "Paste your Infisical service token below:"
echo -e "${YELLOW}(Token should start with 'st.')${NC}"
echo ""
read -sp "Token: " TOKEN
echo ""

# Validate token format
if [[ ! $TOKEN =~ ^st\. ]]; then
    echo -e "${RED}✗ Invalid token format${NC}"
    echo -e "${YELLOW}Token should start with 'st.'${NC}"
    exit 1
fi

# =============================================================================
# Step 5: Save token
# =============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 5: Save Token${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Check if file already exists
if [ -f "$TOKEN_FILE" ]; then
    echo -e "${YELLOW}⚠ Token file already exists: ${TOKEN_FILE}${NC}"
    read -p "Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Setup cancelled${NC}"
        exit 0
    fi
fi

# Save token
echo "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"  # Restrict permissions
echo -e "${GREEN}✓ Token saved to: ${TOKEN_FILE}${NC}"

# =============================================================================
# Step 6: Test token
# =============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 6: Test Token${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Testing token...${NC}"

# Determine which environment to test
TEST_ENV=${ENV}
if [ "$ENV" = "all" ]; then
    TEST_ENV="dev"
    echo -e "${YELLOW}ℹ Testing with 'dev' environment${NC}"
fi

# Test API call with configured URL
TEST_API_URL="${INFISICAL_URL}/api/v3/secrets/raw"
echo -e "${CYAN}Testing URL: ${TEST_API_URL}${NC}"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${TEST_API_URL}?environment=${TEST_ENV}&workspaceId=auto" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Success
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Token is valid!${NC}"

    # Try to count secrets if jq is available
    if command -v jq &> /dev/null; then
        SECRET_COUNT=$(echo "$BODY" | jq -r '.secrets | length' 2>/dev/null || echo "?")
        echo -e "${GREEN}✓ Found ${SECRET_COUNT} secrets in '${TEST_ENV}' environment${NC}"
    fi
else
    # Error handling with detailed messages
    echo -e "${RED}✗ Token validation failed (HTTP ${HTTP_CODE})${NC}"
    echo ""

    # Parse error message if jq available
    ERROR_MSG=""
    if command -v jq &> /dev/null && [ -n "$BODY" ]; then
        ERROR_MSG=$(echo "$BODY" | jq -r '.message // .error // empty' 2>/dev/null)
        if [ -n "$ERROR_MSG" ]; then
            echo -e "${YELLOW}Server Response: ${ERROR_MSG}${NC}"
            echo ""
        fi
    fi

    # Specific error messages based on HTTP code
    case $HTTP_CODE in
        000)
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}  CONNECTION FAILED${NC}"
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo -e "${YELLOW}Cannot connect to Infisical at:${NC}"
            echo -e "  ${CYAN}${INFISICAL_URL}${NC}"
            echo ""
            echo -e "${YELLOW}Possible causes:${NC}"
            echo -e "  1. Wrong URL - verify your Infisical URL"
            echo -e "  2. Infisical is not running"
            echo -e "  3. Network/firewall blocking connection"
            echo -e "  4. DNS resolution failed"
            echo ""
            echo -e "${CYAN}What to try:${NC}"
            echo -e "  # Test if Infisical is accessible:"
            echo -e "  curl -v ${INFISICAL_URL}/api/status"
            echo ""
            echo -e "  # Test DNS:"
            echo -e "  ping ${INFISICAL_URL#*://}"
            echo ""
            echo -e "  # For self-hosted, verify it's running:"
            echo -e "  docker ps | grep infisical"
            ;;
        401)
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}  UNAUTHORIZED (401)${NC}"
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo -e "${YELLOW}Token is invalid or expired${NC}"
            echo ""
            echo -e "${CYAN}What to do:${NC}"
            echo -e "  1. Go to: ${CYAN}${INFISICAL_URL}${NC}"
            echo -e "  2. Navigate to: Settings → Service Tokens"
            echo -e "  3. Check if token exists and is not expired"
            echo -e "  4. Create a new token if needed"
            echo -e "  5. Re-run: ${CYAN}pnpm secrets:setup:token${NC}"
            ;;
        403)
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}  FORBIDDEN (403)${NC}"
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo -e "${YELLOW}Token doesn't have permission${NC}"
            echo ""
            echo -e "${YELLOW}Possible causes:${NC}"
            echo -e "  - Token doesn't have access to '${TEST_ENV}' environment"
            echo -e "  - Token permission is not 'Read'"
            echo -e "  - Wrong workspace/project"
            echo ""
            echo -e "${CYAN}What to check:${NC}"
            echo -e "  1. Verify token has 'Read' permission"
            echo -e "  2. Check token has access to '${TEST_ENV}' environment"
            echo -e "  3. Ensure token is for correct project/workspace"
            ;;
        404)
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}  NOT FOUND (404)${NC}"
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo -e "${YELLOW}API endpoint not found${NC}"
            echo ""
            echo -e "${YELLOW}Tried to access:${NC}"
            echo -e "  ${CYAN}${TEST_API_URL}${NC}"
            echo ""
            echo -e "${YELLOW}Common causes for self-hosted:${NC}"
            echo -e "  1. Wrong base URL format"
            echo -e "  2. Reverse proxy stripping /api paths"
            echo -e "  3. Infisical version doesn't support API v3"
            echo -e "  4. Missing trailing/leading slashes"
            echo ""
            echo -e "${CYAN}What to try:${NC}"
            echo -e "  # Test if Infisical is accessible:"
            echo -e "  curl ${INFISICAL_URL}/api/status"
            echo ""
            echo -e "  # Test API v3 endpoint:"
            echo -e "  curl ${INFISICAL_URL}/api/v3/secrets/raw"
            echo ""
            echo -e "  # Check Infisical version:"
            echo -e "  curl ${INFISICAL_URL}/api/status | jq"
            echo ""
            echo -e "${YELLOW}Your Infisical URL:${NC} ${CYAN}${INFISICAL_URL}${NC}"
            echo ""
            echo -e "${YELLOW}Common fixes:${NC}"
            echo -e "  - Remove trailing slash: ${CYAN}https://infisical.com${NC} not ${CYAN}https://infisical.com/${NC}"
            echo -e "  - Check reverse proxy config (nginx/traefik)"
            echo -e "  - Verify Infisical version >= 0.20.0"
            ;;
        500|502|503)
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}  SERVER ERROR (${HTTP_CODE})${NC}"
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo -e "${YELLOW}Infisical server error${NC}"
            echo ""
            echo -e "${CYAN}What to check:${NC}"
            echo -e "  - Check Infisical logs"
            echo -e "  - Verify database connection"
            echo -e "  - Check server resources (CPU/memory)"
            echo -e "  - Try again in a few moments"
            ;;
        *)
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}  UNEXPECTED ERROR (${HTTP_CODE})${NC}"
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo -e "${YELLOW}Debug Information:${NC}"
            echo -e "  Infisical URL: ${CYAN}${INFISICAL_URL}${NC}"
            echo -e "  API Endpoint: ${CYAN}${TEST_API_URL}${NC}"
            echo -e "  Environment: ${CYAN}${TEST_ENV}${NC}"
            echo -e "  HTTP Status: ${CYAN}${HTTP_CODE}${NC}"
            if [ -n "$BODY" ]; then
                echo ""
                echo -e "${YELLOW}Response Body:${NC}"
                echo "$BODY" | head -20
            fi
            ;;
    esac

    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${CYAN}For more help, see:${NC}"
    echo -e "  - ${CYAN}SELF_HOSTED_INFISICAL.md${NC} (troubleshooting section)"
    echo -e "  - ${CYAN}TOKEN_BASED_SETUP.md${NC}"
    echo ""

    rm -f "$TOKEN_FILE"
    if [ -f ".infisical-config" ]; then
        echo -e "${YELLOW}Config file (.infisical-config) preserved for debugging${NC}"
    fi
    exit 1
fi

# =============================================================================
# Step 7: Instructions
# =============================================================================

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}What was created:${NC}"
if [ -f ".infisical-config" ]; then
    echo -e "  • Config file: .infisical-config (Infisical URL: ${INFISICAL_URL})"
fi
echo -e "  • Token file: ${TOKEN_FILE}"
echo -e "  • File permissions: 600 (read/write for owner only)"
echo -e "  • Auto-ignored by git: Yes (.gitignore configured)"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo ""
echo -e "  ${GREEN}Pull secrets:${NC}"
if [ "$ENV" = "all" ]; then
    echo -e "    pnpm secrets:api              ${YELLOW}# Pull dev secrets${NC}"
    echo -e "    pnpm secrets:api:staging      ${YELLOW}# Pull staging secrets${NC}"
    echo -e "    pnpm secrets:api:prod         ${YELLOW}# Pull production secrets${NC}"
else
    echo -e "    pnpm secrets:api:${ENV}           ${YELLOW}# Pull ${ENV} secrets${NC}"
fi
echo ""
echo -e "  ${GREEN}Start development:${NC}"
echo -e "    pnpm dev"
echo ""
echo -e "${YELLOW}Note: No Infisical CLI installation required! 🎉${NC}"
echo ""
echo -e "${CYAN}For other environments, run this script again.${NC}"
echo ""
