# CI/CD Setup Guide

This guide explains how to set up Continuous Integration and Continuous Deployment (CI/CD) for the Radas Chrome Extension with Infisical secret management.

## Table of Contents

- [Overview](#overview)
- [Workflows](#workflows)
- [Setup Instructions](#setup-instructions)
- [Environment Configuration](#environment-configuration)
- [Secrets Management](#secrets-management)
- [Deployment Process](#deployment-process)
- [Troubleshooting](#troubleshooting)

## Overview

We have two main workflows:

1. **Build & Test** (`chrome-ext-build.yml`) - Runs on PRs and pushes to main
2. **Release** (`chrome-ext-release.yml`) - Creates releases with signed builds

Both workflows use **Infisical** to securely pull environment variables during the build process.

## Workflows

### 1. Build & Test Workflow

**Triggers:**
- Pull requests that modify `apps/chrome-ext/**`
- Pushes to `main` branch

**What it does:**
- Installs dependencies
- Pulls secrets from Infisical (dev environment)
- Type checks the code
- Builds both Chrome and Firefox extensions
- Uploads build artifacts
- Creates a build summary

**Location:** `.github/workflows/chrome-ext-build.yml`

### 2. Release Workflow

**Triggers:**
- Git tags matching `chrome-ext-v*.*.*` (e.g., `chrome-ext-v1.4.1`)
- Manual workflow dispatch (for staging/production)

**What it does:**
- Installs dependencies
- Pulls secrets from Infisical (staging/production environment)
- Type checks the code
- Builds and creates zip files for both browsers
- Creates GitHub release with downloadable artifacts
- Uploads artifacts for 30 days retention

**Location:** `.github/workflows/chrome-ext-release.yml`

## Setup Instructions

### Step 1: Create Infisical Service Tokens

Service tokens allow CI/CD to authenticate with Infisical without requiring a user login.

1. **Go to Infisical Dashboard**
   - Navigate to your project
   - Go to **Settings** → **Service Tokens**

2. **Create tokens for each environment:**

   **Development Token:**
   ```
   Name: GitHub Actions - Chrome Ext (Dev)
   Environment: dev
   Permissions: Read
   Expiration: Never (or 1 year)
   ```

   **Staging Token:**
   ```
   Name: GitHub Actions - Chrome Ext (Staging)
   Environment: staging
   Permissions: Read
   Expiration: Never (or 1 year)
   ```

   **Production Token:**
   ```
   Name: GitHub Actions - Chrome Ext (Prod)
   Environment: prod
   Permissions: Read
   Expiration: Never (or 1 year)
   ```

3. **Copy each token** (you'll only see it once!)

### Step 2: Add Secrets to GitHub

1. **Go to your GitHub repository**
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

Add the following secrets:

| Secret Name | Description | Value |
|------------|-------------|-------|
| `INFISICAL_TOKEN_CHROME_EXT_DEV` | Development environment token | `st.xxx...xxx` from Step 1 |
| `INFISICAL_TOKEN_CHROME_EXT_STAGING` | Staging environment token | `st.xxx...xxx` from Step 1 |
| `INFISICAL_TOKEN_CHROME_EXT_PROD` | Production environment token | `st.xxx...xxx` from Step 1 |

### Step 3: Configure GitHub Environments (Optional but Recommended)

For better security and approval workflows:

1. Go to **Settings** → **Environments**
2. Create two environments:

   **Staging:**
   - Name: `staging`
   - No protection rules needed (or add reviewers if desired)

   **Production:**
   - Name: `production`
   - ✅ **Required reviewers**: Add team members who must approve
   - ✅ **Wait timer**: Optional (e.g., 5 minutes)
   - ✅ **Deployment branches**: `main` only

This ensures production deployments require manual approval.

### Step 4: Test the Setup

1. **Test Build Workflow:**
   ```bash
   # Create a test branch and push
   git checkout -b test/ci-setup
   git commit --allow-empty -m "test: CI workflow"
   git push origin test/ci-setup

   # Create a PR and check if workflow runs
   ```

2. **Test Release Workflow (Manual):**
   - Go to **Actions** → **Chrome Extension - Release**
   - Click **Run workflow**
   - Select `staging` environment
   - Click **Run workflow**

3. **Test Release Workflow (Tag):**
   ```bash
   # Update version in package.json first!
   git tag chrome-ext-v1.4.2
   git push origin chrome-ext-v1.4.2
   ```

## Environment Configuration

### Infisical Environments

Ensure you have these environments set up in Infisical:

**Development (`dev`):**
- Used for: PR builds, development testing
- Secrets: Development Firebase config, test API keys
- Auto-pulled on every PR

**Staging (`staging`):**
- Used for: Pre-production testing
- Secrets: Staging Firebase config, staging API keys
- Pulled on manual workflow dispatch

**Production (`prod`):**
- Used for: Production releases
- Secrets: Production Firebase config, production API keys
- Pulled on tag-based releases
- Should require approval in GitHub

### Adding Secrets to Infisical

For each environment, add the following secrets:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Secrets Management

### How Secrets Are Pulled in CI/CD

The workflows use this pattern:

```yaml
- name: Pull secrets from Infisical
  env:
    INFISICAL_TOKEN: ${{ secrets.INFISICAL_TOKEN_CHROME_EXT_DEV }}
  run: |
    infisical export --token="$INFISICAL_TOKEN" --env=dev --format=dotenv > .env
```

**Security features:**
- ✅ Tokens are stored encrypted in GitHub Secrets
- ✅ Tokens are never logged or exposed
- ✅ Secrets are pulled fresh for each build
- ✅ `.env` file exists only during build (in-memory)
- ✅ Each environment has separate tokens

### Token Security Best Practices

1. **Rotate tokens** every 90 days
2. **Use read-only** permissions for CI/CD tokens
3. **Separate tokens** for each environment
4. **Monitor usage** in Infisical dashboard
5. **Revoke immediately** if compromised
6. **Use GitHub environments** for production protection

## Deployment Process

### Development Deployment (Automatic)

Happens automatically on every PR:

```bash
# 1. Create feature branch
git checkout -b feat/new-feature

# 2. Make changes, commit, push
git push origin feat/new-feature

# 3. Create PR
# → Workflow runs automatically
# → Build artifacts available for testing
```

### Staging Deployment (Manual)

Deploy to staging for QA testing:

1. Go to **Actions** → **Chrome Extension - Release**
2. Click **Run workflow**
3. Select **Branch**: `main`
4. Select **Environment**: `staging`
5. Click **Run workflow**
6. Download artifacts from the workflow run

### Production Release (Tag-based)

Deploy to production when ready:

```bash
# 1. Update version in package.json
npm version patch  # or minor, or major

# 2. Commit the version bump
git add package.json
git commit -m "chore: bump version to v1.4.2"
git push origin main

# 3. Create and push tag
git tag chrome-ext-v1.4.2
git push origin chrome-ext-v1.4.2

# 4. Workflow runs automatically
# → If you configured environments, reviewers approve
# → Release is created with downloadable zip files
```

### Manual Production Release (Emergency)

If you need to deploy quickly:

1. Go to **Actions** → **Chrome Extension - Release**
2. Click **Run workflow**
3. Select **Branch**: `main`
4. Select **Environment**: `production`
5. Click **Run workflow**
6. Approve if required
7. Download artifacts from workflow run

## Workflow Outputs

### Artifacts

Both workflows produce downloadable artifacts:

**Build Workflow:**
- `chrome-extension-{sha}` - Unzipped Chrome extension
- `firefox-extension-{sha}` - Unzipped Firefox extension
- Retention: 7 days

**Release Workflow:**
- `chrome-extension-{env}-v{version}` - Zipped packages
- Retention: 30 days

**GitHub Release:**
- `chrome-mv3-{version}.zip` - Ready to upload to Chrome Web Store
- `firefox-mv3-{version}.zip` - Ready to upload to Firefox Add-ons
- Retention: Permanent

### Build Summary

Each workflow creates a summary visible in the Actions tab:

- ✅ Build status
- 📦 Artifacts produced
- 🔢 Version number
- 🌍 Environment used
- 📝 Commit SHA

## Troubleshooting

### "INFISICAL_TOKEN not set"

**Problem:** Workflow can't find the Infisical token.

**Solution:**
1. Check secret name matches exactly:
   - `INFISICAL_TOKEN_CHROME_EXT_DEV`
   - `INFISICAL_TOKEN_CHROME_EXT_STAGING`
   - `INFISICAL_TOKEN_CHROME_EXT_PROD`
2. Ensure secret is added to repository (not environment)
3. Verify token hasn't expired in Infisical

### "Failed to pull secrets"

**Problem:** Infisical CLI can't retrieve secrets.

**Solution:**
1. Check token has correct permissions (Read)
2. Verify token is for correct project
3. Ensure environment name matches (`dev`, `staging`, `prod`)
4. Check token isn't revoked in Infisical dashboard

### "Type check failed"

**Problem:** TypeScript compilation errors.

**Solution:**
1. Run locally: `pnpm compile`
2. Fix TypeScript errors
3. Commit and push

### "Build failed" but works locally

**Problem:** Build succeeds locally but fails in CI.

**Solution:**
1. Check Node version matches (should be 20)
2. Verify pnpm lockfile is committed
3. Ensure all dependencies are listed in `package.json`
4. Check for environment-specific code
5. Pull latest secrets: `pnpm secrets:pull`

### Workflow doesn't trigger

**Problem:** Workflow doesn't run on PR or tag.

**Solution:**
1. Check file path in workflow matches your changes
2. Verify workflow file is on the branch being pushed
3. Check GitHub Actions is enabled for the repository
4. Review workflow permissions in repo settings

### Token expired

**Problem:** Service token expired.

**Solution:**
1. Create new token in Infisical
2. Update GitHub secret with new token value
3. No code changes needed

## Advanced Configuration

### Auto-publish to Chrome Web Store

To automatically publish to Chrome Web Store on release:

1. **Get Chrome Web Store credentials:**
   - Client ID
   - Client Secret
   - Refresh Token
   - Extension ID

2. **Add to GitHub Secrets:**
   ```
   CHROME_EXTENSION_ID
   CHROME_CLIENT_ID
   CHROME_CLIENT_SECRET
   CHROME_REFRESH_TOKEN
   ```

3. **Uncomment publish job** in `chrome-ext-release.yml`

### Custom Build Matrix

To test multiple Node versions:

```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]
```

### Slack/Discord Notifications

Add notification steps to workflows:

```yaml
- name: Notify on success
  if: success()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "✅ Chrome extension v${{ steps.version.outputs.version }} released!"
      }
```

## Security Checklist

Before going to production, ensure:

- [ ] All Infisical tokens are read-only
- [ ] Production environment requires reviewers
- [ ] Tokens are rotated regularly (set calendar reminder)
- [ ] Only trusted team members have GitHub Admin access
- [ ] Workflow permissions are set to minimum required
- [ ] Secrets are never logged or printed
- [ ] Different Firebase projects for dev/staging/prod
- [ ] Branch protection rules enabled on `main`

## Support

For issues:
- **Infisical**: https://infisical.com/docs
- **GitHub Actions**: https://docs.github.com/en/actions
- **Team**: Open an issue in this repository

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Infisical CI/CD Integration](https://infisical.com/docs/integrations/cicd)
- [Chrome Web Store Publishing](https://developer.chrome.com/docs/webstore/publish/)
- [Firefox Add-ons Publishing](https://extensionworkshop.com/documentation/publish/)
