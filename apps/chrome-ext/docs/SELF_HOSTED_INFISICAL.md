# Self-Hosted Infisical Setup

Quick guide for using Radas Chrome Extension with **self-hosted Infisical**.

## 🚀 Quick Start

### Automatic Setup (Recommended)

```bash
# Run the token setup wizard
pnpm secrets:setup:token

# When prompted, select:
# ✓ Option 2: Self-hosted Infisical
# ✓ Enter your Infisical URL: https://infisical.yourcompany.com

# Wizard will automatically:
# - Save URL to .infisical-config
# - Guide you to create token
# - Test the connection
```

### Manual Setup

#### 1. Configure Infisical URL

Create `.infisical-config` file:

```bash
echo 'INFISICAL_API_URL="https://infisical.yourcompany.com"' > .infisical-config
chmod 600 .infisical-config
```

Or use environment variable:

```bash
export INFISICAL_API_URL="https://infisical.yourcompany.com"
```

#### 2. Get Service Token

1. Go to your self-hosted Infisical dashboard
2. Navigate to: **Settings → Service Tokens**
3. Create token with **Read** permission
4. Copy the token

#### 3. Save Token

```bash
echo 'st.xxxxx.yyyyy.zzzzz' > .infisical-token.dev
chmod 600 .infisical-token.dev
```

#### 4. Pull Secrets

```bash
pnpm secrets:api
```

#### 5. Verify

You should see:
```
Infisical URL: https://infisical.yourcompany.com
✓ Using token from .infisical-token.dev
✓ Successfully fetched X secrets
```

## Configuration Methods

### Priority Order

Scripts check for Infisical URL in this order:

1. **Environment Variable** (Highest Priority)
   ```bash
   export INFISICAL_API_URL="https://infisical.yourcompany.com"
   ```

2. **Config File**
   ```bash
   # .infisical-config
   INFISICAL_API_URL="https://infisical.yourcompany.com"
   ```

3. **Default** (Lowest Priority)
   ```
   https://app.infisical.com
   ```

### Config File Format

File: `.infisical-config`

```bash
# Self-hosted Infisical
INFISICAL_API_URL="https://infisical.yourcompany.com"

# Or with custom port
INFISICAL_API_URL="https://infisical.company.com:8443"

# Or local development
INFISICAL_API_URL="http://localhost:8080"
```

**Important:**
- URL should NOT include `/api/v3/secrets`
- NO trailing slash
- Both `http://` and `https://` supported

## Common Self-Hosted Configurations

### Docker Compose

If running Infisical via Docker Compose:

```bash
# Usually accessible at
INFISICAL_API_URL="http://localhost:8080"

# Or with custom domain
INFISICAL_API_URL="https://infisical.local"
```

### Kubernetes

If deployed on Kubernetes:

```bash
# Internal service
INFISICAL_API_URL="http://infisical.default.svc.cluster.local"

# Or external ingress
INFISICAL_API_URL="https://infisical.k8s.yourcompany.com"
```

### Behind Reverse Proxy

If Infisical is behind nginx/traefik:

```bash
# With subfolder
INFISICAL_API_URL="https://tools.company.com/infisical"

# With subdomain
INFISICAL_API_URL="https://secrets.company.com"
```

## Troubleshooting

### "Connection refused"

**Problem:** Can't connect to Infisical

**Solutions:**
```bash
# 1. Verify URL is accessible
curl https://infisical.yourcompany.com

# 2. Check if Infisical is running
ping infisical.yourcompany.com

# 3. Verify no firewall blocking
telnet infisical.yourcompany.com 443

# 4. Check DNS resolution
nslookup infisical.yourcompany.com
```

### "SSL certificate problem"

**Problem:** Self-signed certificate or SSL errors

**Solutions:**
```bash
# Option 1: Use http instead of https (dev only!)
INFISICAL_API_URL="http://infisical.yourcompany.com"

# Option 2: Add certificate to system trust store
# macOS:
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /path/to/cert.pem

# Option 3: Ignore SSL (NOT recommended for production!)
# Modify pull-secrets-api.sh to add -k flag to curl
```

### "HTTP 404" or "Not Found"

**Problem:** API endpoint not found

**Possible causes:**
- Wrong URL format
- Missing API version in Infisical
- Reverse proxy misconfiguration

**Solutions:**
```bash
# 1. Check Infisical version
curl https://infisical.yourcompany.com/api/status

# 2. Verify API endpoint exists
curl https://infisical.yourcompany.com/api/v3/secrets/raw \
  -H "Authorization: Bearer st.xxxxx"

# 3. Check reverse proxy config
# Ensure it's not stripping /api paths
```

### "Token validation failed"

**Problem:** Token not working with self-hosted instance

**Solutions:**
1. Verify token was created in the correct Infisical instance
2. Check token hasn't expired
3. Ensure token has Read permission
4. Verify environment (dev/staging/prod) exists

## Team Setup

### For Admin

1. **Deploy self-hosted Infisical**
2. **Create project** for Radas Chrome Extension
3. **Add secrets** to environments (dev/staging/prod)
4. **Create service tokens** for team members
5. **Share securely:**
   - Infisical URL
   - Service tokens (via 1Password/LastPass)

### For Team Members

1. **Receive from admin:**
   - Infisical URL
   - Service token

2. **Configure locally:**
   ```bash
   # Save URL
   echo 'INFISICAL_API_URL="https://infisical.company.com"' > .infisical-config

   # Save token
   echo 'st.xxxxx' > .infisical-token.dev

   # Secure files
   chmod 600 .infisical-*
   ```

3. **Pull secrets and develop:**
   ```bash
   pnpm secrets:api
   pnpm dev
   ```

## CI/CD with Self-Hosted Infisical

### GitHub Actions

```yaml
- name: Pull secrets from self-hosted Infisical
  env:
    INFISICAL_API_URL: ${{ secrets.INFISICAL_URL }}
    INFISICAL_TOKEN_DEV: ${{ secrets.INFISICAL_TOKEN_CHROME_EXT_DEV }}
  run: |
    pnpm secrets:api
  working-directory: apps/chrome-ext
```

Add to GitHub Secrets:
- `INFISICAL_URL`: Your self-hosted URL
- `INFISICAL_TOKEN_CHROME_EXT_DEV`: Service token

### GitLab CI

```yaml
pull_secrets:
  script:
    - export INFISICAL_API_URL="https://infisical.company.com"
    - pnpm secrets:api
  variables:
    INFISICAL_TOKEN_DEV: $INFISICAL_TOKEN_CHROME_EXT_DEV
```

## Security Considerations

### For Self-Hosted Deployments

✅ **DO:**
- Use HTTPS in production
- Rotate tokens every 90 days
- Use read-only tokens
- Implement rate limiting
- Enable audit logs
- Use VPN for internal access
- Keep Infisical updated

❌ **DON'T:**
- Expose Infisical publicly without auth
- Use self-signed certs in production
- Share tokens via insecure channels
- Use admin tokens for CI/CD
- Skip SSL verification in production

### Network Security

```bash
# Recommended: Restrict access to internal network
# iptables example:
iptables -A INPUT -p tcp --dport 8080 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 8080 -j DROP

# Or use VPN/VPC
# Only allow access from VPN network
```

## Upgrading Infisical

When upgrading your self-hosted Infisical:

1. **Check release notes** for API changes
2. **Backup database**
3. **Upgrade Infisical**
4. **Test API endpoints:**
   ```bash
   curl https://infisical.company.com/api/v3/secrets/raw \
     -H "Authorization: Bearer st.xxxxx" \
     -d "environment=dev&workspaceId=auto"
   ```
5. **Verify token scripts** still work
6. **Update API version** in scripts if needed

## FAQ

**Q: Can I use both cloud and self-hosted?**

A: Yes! Use `.infisical-config` for self-hosted, or comment it out to use cloud.

**Q: Can I have multiple self-hosted instances?**

A: Yes! Use environment variables per project:
```bash
export INFISICAL_API_URL="https://project1.company.com"
pnpm secrets:api
```

**Q: Do I need to modify the scripts?**

A: No! Scripts automatically detect and use the configured URL.

**Q: Can I use IP address instead of domain?**

A: Yes:
```bash
INFISICAL_API_URL="https://192.168.1.100:8080"
```

**Q: Does this work with Infisical Enterprise?**

A: Yes! Same setup process.

## Support

For self-hosted Infisical issues:
- **Infisical Docs**: https://infisical.com/docs/self-hosting/overview
- **GitHub**: https://github.com/Infisical/infisical
- **Discord**: https://infisical.com/discord

For script/integration issues:
- Open issue in this repository
- Check [INFISICAL_SETUP.md](./INFISICAL_SETUP.md)
- Check [TOKEN_BASED_SETUP.md](./TOKEN_BASED_SETUP.md)

## Quick Reference

```bash
# Setup wizard (auto-detects self-hosted)
pnpm secrets:setup:token

# Manual URL config
echo 'INFISICAL_API_URL="https://infisical.company.com"' > .infisical-config

# Pull secrets
pnpm secrets:api              # Dev
pnpm secrets:api:staging      # Staging
pnpm secrets:api:prod         # Production

# Verify configuration
cat .infisical-config

# Test connection
curl https://infisical.company.com/api/status
```

---

**Ready to use your self-hosted Infisical!** 🚀

Run: `pnpm secrets:setup:token` and select "Self-hosted" when prompted.
