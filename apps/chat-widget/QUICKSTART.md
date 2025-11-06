# Quick Start Guide

Panduan cepat untuk menjalankan chat widget di lokal dan melakukan deployment.

## 🚀 Setup Lokal (5 menit)

### 1. Install Dependencies

```bash
cd apps/chat-widget
pnpm install
```

### 2. Jalankan Development Server

```bash
pnpm dev
```

Buka browser ke `http://localhost:5173` untuk melihat demo page.

### 3. Test Widget

Demo page sudah include:
- ✅ Configuration panel untuk test berbagai settings
- ✅ Live preview widget
- ✅ API method testing (open, close, sendMessage)
- ✅ Code generator untuk integration

## 🔧 Konfigurasi

### WebSocket URL

Edit file `src/components/ChatWidget.tsx` line 31:

```typescript
const { sendMessage: wsSendMessage, isConnected } = useWebSocket({
  url: `wss://your-api-domain.com/ws?apiKey=${config.apiKey}`,  // Ubah ini
  onMessage: handleBotMessage
})
```

### Styling

Edit `src/index.css` untuk customize theme colors.

## 📦 Build untuk Production

```bash
pnpm build
```

Output akan ada di `dist/`:
- `chat-widget.js` - Widget bundle
- `chat-widget.css` - Widget styles

## 🌐 Deploy ke Cloudflare Pages

### Setup Secrets di GitHub

1. Buka GitHub repository settings
2. Tambahkan secrets:
   - `CLOUDFLARE_API_TOKEN` - Generate dari Cloudflare dashboard
   - `CLOUDFLARE_ACCOUNT_ID` - Account ID dari Cloudflare

### Auto Deploy

Push ke branch `main` akan otomatis trigger deployment:

```bash
git add .
git commit -m "feat: add chat widget"
git push origin main
```

### Manual Deploy

```bash
# Install wrangler
npm install -g wrangler

# Login ke Cloudflare
wrangler login

# Build and deploy
pnpm build
wrangler pages deploy dist --project-name=chat-widget
```

## 🧪 Testing

### Test di Website Lain

1. Build widget: `pnpm build`
2. Serve dist folder: `npx serve dist`
3. Add script tag ke website test:

```html
<script src="http://localhost:3000/chat-widget.js"></script>
<script>
  ChatWidget.init({
    apiKey: 'test-key',
    position: 'bottom-right',
    primaryColor: '#3b82f6'
  })
</script>
```

## 📝 Integration Examples

### Basic Integration

```html
<script src="https://your-domain.pages.dev/chat-widget.js"></script>
<script>
  ChatWidget.init({
    apiKey: 'your-api-key'
  })
</script>
```

### Advanced Integration

```html
<script src="https://your-domain.pages.dev/chat-widget.js"></script>
<script>
  const widget = ChatWidget.init({
    apiKey: 'your-api-key',
    position: 'bottom-left',
    primaryColor: '#10b981',
    locale: 'id',
    onReady: function() {
      console.log('Widget ready!')
    },
    onMessage: function(message) {
      console.log('New message:', message)
      // Send to analytics, etc
    }
  })

  // Control widget programmatically
  document.getElementById('help-button').addEventListener('click', () => {
    widget.open()
  })
</script>
```

### React Integration

```jsx
import { useEffect, useRef } from 'react'

function App() {
  const widgetRef = useRef(null)

  useEffect(() => {
    // Load script
    const script = document.createElement('script')
    script.src = 'https://your-domain.pages.dev/chat-widget.js'
    script.async = true
    script.onload = () => {
      widgetRef.current = window.ChatWidget.init({
        apiKey: 'your-api-key',
        position: 'bottom-right'
      })
    }
    document.body.appendChild(script)

    return () => {
      // Cleanup
      widgetRef.current?.destroy()
      document.body.removeChild(script)
    }
  }, [])

  return (
    <div>
      <button onClick={() => widgetRef.current?.open()}>
        Open Chat
      </button>
    </div>
  )
}
```

## 🔍 Troubleshooting

### Widget tidak muncul

- Check console untuk errors
- Pastikan script tag sudah loaded
- Verify `ChatWidget.init()` dipanggil setelah script load

### Style conflicts

Widget menggunakan Shadow DOM untuk isolasi, tapi kalau masih ada konflik:

```javascript
ChatWidget.init({
  apiKey: 'key',
  customCSS: `
    /* Override styles here */
    .custom-class { ... }
  `
})
```

### WebSocket tidak connect

- Check WebSocket URL di `ChatWidget.tsx`
- Verify backend WebSocket server sudah running
- Check CORS settings di backend

## 📚 Next Steps

1. ✅ Setup backend WebSocket server
2. ✅ Implement chat bot logic
3. ✅ Add authentication
4. ✅ Setup analytics
5. ✅ Add E2E tests dengan Playwright

## 🆘 Need Help?

- Check `README.md` untuk dokumentasi lengkap
- Check `instruction.md` untuk technical details
- Open issue di GitHub repository
