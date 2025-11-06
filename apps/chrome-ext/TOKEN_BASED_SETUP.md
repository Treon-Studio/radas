# Token-Based Secret Management (No CLI Required!)

This guide shows you how to use Infisical secrets **without installing the Infisical CLI**. Perfect for quick setup and development!

## 🚀 Quick Start (3 Steps)

```bash
# 1. Setup token (interactive wizard)
pnpm secrets:setup:token

# 2. Pull secrets
pnpm secrets:api

# 3. Start developing
pnpm dev
```

That's it! No CLI installation needed! 🎉

## Why Token-Based?

### Advantages

✅ **No CLI Installation**
- Just needs `curl` and `jq`
- Works on any platform with bash
- Simpler and faster setup

✅ **Direct API Access**
- Pulls secrets directly from Infisical API
- No intermediate tooling
- Transparent and predictable

✅ **Perfect for Development**
- Quick to set up
- Easy to understand
- Works great for local development

✅ **Team-Friendly**
- Admin creates token → shares securely → done
- No need for each developer to login
- Consistent across team

### Comparison: Token vs CLI

| Feature | Token-Based | CLI-Based |
|---------|-------------|-----------|
| CLI Installation | ❌ Not required | ✅ Required |
| Dependencies | `curl`, `jq` | Infisical CLI |
| Setup Time | ~1 minute | ~3-5 minutes |
| Authentication | Service token | Login + browser |
| Live Injection | ❌ No | ✅ Yes |
| Simplicity | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Best For | Development | Production/CI |

**Recommendation:** Use token-based for local development, CLI for advanced features.

## Prerequisites

- `curl` (pre-installed on macOS/Linux)
- `jq` for JSON parsing:
  ```bash
  # macOS
  brew install jq

  # Ubuntu/Debian
  sudo apt-get install jq
  ```

## Setup Instructions

### Interactive Wizard (Recommended)

Run the setup wizard:

```bash
pnpm secrets:setup:token
```

This will:
1. Guide you to create a service token in Infisical
2. Ask which environment (dev/staging/prod)
3. Save token securely to `.infisical-token` file
4. Test the token
5. Show you next steps

### Manual Setup

If you prefer to set up manually:

#### 1. Create Service Token in Infisical

1. Go to [Infisical Dashboard](https://app.infisical.com)
2. Select your project (e.g., "Radas Chrome Extension")
3. Navigate to: **Settings → Service Tokens**
4. Click: **Create Token**
5. Configure:
   - **Name**: `Local Development - Your Name`
   - **Environment**: `dev`
   - **Permission**: `Read`
   - **Expiration**: `Never` (or set date)
6. Click **Create**
7. **Copy the token** (starts with `st.`)

#### 2. Save Token Locally

Choose one method:

**Method A: Environment-Specific File (Recommended)**
```bash
# For development
echo 'st.xxxxx.yyyyy.zzzzz' > .infisical-token.dev

# For staging
echo 'st.xxxxx.yyyyy.zzzzz' > .infisical-token.staging

# For production
echo 'st.xxxxx.yyyyy.zzzzz' > .infisical-token.prod

# Secure the file
chmod 600 .infisical-token.*
```

**Method B: Default File**
```bash
# Works for all environments
echo 'st.xxxxx.yyyyy.zzzzz' > .infisical-token
chmod 600 .infisical-token
```

**Method C: Environment Variable**
```bash
# Add to your shell profile (~/.zshrc or ~/.bashrc)
export INFISICAL_TOKEN_DEV='st.xxxxx.yyyyy.zzzzz'
export INFISICAL_TOKEN_STAGING='st.xxxxx.yyyyy.zzzzz'
export INFISICAL_TOKEN_PROD='st.xxxxx.yyyyy.zzzzz'
```

#### 3. Pull Secrets

```bash
pnpm secrets:api              # Dev environment
pnpm secrets:api:staging      # Staging environment
pnpm secrets:api:prod         # Production environment
```

#### 4. Start Development

```bash
pnpm dev
```

## Token Storage Priority

The script looks for tokens in this order:

1. **Environment Variables** (Highest Priority)
   - `INFISICAL_TOKEN_DEV`
   - `INFISICAL_TOKEN_STAGING`
   - `INFISICAL_TOKEN_PROD`

2. **Environment-Specific Files**
   - `.infisical-token.dev`
   - `.infisical-token.staging`
   - `.infisical-token.prod`

3. **Default File** (Lowest Priority)
   - `.infisical-token`

Use environment-specific files for best security!

## Daily Workflow

```bash
# Morning: Pull latest secrets
pnpm secrets:api

# Develop
pnpm dev

# If secrets are updated
pnpm secrets:api              # Re-pull
```

## Working with Multiple Environments

```bash
# Switch to staging
pnpm secrets:api:staging
pnpm build

# Switch to production
pnpm secrets:api:prod
pnpm build

# Back to development
pnpm secrets:api
pnpm dev
```

## Security Best Practices

### ✅ DO

- ✅ Use **environment-specific tokens** (separate for dev/staging/prod)
- ✅ Set token permission to **Read-only**
- ✅ Set file permissions to **600** (owner only)
- ✅ **Rotate tokens** every 90 days
- ✅ Use **environment variables** in CI/CD
- ✅ **Revoke tokens** immediately if compromised
- ✅ Share tokens via **secure methods** (1Password, LastPass, etc.)

### ❌ DON'T

- ❌ **Don't commit** token files to git (already in .gitignore)
- ❌ **Don't share** tokens via Slack/email
- ❌ **Don't use** production tokens for development
- ❌ **Don't give** Write permission to tokens
- ❌ **Don't set** long expiration for production tokens
- ❌ **Don't hardcode** tokens in scripts

## Troubleshooting

### "jq command not found"

Install jq:
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq
```

### "Token validation failed"

Possible causes:
- Token is invalid or expired
- Token doesn't have access to the environment
- Token doesn't have Read permission
- Wrong workspace/project

**Solution:**
1. Check token in Infisical Dashboard
2. Verify token has access to environment
3. Create a new token if needed

### "No secrets found"

Possible causes:
- Environment name is wrong (check dev/staging/prod)
- No secrets in this environment
- Token doesn't have access

**Solution:**
1. Verify environment name
2. Check secrets exist in Infisical
3. Verify token access

### Want to switch to CLI-based?

```bash
# Remove token files
rm .infisical-token*

# Setup with CLI
pnpm secrets:setup

# Pull with CLI
pnpm secrets:pull
```

## Team Onboarding

When a new team member joins:

### Option 1: Admin Creates Token (Faster)

1. **Admin creates service token**:
   - Go to Infisical Dashboard
   - Settings → Service Tokens → Create Token
   - Name: `Dev - [Team Member Name]`
   - Environment: `dev`
   - Permission: `Read`

2. **Admin shares token** securely (1Password/LastPass)

3. **Team member saves token**:
   ```bash
   echo 'st.xxxxx.yyyyy.zzzzz' > .infisical-token.dev
   chmod 600 .infisical-token.dev
   ```

4. **Team member starts developing**:
   ```bash
   pnpm secrets:api
   pnpm dev
   ```

### Option 2: Team Member Self-Service

1. **Admin grants** Infisical access
2. **Team member runs wizard**:
   ```bash
   pnpm secrets:setup:token
   ```
3. **Follow prompts** to create and save token
4. **Start developing**:
   ```bash
   pnpm dev
   ```

## Advanced Usage

### Multiple Projects

If you work on multiple projects:

```bash
# Use environment variables in shell profile
export INFISICAL_TOKEN_RADAS_DEV='st.xxxxx...'
export INFISICAL_TOKEN_OTHER_DEV='st.yyyyy...'

# In each project
export INFISICAL_TOKEN_DEV=$INFISICAL_TOKEN_RADAS_DEV
pnpm secrets:api
```

### Automated Pulls

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
# Auto-pull secrets when entering project
cdradas() {
  cd /path/to/radas/apps/chrome-ext
  pnpm secrets:api > /dev/null 2>&1 && echo "✓ Secrets updated"
}
```

### CI/CD Integration

In GitHub Actions:

```yaml
- name: Pull secrets from Infisical
  env:
    INFISICAL_TOKEN_DEV: ${{ secrets.INFISICAL_TOKEN_CHROME_EXT_DEV }}
  run: |
    pnpm secrets:api
  working-directory: apps/chrome-ext
```

See [CICD_SETUP.md](./CICD_SETUP.md) for complete CI/CD guide.

## Comparison with Other Methods

### vs Manual .env File

| Feature | Token-Based | Manual .env |
|---------|-------------|-------------|
| Security | ✅ High | ❌ Low |
| Team Sync | ✅ Automatic | ❌ Manual |
| Updates | ✅ Instant | ❌ Delayed |
| Audit Trail | ✅ Yes | ❌ No |
| Secret Rotation | ✅ Easy | ❌ Hard |

### vs CLI-Based

| Feature | Token-Based | CLI-Based |
|---------|-------------|-----------|
| Setup Time | ✅ Fast | ⚠️ Slower |
| Dependencies | ✅ Minimal | ❌ CLI Required |
| Live Injection | ❌ No | ✅ Yes |
| Simplicity | ✅ High | ⚠️ Medium |
| Advanced Features | ❌ Limited | ✅ Full |

## Support & Resources

### Documentation

- [INFISICAL_SETUP.md](./INFISICAL_SETUP.md) - Complete Infisical guide
- [CICD_SETUP.md](./CICD_SETUP.md) - CI/CD setup
- [scripts/README.md](./scripts/README.md) - Scripts reference

### Getting Help

- **Infisical Docs**: https://infisical.com/docs
- **Infisical API**: https://infisical.com/docs/api-reference
- **Team Support**: Open an issue in this repository

## Summary

Token-based secret management offers:

✅ **Simple Setup** - No CLI installation required
✅ **Fast** - Direct API calls
✅ **Secure** - Tokens in gitignore, read-only access
✅ **Team-Friendly** - Easy sharing and onboarding
✅ **Flexible** - Multiple token storage options

**Get started now:**
```bash
pnpm secrets:setup:token
pnpm secrets:api
pnpm dev
```

Happy coding! 🚀
