# Radas Chrome Extension

This is the official Radas Chrome Extension built with [WXT](https://wxt.dev/) - a next-generation framework for building web extensions.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Infisical account (for secret management)
- `jq` for token-based secrets: `brew install jq` (macOS) or `apt-get install jq` (Ubuntu)

### First Time Setup

1. **Clone the repository**

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Setup secrets** (Choose one method)

   **Option A: Token-Based (Recommended - No CLI!)**
   ```bash
   pnpm secrets:setup:token    # Interactive wizard
   pnpm secrets:pull           # Pull secrets
   ```

   **Option B: CLI-Based**
   ```bash
   pnpm secrets:setup          # Install CLI + login
   pnpm secrets:pull:cli       # Pull secrets
   ```

   **Option C: Manual**
   ```bash
   cp .env.example .env        # Copy template
   # Edit .env and fill in values
   ```

4. **Start development server**
   ```bash
   pnpm dev
   ```

5. **Load the extension**
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `.output/chrome-mv3` directory

## 📚 Documentation

- **[INFISICAL_SETUP.md](./INFISICAL_SETUP.md)** - Complete guide for secret management
- **[TOKEN_BASED_SETUP.md](./TOKEN_BASED_SETUP.md)** - Token-based setup (No CLI!)
- **[SELF_HOSTED_INFISICAL.md](./SELF_HOSTED_INFISICAL.md)** - Self-hosted Infisical guide
- **[CICD_SETUP.md](./CICD_SETUP.md)** - CI/CD and deployment guide
- **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)** - Firebase configuration
- **[OAUTH_SETUP.md](./OAUTH_SETUP.md)** - OAuth setup guide

## 🛠️ Development

### Available Scripts

```bash
# Development
pnpm dev                    # Chrome development
pnpm dev:firefox            # Firefox development
pnpm dev:infisical          # Dev with live Infisical secrets

# Building
pnpm build                  # Chrome production build
pnpm build:firefox          # Firefox production build
pnpm build:infisical        # Build with Infisical secrets

# Type checking
pnpm compile                # TypeScript type checking

# Secrets management (Recommended - No CLI needed!)
pnpm secrets:setup:token    # Setup Infisical token
pnpm secrets:pull           # Pull dev secrets
pnpm secrets:pull:staging   # Pull staging secrets
pnpm secrets:pull:prod      # Pull production secrets

# Secrets management (CLI-based - Alternative)
pnpm secrets:setup          # Setup Infisical CLI
pnpm secrets:pull:cli       # Pull dev secrets (CLI)
pnpm secrets:pull:cli:staging   # Pull staging secrets (CLI)
pnpm secrets:pull:cli:prod      # Pull production secrets (CLI)

# Distribution
pnpm zip                    # Create Chrome zip
pnpm zip:firefox            # Create Firefox zip
```

### Project Structure

```
apps/chrome-ext/
├── entrypoints/           # Extension entry points
│   ├── background.ts      # Service worker
│   ├── content.ts         # Content scripts
│   └── popup/            # Popup UI
├── features/             # Feature modules
├── shared/              # Shared utilities
├── public/              # Static assets
├── scripts/             # Build and setup scripts
└── wxt.config.ts        # WXT configuration
```

## 📦 Building for Production

### Manual Build

```bash
# Pull production secrets
pnpm secrets:pull:prod

# Build for both browsers
pnpm build              # Chrome
pnpm build:firefox      # Firefox

# Create distribution zips
pnpm zip                # Chrome zip
pnpm zip:firefox        # Firefox zip
```

Output will be in `.output/` directory.

### Automated CI/CD

We have automated workflows for building and releasing:

**On Pull Request:**
- Automatic builds for Chrome and Firefox
- Artifacts available for testing

**On Tag Push (`chrome-ext-v*.*.*`):**
- Production build with secrets from Infisical
- GitHub release created with downloadable zips
- Requires approval if configured

See [CICD_SETUP.md](./CICD_SETUP.md) for complete setup instructions.

## 🚢 Publishing to Stores

### Chrome Web Store

1. Build: `pnpm build && pnpm zip`
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Upload `chrome-mv3-{version}.zip`
4. Fill in store listing details
5. Submit for review

### Firefox Add-ons

1. Build: `pnpm build:firefox && pnpm zip:firefox`
2. Go to [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
3. Upload `firefox-mv3-{version}.zip`
4. Fill in listing details
5. Submit for review

## 🔐 Environment Variables

Required environment variables (managed via Infisical):

```bash
VITE_FIREBASE_API_KEY          # Firebase API key
VITE_FIREBASE_AUTH_DOMAIN      # Firebase auth domain
VITE_FIREBASE_PROJECT_ID       # Firebase project ID
VITE_FIREBASE_STORAGE_BUCKET   # Firebase storage bucket
VITE_FIREBASE_MESSAGING_SENDER_ID  # FCM sender ID
VITE_FIREBASE_APP_ID           # Firebase app ID
VITE_FIREBASE_MEASUREMENT_ID   # Google Analytics measurement ID
```

See [INFISICAL_SETUP.md](./INFISICAL_SETUP.md) for secret management details.

## 🧪 Testing

Load the extension in your browser:

**Chrome:**
1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `.output/chrome-mv3` directory

**Firefox:**
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `.output/firefox-mv3` directory

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run type check: `pnpm compile`
5. Create a pull request

## 📄 License

Apache 2.0

## 🔗 Links

- [WXT Documentation](https://wxt.dev/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/)
- [Firefox Extension APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Infisical Documentation](https://infisical.com/docs)
