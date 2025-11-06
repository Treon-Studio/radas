Tech Plan: Chat Widget Embed dengan Cloudflare Pages
📋 Project Overview
Project Name: Embeddable Chat Widget
Tech Stack: React + TypeScript + shadcn/ui + Cloudflare Pages
Timeline: 2-3 minggu
Team Size: 2-3 engineers

🎯 Phase 1: Foundation & Setup (Week 1)
1.1 Project Initialization
Tasks:

 Setup monorepo structure dengan pnpm workspaces
 Initialize React + TypeScript + Vite
 Install dan configure shadcn/ui
 Setup ESLint, Prettier, Husky
 Configure TypeScript strict mode

Deliverables:
chat-widget/
├── packages/
│   ├── widget/          # Main widget package
│   ├── sdk/             # JavaScript SDK untuk host
│   └── demo/            # Demo website
├── .github/
│   └── workflows/
│       ├── deploy.yml
│       └── pr-preview.yml
├── pnpm-workspace.yaml
└── package.json
Technical Decisions:
json// packages/widget/package.json
{
  "name": "@chat-widget/widget",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.0",
    "lucide-react": "^0.454.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "tailwindcss": "^3.4.14",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47"
  }
}

1.2 Vite Build Configuration untuk Embed
typescript// packages/widget/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/embed.tsx'),
      name: 'ChatWidget',
      formats: ['iife'],
      fileName: () => 'chat-widget.js'
    },
    rollupOptions: {
      output: {
        assetFileNames: 'chat-widget.[ext]',
        inlineDynamicImports: true
      }
    },
    cssCodeSplit: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    sourcemap: true
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
})

1.3 Shadow DOM Implementation
typescript// packages/widget/src/embed.tsx
import { createRoot, Root } from 'react-dom/client'
import { ChatWidget } from './components/ChatWidget'

interface WidgetConfig {
  apiKey: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  primaryColor?: string
  locale?: 'en' | 'id'
  customCSS?: string
  onReady?: () => void
  onMessage?: (message: any) => void
}

class ChatWidgetEmbed {
  private root: Root | null = null
  private container: HTMLDivElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private config: WidgetConfig

  constructor(config: WidgetConfig) {
    this.config = {
      position: 'bottom-right',
      locale: 'en',
      ...config
    }
  }

  async init() {
    // Prevent multiple instances
    if (document.getElementById('chat-widget-root')) {
      console.warn('Chat widget already initialized')
      return
    }

    // Create container
    this.container = document.createElement('div')
    this.container.id = 'chat-widget-root'
    this.container.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;'
    
    document.body.appendChild(this.container)

    // Create shadow DOM for style isolation
    this.shadowRoot = this.container.attachShadow({ mode: 'open' })

    // Create mount point
    const mountPoint = document.createElement('div')
    this.shadowRoot.appendChild(mountPoint)

    // Inject styles
    await this.injectStyles()

    // Render React app
    this.root = createRoot(mountPoint)
    this.root.render(<ChatWidget config={this.config} />)

    // Callback
    this.config.onReady?.()
  }

  private async injectStyles() {
    const styleElement = document.createElement('style')
    
    // Get bundled CSS
    const cssUrl = this.getCSSUrl()
    const response = await fetch(cssUrl)
    const css = await response.text()
    
    styleElement.textContent = css + (this.config.customCSS || '')
    this.shadowRoot?.appendChild(styleElement)

    // Add Tailwind base
    const tailwindBase = document.createElement('style')
    tailwindBase.textContent = `
      *, ::before, ::after {
        box-sizing: border-box;
        border-width: 0;
        border-style: solid;
      }
    `
    this.shadowRoot?.appendChild(tailwindBase)
  }

  private getCSSUrl(): string {
    const script = document.currentScript as HTMLScriptElement
    const scriptSrc = script?.src || ''
    return scriptSrc.replace('.js', '.css')
  }

  destroy() {
    this.root?.unmount()
    this.container?.remove()
    this.root = null
    this.container = null
    this.shadowRoot = null
  }

  // Public API methods
  open() {
    window.dispatchEvent(new CustomEvent('chat-widget:open'))
  }

  close() {
    window.dispatchEvent(new CustomEvent('chat-widget:close'))
  }

  sendMessage(message: string) {
    window.dispatchEvent(new CustomEvent('chat-widget:send', { 
      detail: { message } 
    }))
  }
}

// Global API
declare global {
  interface Window {
    ChatWidget: {
      init: (config: WidgetConfig) => ChatWidgetEmbed
    }
  }
}

window.ChatWidget = {
  init: (config: WidgetConfig) => {
    const widget = new ChatWidgetEmbed(config)
    widget.init()
    return widget
  }
}

// Auto-init if config found
const autoInitScript = document.querySelector('script[data-chat-widget-config]')
if (autoInitScript) {
  try {
    const config = JSON.parse(autoInitScript.getAttribute('data-chat-widget-config') || '{}')
    window.ChatWidget.init(config)
  } catch (e) {
    console.error('Failed to auto-init chat widget:', e)
  }
}

export { ChatWidgetEmbed, type WidgetConfig }

🎯 Phase 2: Core Widget Development (Week 1-2)
2.1 Chat Widget Component
typescript// packages/widget/src/components/ChatWidget.tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageCircle, X, Send, Minimize2, Maximize2, Paperclip } from 'lucide-react'
import { WidgetConfig } from '../embed'
import { useWebSocket } from '../hooks/useWebSocket'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface Message {
  id: string
  text: string
  sender: 'user' | 'bot'
  timestamp: Date
  status?: 'sending' | 'sent' | 'error'
  attachments?: Array<{
    type: string
    url: string
    name: string
  }>
}

interface ChatWidgetProps {
  config: WidgetConfig
}

export function ChatWidget({ config }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useLocalStorage<Message[]>('chat-messages', [])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { sendMessage: wsSendMessage, isConnected } = useWebSocket({
    url: `wss://api.yourdomain.com/ws?apiKey=${config.apiKey}`,
    onMessage: handleBotMessage
  })

  // Listen to external events
  useEffect(() => {
    const handleOpen = () => setIsOpen(true)
    const handleClose = () => setIsOpen(false)
    const handleSend = (e: CustomEvent) => {
      setInputValue(e.detail.message)
      handleSend()
    }

    window.addEventListener('chat-widget:open', handleOpen)
    window.addEventListener('chat-widget:close', handleClose)
    window.addEventListener('chat-widget:send', handleSend as EventListener)

    return () => {
      window.removeEventListener('chat-widget:open', handleOpen)
      window.removeEventListener('chat-widget:close', handleClose)
      window.removeEventListener('chat-widget:send', handleSend as EventListener)
    }
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus()
    }
  }, [isOpen, isMinimized])

  function handleBotMessage(data: any) {
    const botMessage: Message = {
      id: Date.now().toString(),
      text: data.message,
      sender: 'bot',
      timestamp: new Date(),
      status: 'sent'
    }
    setMessages(prev => [...prev, botMessage])
    setIsTyping(false)

    // Trigger callback
    config.onMessage?.(botMessage)
  }

  const handleSend = useCallback(async () => {
    if (!inputValue.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
      status: 'sending'
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsTyping(true)

    try {
      // Send via WebSocket
      await wsSendMessage({
        type: 'message',
        text: inputValue,
        timestamp: new Date().toISOString()
      })

      // Update status
      setMessages(prev =>
        prev.map(msg =>
          msg.id === userMessage.id ? { ...msg, status: 'sent' as const } : msg
        )
      )
    } catch (error) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === userMessage.id ? { ...msg, status: 'error' as const } : msg
        )
      )
      setIsTyping(false)
    }
  }, [inputValue, wsSendMessage])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Upload file logic here
    console.log('File selected:', file)
  }

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4'
  }

  return (
    <div className={`fixed ${positionClasses[config.position || 'bottom-right']} z-[9999]`}>
      {/* Floating Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform"
          size="icon"
          style={{ backgroundColor: config.primaryColor }}
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card 
          className={`flex flex-col shadow-2xl transition-all duration-300 ${
            isMinimized ? 'w-[300px] h-[60px]' : 'w-[380px] h-[600px]'
          }`}
        >
          {/* Header */}
          <div 
            className="flex items-center justify-between p-4 border-b rounded-t-lg cursor-pointer"
            style={{ backgroundColor: config.primaryColor }}
            onClick={() => setIsMinimized(!isMinimized)}
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-white">
                <AvatarImage src="/bot-avatar.png" />
                <AvatarFallback className="bg-white text-primary">CS</AvatarFallback>
              </Avatar>
              <div className="text-white">
                <h3 className="font-semibold text-sm">Customer Support</h3>
                <p className="text-xs opacity-90 flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                  {isConnected ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsMinimized(!isMinimized)
                }}
              >
                {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsOpen(false)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages - Hidden when minimized */}
          {!isMinimized && (
            <>
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map(message => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          message.sender === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                        style={
                          message.sender === 'user' 
                            ? { backgroundColor: config.primaryColor } 
                            : {}
                        }
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs opacity-70">
                            {message.timestamp.toLocaleTimeString(config.locale, {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {message.sender === 'user' && (
                            <span className="text-xs opacity-70">
                              {message.status === 'sending' && '◷'}
                              {message.status === 'sent' && '✓✓'}
                              {message.status === 'error' && '✗'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Typing indicator */}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl px-4 py-3">
                        <div className="flex space-x-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="p-4 border-t bg-background">
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Input
                    ref={inputRef}
                    placeholder={config.locale === 'id' ? 'Ketik pesan...' : 'Type a message...'}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    className="flex-1"
                    disabled={!isConnected}
                  />
                  <Button 
                    onClick={handleSend} 
                    size="icon"
                    disabled={!inputValue.trim() || !isConnected}
                    style={{ backgroundColor: config.primaryColor }}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {!isConnected && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {config.locale === 'id' ? 'Menghubungkan...' : 'Connecting...'}
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

2.2 Custom Hooks
typescript// packages/widget/src/hooks/useWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react'

interface UseWebSocketOptions {
  url: string
  onMessage: (data: any) => void
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export function useWebSocket({
  url,
  onMessage,
  reconnectInterval = 3000,
  maxReconnectAttempts = 5
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url)

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        reconnectAttemptsRef.current = 0
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessage(data)
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        setIsConnected(false)
        wsRef.current = null

        // Reconnect logic
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`)
            connect()
          }, reconnectInterval)
        }
      }

      wsRef.current = ws
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
    }
  }, [url, onMessage, reconnectInterval, maxReconnectAttempts])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  const sendMessage = useCallback((data: any) => {
    return new Promise<void>((resolve, reject) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify(data))
          resolve()
        } catch (error) {
          reject(error)
        }
      } else {
        reject(new Error('WebSocket is not connected'))
      }
    })
  }, [])

  return { sendMessage, isConnected }
}
typescript// packages/widget/src/hooks/useLocalStorage.ts
import { useState, useEffect } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error(`Error loading ${key} from localStorage:`, error)
      return initialValue
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue))
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error)
    }
  }, [key, storedValue])

  return [storedValue, setStoredValue] as const
}

🎯 Phase 3: Cloudflare Pages Setup (Week 2)
3.1 GitHub Actions untuk Auto Deploy
yaml# .github/workflows/deploy.yml
name: Deploy to Cloudflare Pages

on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build widget
        run: |
          cd packages/widget
          pnpm build
        env:
          NODE_ENV: production

      - name: Extract version
        id: version
        run: |
          if [[ $GITHUB_REF == refs/tags/* ]]; then
            VERSION=${GITHUB_REF#refs/tags/v}
          else
            VERSION="latest"
          fi
          echo "VERSION=$VERSION" >> $GITHUB_OUTPUT

      - name: Publish to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: chat-widget
          directory: packages/widget/dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
          branch: main

      - name: Create versioned deployment
        if: startsWith(github.ref, 'refs/tags/')
        run: |
          # Copy files with version prefix
          mkdir -p versioned-dist/${{ steps.version.outputs.VERSION }}
          cp -r packages/widget/dist/* versioned-dist/${{ steps.version.outputs.VERSION }}/
          
      - name: Deploy versioned build
        if: startsWith(github.ref, 'refs/tags/')
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: chat-widget
          directory: versioned-dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}

      - name: Generate SRI Hash
        if: startsWith(github.ref, 'refs/tags/')
        run: |
          HASH=$(openssl dgst -sha384 -binary packages/widget/dist/chat-widget.js | openssl base64 -A)
          echo "SRI Hash: sha384-${HASH}"
          echo "sha384-${HASH}" > sri-hash.txt

      - name: Create GitHub Release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v1
        with:
          files: |
            packages/widget/dist/chat-widget.js
            packages/widget/dist/chat-widget.css
            sri-hash.txt
          body: |
            ## Installation
```html
            <script 
              src="https://widget.yourdomain.com/${{ steps.version.outputs.VERSION }}/chat-widget.js"
              integrity="$(cat sri-hash.txt)"
              crossorigin="anonymous">
            </script>
```
            
            ## Initialize
```javascript
            ChatWidget.init({
              apiKey: 'your-api-key',
              position: 'bottom-right',
              primaryColor: '#3b82f6'
            })
```

3.2 PR Preview Deployments
yaml# .github/workflows/pr-preview.yml
name: PR Preview

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  preview:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: |
          cd packages/widget
          pnpm build

      - name: Publish Preview to Cloudflare Pages
        id: deploy
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: chat-widget
          directory: packages/widget/dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
          branch: pr-${{ github.event.pull_request.number }}

      - name: Comment Preview URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## 🚀 Preview Deployment\n\nYour changes are deployed to:\n\n**Widget URL:** ${{ steps.deploy.outputs.url }}/chat-widget.js\n\n**Demo:** ${{ steps.deploy.outputs.url }}/demo.html\n\n### Test it:\n\`\`\`html\n<script src="${{ steps.deploy.outputs.url }}/chat-widget.js"></script>\n<script>\n  ChatWidget.init({ apiKey: 'demo-key' })\n</script>\n\`\`\``
            })

3.3 Cloudflare Pages Configuration
toml# wrangler.toml
name = "chat-widget"
compatibility_date = "2024-01-01"
pages_build_output_dir = "packages/widget/dist"

[env.production]
routes = [
  { pattern = "widget.yourdomain.com/*", zone_name = "yourdomain.com" }
]

[[env.production.rules]]
type = "Header"
header = "Cache-Control"
value = "public, max-age=31536000, immutable"

[[env.production.rules]]
type = "Header"
header = "Access-Control-Allow-Origin"
value = "*"

[[env.production.rules]]
type = "Header"
header = "X-Content-Type-Options"
value = "nosniff"

[env.staging]
routes = [
  { pattern = "widget-staging.yourdomain.com/*", zone_name = "yourdomain.com" }
]
javascript// functions/_middleware.js - Advanced routing & analytics
export async function onRequest(context) {
  const { request, next, env } = context
  const url = new URL(request.url)
  
  // Version routing
  const versionMatch = url.pathname.match(/^\/v([\d.]+)\//)
  const version = versionMatch ? versionMatch[1] : 'latest'
  
  // Analytics tracking
  context.waitUntil(
    fetch('https://analytics.yourdomain.com/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version,
        path: url.pathname,
        referer: request.headers.get('Referer'),
        userAgent: request.headers.get('User-Agent'),
        country: request.cf?.country,
        timestamp: Date.now()
      })
    }).catch(console.error)
  )
  
  const response = await next()
  
  // Add custom headers
  const newHeaders = new Headers(response.headers)
  newHeaders.set('X-Widget-Version', version)
  newHeaders.set('X-Powered-By', 'Cloudflare Pages')
  
  // Cache control based on version
  if (version !== 'latest') {
    newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    newHeaders.set('Cache-Control', 'public, max-age=300') // 5 minutes
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}

3.4 Demo Website
html<!-- packages/demo/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat Widget Demo</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-4xl font-bold mb-4">Chat Widget Demo</h1>
      <p class="text-gray-600 mb-8">Try out our embeddable chat widget with different configurations</p>
      
      <!-- Config Options -->
      <div class="bg-white rounded-lg shadow-lg p-6 mb-8">
        <h2 class="text-2xl font-semibold mb-4">Configuration</h2>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Position</label>
            <select id="position" class="w-full p-2 border rounded">
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="top-right">Top Right</option>
              <option value="top-left">Top Left</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Primary Color</label>
            <input type="color" id="color" value="#3b82f6" class="w-full h-10 border rounded">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">Locale</label>
            <select id="locale" class="w-full p-2 border rounded">
              <option value="en">English</option>
              <option value="id">Bahasa Indonesia</option>
            </select>
          </div>
          
          <button 
            id="apply-config" 
            class="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
          >
            Apply Configuration
          </button>
        </div>
      </div>
      
      <!-- Code Example -->
      <div class="bg-gray-900 text-gray-100 rounded-lg p-6">
        <h3 class="text-xl font-semibold mb-4">Installation Code</h3>
        <pre id="code-example" class="text-sm overflow-x-auto"><code>&lt;script src="https://widget.yourdomain.com/latest/chat-widget.js"&gt;&lt;/script&gt;
&lt;script&gt;
  ChatWidget.init({
    apiKey: 'your-api-key',
    position: 'bottom-right',
    primaryColor: '#3b82f6',
    locale: 'en'
  })
&lt;/script&gt;</code></pre>
        <button id="copy-code" class="mt-4 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm">
          Copy Code
        </button>
      </div>
    </div>
  </div>

  <!-- Load Widget -->
  <script src="/chat-widget.js"></script>
  <script>
    let widgetInstance = null
    
    function initWidget() {
      if (widgetInstance) {
        widgetInstance.destroy()
      }
      
      const config = {
        apiKey: 'demo-key',
        position: document.getElementById('position').value,
        primaryColor: document.getElementById('color').value,
        locale: document.getElementById('locale').value,
        onReady: () => console.log('Widget ready'),
        onMessage: (msg) => console.log('New message:', msg)
      }
      
      widgetInstance = ChatWidget.init(config)
      updateCodeExample(config)
    }
    
    function updateCodeExample(config) {
      const code = `<script src="https://widget.yourdomain.com/latest/chat-widget.js"><\/script>
<script>
  ChatWidget.init(${JSON.stringify(config, null, 2)})
<\/script>`
      document.getElementById('code-example').textContent = code
    }
    
    document.getElementById('apply-config').addEventListener('click', initWidget)
    document.getElementById('copy-code').addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('code-example').textContent)
      alert('Code copied to clipboard!')
    })
    
    // Initialize with defaults
    initWidget()
  </script>
</body>
</html>

🎯 Phase 4: Testing & Monitoring (Week 3)
4.1 E2E Testing dengan Playwright
typescript// packages/widget/tests/e2e/widget.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Chat Widget', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
  })

  test('should initialize and open widget', async ({ page }) => {
    // Wait for widget button
    const widgetButton = page.locator('button[class*="rounded-full"]')
    await expect(widgetButton).toBeVisible()

    // Click to open
    await widgetButton.click()

    // Check if chat window is visible
    const chatWindow = page.locator('[class*="w-[380px]"]')
    await expect(chatWindow).toBeVisible()
  })

  test('should send and receive messages', async ({ page }) => {
    // Open widget
    await page.locator('button[class*="rounded-full"]').click()

    // Type message
    const input = page.locator('input[placeholder*="Type"]')
    await input.fill('Hello, this is a test message')
    
    // Send message
    await page.keyboard.press('Enter')

    // Check if message appears
    await expect(page.locator('text=Hello, this is a test message')).toBeVisible()

    // Wait for bot response
    await expect(page.locator('text=Thanks for your message')).toBeVisible({ timeout: 5000 })
  })

  test('should persist messages in localStorage', async ({ page }) => {
    // Send a message
    await page.locator('button[class*="rounded-full"]').click()
    await page.locator('input[placeholder*="Type"]').fill('Test persistence')
    await page.keyboard.press('Enter')

    // Reload page
    await page.reload()
    await page.locator('button[class*="rounded-full"]').click()

    // Check if message is still there
    await expect(page.locator('text=Test persistence')).toBeVisible()
  })

  test('should work in shadow DOM', async ({ page }) => {
    // Widget should be isolated
    const shadowHost = page.locator('#chat-widget-root')
    await expect(shadowHost).toBeAttached()

    // Styles should not leak
    const bodyBg = await page.evaluate(() => 
      window.getComputedStyle(document.body).backgroundColor
    )
    expect(bodyBg).not.toBe('rgb(59, 130, 246)') // primary color
  })

  test('should handle network errors gracefully', async ({ page }) => {
    // Block WebSocket connection
    await page.route('wss://api.yourdomain.com/**', route => route.abort())

    await page.locator('button[class*="rounded-full"]').click()

    // Should show offline status
    await expect(page.locator('text=Offline')).toBeVisible()
  })
})

4.2 Analytics & Monitoring
typescript// packages/widget/src/utils/analytics.ts
interface AnalyticsEvent {
  event: string
  properties?: Record<string, any>
}

class Analytics {
  private apiKey: string
  private endpoint = 'https://analytics.yourdomain.com/events'
  private queue: AnalyticsEvent[] = []
  private flushInterval: NodeJS.Timeout | null = null

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.startAutoFlush()
  }

  track(event: string, properties?: Record<string, any>) {
    this.queue.push({
      event,
      properties: {
        ...properties,
        timestamp: Date.now(),
        url: window.location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent
      }
    })

    if (this.queue.length >= 10) {
      this.flush()
    }
  }

  private startAutoFlush() {
    this.flushInterval = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush()
      }
    }, 30000) // Flush every 30 seconds
  }

  private async flush() {
    if (this.queue.length === 0) return

    const events = [...this.queue]
    this.queue = []

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({ events })
      })
    } catch (error) {
      console.error('Failed to send analytics:', error)
      // Re-queue on failure
      this.queue.unshift(...events)
    }
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.flush()
  }
}

export default Analytics

📊 Success Metrics & KPIs
Technical Metrics:

Bundle Size: < 150KB (gzipped)
First Paint: < 1s
Time to Interactive: < 2s
Lighthouse Score: > 90
CDN Cache Hit Rate: > 95%
WebSocket Connection Success: > 99%

Business Metrics:

Widget Load Time (P95): < 500ms
Message Delivery Success Rate: > 99.9%
User Engagement Rate: Track opens per session
Conversation Completion Rate


🚀 Rollout Strategy
Week 1:

Deploy to staging environment
Internal testing with team
Fix critical bugs

Week 2:

Beta release to 5 pilot customers
Gather feedback
Performance optimization

Week 3:

Public release (v1.0.0)
Documentation site launch
Marketing announcement


📚 Documentation Deliverables

Installation Guide
API Reference
Configuration Options
Troubleshooting Guide
Security Best Practices
Migration Guide (untuk updates)


🔐 Security Considerations

✅ CORS configuration yang proper
✅ CSP headers untuk XSS protection
✅ API key validation
✅ Rate limiting per domain
✅ Input sanitization
✅ SRI (Subresource Integrity) hashes