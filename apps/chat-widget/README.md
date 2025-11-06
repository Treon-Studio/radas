# Chat Widget

Embeddable chat widget built with React, TypeScript, shadcn/ui, and deployed on Cloudflare Pages.

## Features

- 🎨 **Customizable UI** - Configure colors, position, and locale
- 🔒 **Style Isolation** - Uses Shadow DOM to prevent CSS conflicts
- 📱 **Responsive** - Works on desktop and mobile devices
- 🌐 **WebSocket Support** - Real-time messaging with auto-reconnect
- 💾 **Local Storage** - Persists chat history
- 🚀 **Fast & Lightweight** - Optimized bundle size < 150KB
- 🌍 **Multi-language** - Supports English and Bahasa Indonesia
- ⚡ **CDN Delivery** - Global distribution via Cloudflare Pages

## Installation

### Using npm/pnpm

```bash
pnpm install
```

### CDN (Production)

Add this script tag to your website:

```html
<script src="https://widget.yourdomain.com/latest/chat-widget.js"></script>
<script>
  ChatWidget.init({
    apiKey: 'your-api-key',
    position: 'bottom-right',
    primaryColor: '#3b82f6',
    locale: 'en'
  })
</script>
```

### Specific Version

For production use, it's recommended to pin to a specific version:

```html
<script
  src="https://widget.yourdomain.com/v1.0.0/chat-widget.js"
  integrity="sha384-..."
  crossorigin="anonymous">
</script>
```

## Configuration Options

```typescript
interface WidgetConfig {
  apiKey: string                    // Required: Your API key
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  primaryColor?: string             // Default: '#3b82f6'
  locale?: 'en' | 'id'             // Default: 'en'
  customCSS?: string               // Additional CSS styles
  onReady?: () => void             // Called when widget is ready
  onMessage?: (message: any) => void // Called when new message arrives
}
```

## API Methods

```javascript
const widget = ChatWidget.init(config)

// Open the widget
widget.open()

// Close the widget
widget.close()

// Send a message programmatically
widget.sendMessage('Hello!')

// Destroy the widget instance
widget.destroy()
```

## Development

### Prerequisites

- Node.js 20+
- pnpm 8+

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Project Structure

```
chat-widget/
├── src/
│   ├── components/          # React components
│   │   ├── ui/              # shadcn/ui components
│   │   └── ChatWidget.tsx   # Main widget component
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities
│   ├── types.ts             # TypeScript types
│   ├── embed.tsx            # Entry point
│   └── index.css            # Styles
├── .github/
│   └── workflows/           # CI/CD workflows
├── functions/               # Cloudflare Pages functions
├── index.html               # Demo page
└── vite.config.ts           # Build configuration
```

## Deployment

### Cloudflare Pages

The widget is automatically deployed to Cloudflare Pages on push to `main` branch.

**Required Secrets:**
- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

### Manual Deployment

```bash
# Build the widget
pnpm build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=chat-widget
```

## Testing

### Local Testing

Open `http://localhost:5173` in your browser to see the demo page with the widget.

### Integration Testing

Add the widget to your website:

```html
<script src="http://localhost:5173/src/embed.tsx" type="module"></script>
<script>
  // Wait for the module to load
  setTimeout(() => {
    ChatWidget.init({ apiKey: 'test-key' })
  }, 1000)
</script>
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari 14+
- Mobile browsers

## Performance

- Bundle size: ~140KB (gzipped)
- First Paint: < 1s
- Time to Interactive: < 2s
- Lighthouse Score: > 90

## Security

- ✅ CORS enabled for all origins
- ✅ CSP compatible
- ✅ XSS protection via Shadow DOM
- ✅ Input sanitization
- ✅ SRI (Subresource Integrity) hashes for versioned releases

## License

Apache-2.0

## Support

For issues and questions, please open an issue on GitHub.
