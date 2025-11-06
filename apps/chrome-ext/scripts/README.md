# Scripts Directory

This directory contains utility scripts for the Radas Chrome Extension.

## Available Scripts

### 🔐 Infisical Setup & Secrets Management

We provide **two methods** for pulling secrets:

#### Method 1: Token-Based (Recommended - No CLI!) 🚀

**Advantages:**
- ✅ No Infisical CLI installation required
- ✅ Just needs `curl` and `jq`
- ✅ Direct API calls
- ✅ Faster and simpler

---

#### `setup-token.sh`
Interactive wizard for setting up Infisical token-based authentication.

**Usage:**
```bash
./scripts/setup-token.sh
# or
pnpm secrets:setup:token
```

**What it does:**
- Guides you to create service token in Infisical
- Saves token securely to `.infisical-token` file
- Tests the token
- Shows next steps

**Requirements:**
- `jq`: `brew install jq` (macOS) or `apt-get install jq` (Ubuntu)

**When to use:**
- First time setup (preferred over CLI)
- Don't want to install Infisical CLI
- Want token-based workflow

---

#### `pull-secrets-api.sh`
Pull secrets directly from Infisical API (no CLI required).

**Usage:**
```bash
# Development environment (default)
./scripts/pull-secrets-api.sh
# or
pnpm secrets:api

# Staging environment
./scripts/pull-secrets-api.sh staging
# or
pnpm secrets:api:staging

# Production environment
./scripts/pull-secrets-api.sh prod
# or
pnpm secrets:api:prod
```

**What it does:**
- Pulls secrets directly from Infisical API
- Uses token from file or environment variable
- Backs up existing `.env` file
- Updates `.env` file
- Cleans up old backups (keeps last 5)

**Token Sources (in priority order):**
1. Environment variable: `INFISICAL_TOKEN_DEV`, `INFISICAL_TOKEN_STAGING`, etc.
2. Environment-specific file: `.infisical-token.dev`, `.infisical-token.staging`, etc.
3. Default file: `.infisical-token`

**Requirements:**
- `curl` (pre-installed)
- `jq` for JSON parsing

**When to use:**
- Daily development workflow
- When secrets have been updated
- Before building for production
- When switching environments

---

#### Method 2: CLI-Based (Full Features)

**Advantages:**
- ✅ Full Infisical features
- ✅ Live secret injection
- ✅ Official tooling

---

#### `setup-infisical.sh`
Initial setup for Infisical CLI-based authentication.

**Usage:**
```bash
./scripts/setup-infisical.sh
# or
pnpm secrets:setup
```

**What it does:**
- Installs Infisical CLI (if not already installed)
- Logs you into Infisical
- Initializes project connection
- Pulls initial secrets

**When to use:**
- Want to use Infisical CLI features
- Prefer login-based authentication
- Need live secret injection

---

#### `pull-secrets.sh`
Pull secrets using Infisical CLI or tokens.

**Usage:**
```bash
# Development environment (default)
./scripts/pull-secrets.sh
# or
pnpm secrets:pull

# Staging environment
./scripts/pull-secrets.sh staging
# or
pnpm secrets:pull:staging

# Production environment
./scripts/pull-secrets.sh prod
# or
pnpm secrets:pull:prod
```

**What it does:**
- Backs up existing `.env` file (if it exists)
- Pulls latest secrets from Infisical
- Updates `.env` file
- Cleans up old backups (keeps last 5)

**When to use:**
- Start of each development session
- When secrets have been updated in Infisical
- Before building for production
- When switching environments

---

## Quick Reference

### First Time Setup

**Option 1: Token-Based (Recommended - No CLI!)**
```bash
# 1. Setup token
pnpm secrets:setup:token

# 2. Pull secrets
pnpm secrets:api

# 3. Start developing
pnpm dev
```

**Option 2: CLI-Based**
```bash
# 1. Setup Infisical CLI
pnpm secrets:setup

# 2. Pull secrets
pnpm secrets:pull

# 3. Start developing
pnpm dev
```

### Daily Development Workflow

**Token-Based:**
```bash
# Pull latest secrets (recommended daily)
pnpm secrets:api

# Start development
pnpm dev
```

**CLI-Based:**
```bash
# Pull latest secrets (recommended daily)
pnpm secrets:pull

# Start development
pnpm dev
```

### Working with Different Environments

**Token-Based:**
```bash
# Development
pnpm secrets:api              # or secrets:api:dev

# Staging
pnpm secrets:api:staging

# Production
pnpm secrets:api:prod
```

**CLI-Based:**
```bash
# Development
pnpm secrets:pull

# Staging
pnpm secrets:pull:staging

# Production
pnpm secrets:pull:prod
```

## Script Requirements

All scripts require:
- Bash shell
- Internet connection
- Infisical CLI (auto-installed by setup script)
- Access to Infisical workspace

## Troubleshooting

**Permission denied:**
```bash
chmod +x scripts/*.sh
```

**Infisical CLI not found:**
```bash
pnpm secrets:setup
```

**Not logged in:**
```bash
infisical login
```

## More Information

See [INFISICAL_SETUP.md](../INFISICAL_SETUP.md) for comprehensive documentation.
