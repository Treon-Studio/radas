# Infisical Setup Guide

This guide explains how to use Infisical to manage environment variables and secrets for the Radas Chrome Extension.

## Table of Contents

- [Why Infisical?](#why-infisical)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Available Scripts](#available-scripts)
- [Working with Different Environments](#working-with-different-environments)
- [Team Onboarding](#team-onboarding)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Why Infisical?

Infisical provides several benefits:

- **Security**: Secrets are never committed to git
- **Team Collaboration**: Everyone has access to the same secrets
- **Environment Management**: Easy switching between dev/staging/prod
- **Audit Trail**: Track who accessed or modified secrets
- **Auto-sync**: Always have the latest secrets

## Prerequisites

- macOS (Homebrew) or Linux
- Access to the Radas Infisical workspace
- Admin should have already set up the project in Infisical dashboard

## Setup Methods

We provide **two ways** to pull secrets from Infisical:

### Method 1: Token-Based (Recommended - No CLI Installation!) 🚀

**Advantages:**
- ✅ No Infisical CLI installation required
- ✅ Faster setup (just `jq` and `curl`)
- ✅ Works on any platform with bash
- ✅ Direct API calls
- ✅ Perfect for development

**Requirements:**
- `curl` (pre-installed on macOS/Linux)
- `jq` for JSON parsing: `brew install jq` (macOS) or `apt-get install jq` (Ubuntu)

**Quick Start:**
```bash
# 1. Setup token (one-time)
pnpm secrets:setup:token

# 2. Pull secrets (no CLI needed!)
pnpm secrets:api

# 3. Start development
pnpm dev
```

See [Token-Based Setup](#token-based-setup-no-cli) section below for details.

---

### Method 2: CLI-Based (Full Features)

**Advantages:**
- ✅ Full Infisical features
- ✅ Live secret injection
- ✅ Multiple authentication methods
- ✅ Official Infisical tooling

**Requirements:**
- Infisical CLI installed

**Quick Start:**
```bash
# 1. Setup (installs CLI + login)
pnpm secrets:setup

# 2. Pull secrets
pnpm secrets:pull

# 3. Start development
pnpm dev
```

See [CLI-Based Setup](#cli-based-setup) section below for details.

---

## Quick Start

### Token-Based Setup (No CLI)

1. **Run the setup wizard:**

   ```bash
   pnpm secrets:setup:token
   ```

   This interactive wizard will:
   - Guide you to create a service token in Infisical
   - Save the token securely to `.infisical-token` file
   - Test the token
   - Show you next steps

2. **Pull secrets:**

   ```bash
   pnpm secrets:api        # Pull dev secrets
   ```

3. **Start development:**

   ```bash
   pnpm dev
   ```

That's it! No CLI installation needed! 🎉

---

### CLI-Based Setup

### First Time Setup

1. **Run the setup script:**

   ```bash
   pnpm secrets:setup
   ```

   This will:
   - Install Infisical CLI (if not already installed)
   - Prompt you to login to Infisical
   - Initialize the project connection
   - Pull the latest secrets to `.env` file

2. **Start development:**

   ```bash
   # Option 1: Use with Infisical (recommended for production builds)
   pnpm dev:infisical

   # Option 2: Pull secrets first, then use normal dev (recommended for development)
   pnpm secrets:pull
   pnpm dev
   ```

That's it! You're ready to develop.

## Available Scripts

### Secrets Management - Token-Based (No CLI) 🚀

```bash
# Initial setup (run once)
pnpm secrets:setup:token

# Pull latest secrets from Infisical (dev environment)
pnpm secrets:api              # or secrets:api:dev

# Pull secrets from staging environment
pnpm secrets:api:staging

# Pull secrets from production environment
pnpm secrets:api:prod
```

### Secrets Management - CLI-Based

```bash
# Initial setup (run once, installs CLI)
pnpm secrets:setup

# Pull latest secrets from Infisical (dev environment)
pnpm secrets:pull

# Pull secrets from staging environment
pnpm secrets:pull:staging

# Pull secrets from production environment
pnpm secrets:pull:prod
```

**Note:** Both methods produce the same `.env` file. Choose the one you prefer!

### Development with Infisical

```bash
# Development mode with live Infisical integration
pnpm dev:infisical          # Chrome
pnpm dev:infisical:firefox  # Firefox

# Build with Infisical secrets
pnpm build:infisical        # Chrome
pnpm build:infisical:firefox # Firefox
```

### Standard Development (requires pulling secrets first)

```bash
# Standard development (uses .env file)
pnpm dev          # Chrome
pnpm dev:firefox  # Firefox

# Standard build (uses .env file)
pnpm build        # Chrome
pnpm build:firefox # Firefox
```

## Working with Different Environments

Infisical supports multiple environments (dev, staging, production):

### Pulling Secrets

```bash
# Development (default)
pnpm secrets:pull

# Staging
pnpm secrets:pull:staging

# Production
pnpm secrets:pull:prod
```

### Running with Specific Environment

```bash
# Development environment (default)
infisical run --env=dev -- pnpm dev

# Staging environment
infisical run --env=staging -- pnpm build

# Production environment
infisical run --env=prod -- pnpm build
```

## Token-Based Workflow Details

### Getting Your Token

**Option 1: Interactive Wizard (Recommended)**
```bash
pnpm secrets:setup:token
```

This will guide you through:
1. Creating a service token in Infisical Dashboard
2. Selecting the environment (dev/staging/prod)
3. Saving the token securely
4. Testing the token
5. Showing usage instructions

**Option 2: Manual Setup**

1. Go to Infisical Dashboard: https://app.infisical.com
2. Select your project (e.g., "Radas Chrome Extension")
3. Navigate to: **Settings → Service Tokens**
4. Click: **Create Token**
5. Configure:
   - **Name**: `Local Development - Your Name`
   - **Environment**: `dev` (or staging/prod)
   - **Permission**: `Read`
   - **Expiration**: `Never` (or set date)
6. Click **Create** and **copy the token**
7. Save to file:
   ```bash
   # For dev environment
   echo 'st.xxxxx.yyyyy.zzzzz' > .infisical-token.dev

   # For all environments (shared token)
   echo 'st.xxxxx.yyyyy.zzzzz' > .infisical-token

   # Secure the file
   chmod 600 .infisical-token*
   ```

### Token Storage Options

The API-based script supports multiple token storage methods (in priority order):

**1. Environment Variables (Highest Priority)**
```bash
export INFISICAL_TOKEN_DEV='st.xxxxx.yyyyy.zzzzz'
export INFISICAL_TOKEN_STAGING='st.xxxxx.yyyyy.zzzzz'
export INFISICAL_TOKEN_PROD='st.xxxxx.yyyyy.zzzzz'
```

**2. Environment-Specific Files**
```bash
.infisical-token.dev       # For dev environment
.infisical-token.staging   # For staging environment
.infisical-token.prod      # For production environment
```

**3. Default File**
```bash
.infisical-token           # Used for all environments
```

### Daily Development Workflow (Token-Based)

```bash
# Morning: Pull latest secrets
pnpm secrets:api          # Dev environment

# Development
pnpm dev

# If secrets update during the day
pnpm secrets:api          # Re-pull
```

### Switching Environments

```bash
# Pull dev secrets
pnpm secrets:api:dev

# Pull staging secrets
pnpm secrets:api:staging

# Pull production secrets
pnpm secrets:api:prod
```

### Token Security

✅ **What's Secure:**
- Tokens are in `.gitignore` (never committed)
- File permissions set to 600 (owner read/write only)
- Read-only permission (can't modify secrets)
- Environment-specific isolation
- Can be revoked anytime in Infisical Dashboard

⚠️ **Best Practices:**
- Use separate tokens for each environment
- Rotate tokens every 90 days
- Never share tokens via email/Slack
- Revoke immediately if compromised
- Use environment variables in CI/CD

### Token Comparison: Personal vs Service

| Feature | Personal Token | Service Token |
|---------|---------------|---------------|
| Authentication | User account | Token-based |
| Expiration | Based on login session | Configurable |
| Sharing | Tied to user | Can be shared |
| CI/CD | Not recommended | ✅ Perfect |
| Revocation | Logout | Dashboard |
| Audit | User actions | Token actions |

**Recommendation:** Use Service Tokens for development and CI/CD.

### Troubleshooting Token-Based Setup

**"Token validation failed"**
- Token may be invalid or expired
- Check token has access to environment
- Verify token has Read permission
- Check token in Infisical Dashboard

**"jq command not found"**
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq
```

**"No secrets found"**
- Verify environment name is correct (dev/staging/prod)
- Check secrets exist in Infisical for this environment
- Ensure token has access to this environment

**Want to switch to CLI-based?**
```bash
# Remove token files
rm .infisical-token*

# Setup with CLI
pnpm secrets:setup
```

## Team Onboarding

### Token-Based Onboarding (Recommended)

When a new team member joins:

1. **Admin grants access** to the Infisical project
2. **Admin creates service token** for the team member:
   - Go to Infisical Dashboard → Settings → Service Tokens
   - Create token with dev environment + Read permission
   - Share token securely (1Password, LastPass, etc.)
3. **Team member saves token:**
   ```bash
   echo 'st.xxxxx.yyyyy.zzzzz' > .infisical-token.dev
   chmod 600 .infisical-token.dev
   ```
4. **Pull secrets and start developing:**
   ```bash
   pnpm secrets:api
   pnpm dev
   ```

No CLI installation needed! 🎉

### CLI-Based Onboarding

When a new team member joins:

1. **Admin grants access** to the Infisical project
2. **Team member runs setup:**
   ```bash
   pnpm secrets:setup
   ```
3. **Login to Infisical** when prompted
4. **Select the project** from the list
5. **Start developing!**

No need to share `.env` files via Slack/email anymore!

## CI/CD Integration

**✨ Full CI/CD setup available!**

We have complete GitHub Actions workflows configured for:
- ✅ Automatic builds on Pull Requests
- ✅ Staging deployments
- ✅ Production releases with approval
- ✅ Infisical integration for all environments

**See the complete guide:** [CICD_SETUP.md](./CICD_SETUP.md)

### Quick CI/CD Setup

1. **Create Infisical service tokens** for dev/staging/prod
2. **Add to GitHub Secrets:**
   - `INFISICAL_TOKEN_CHROME_EXT_DEV`
   - `INFISICAL_TOKEN_CHROME_EXT_STAGING`
   - `INFISICAL_TOKEN_CHROME_EXT_PROD`
3. **Workflows run automatically!**

For detailed instructions, troubleshooting, and advanced configuration, see [CICD_SETUP.md](./CICD_SETUP.md)

## Troubleshooting

### "Infisical CLI not found"

Run the setup script:
```bash
pnpm secrets:setup
```

Or install manually:
```bash
# macOS
brew install infisical/get-cli/infisical

# Linux
bash <(curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh')
```

### "Not logged in"

```bash
infisical login
```

### ".infisical.json not found"

This means the project isn't initialized. Run:
```bash
pnpm secrets:setup
```

### "Failed to pull secrets"

Check that you:
1. Are logged in: `infisical user`
2. Have access to the project
3. Selected the correct project during init
4. Have internet connection

### "Permission denied" on scripts

Make scripts executable:
```bash
chmod +x scripts/*.sh
```

### Secrets are outdated

Pull the latest secrets:
```bash
pnpm secrets:pull
```

## Best Practices

### ✅ DO

- **Pull secrets regularly** to get latest updates
- **Use `dev:infisical`** for production builds
- **Use environment-specific** secrets (dev/staging/prod)
- **Commit `.env.example`** with dummy values
- **Add `.env` to `.gitignore`** (already done)
- **Use descriptive secret names** (e.g., `VITE_FIREBASE_API_KEY`)
- **Document required secrets** in `.env.example`

### ❌ DON'T

- **Don't commit** `.env` files
- **Don't commit** `.infisical.json` (already in .gitignore)
- **Don't share secrets** via Slack/email
- **Don't hardcode secrets** in source code
- **Don't use production secrets** in development
- **Don't skip pulling secrets** before building

### Development Workflow

**Recommended workflow:**

```bash
# Start of day
pnpm secrets:pull

# Development (uses cached .env)
pnpm dev

# Before committing/building
pnpm secrets:pull  # Get latest secrets
pnpm build
```

**Alternative workflow (always live):**

```bash
# Development (always uses latest from Infisical)
pnpm dev:infisical
```

### Secret Naming Convention

Follow these conventions in Infisical:

```bash
# Vite environment variables (exposed to browser)
VITE_*

# Firebase configuration
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
# ... etc

# Server-side only (not exposed to browser)
SECRET_*
PRIVATE_*

# Environment-specific
DB_URL_DEV
DB_URL_STAGING
DB_URL_PROD
```

### Security Tips

1. **Rotate secrets** regularly (every 90 days)
2. **Use different secrets** for each environment
3. **Limit access** to production secrets
4. **Enable audit logs** in Infisical
5. **Review access** regularly
6. **Use service tokens** for CI/CD (not personal tokens)

## Support

For issues related to:

- **Infisical CLI**: https://infisical.com/docs/cli/overview
- **Infisical Platform**: Contact your admin or https://infisical.com/docs
- **This Setup**: Open an issue in the repository

## Additional Resources

- [Infisical Documentation](https://infisical.com/docs)
- [Infisical CLI Reference](https://infisical.com/docs/cli/commands)
- [Environment Variables Best Practices](https://12factor.net/config)
