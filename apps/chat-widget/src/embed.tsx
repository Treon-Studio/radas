import { createRoot, Root } from 'react-dom/client'
import { ChatWidget } from './components/ChatWidget'
import { WidgetConfig } from './types'
import './index.css'

class ChatWidgetEmbed {
  private root: Root | null = null
  private container: HTMLDivElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private config: WidgetConfig

  constructor(config: WidgetConfig) {
    this.config = {
      position: 'bottom-right',
      locale: 'en',
      primaryColor: '#3b82f6',
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
    if (cssUrl) {
      try {
        const response = await fetch(cssUrl)
        const css = await response.text()
        styleElement.textContent = css + (this.config.customCSS || '')
      } catch (error) {
        console.error('Failed to load widget CSS:', error)
        styleElement.textContent = this.config.customCSS || ''
      }
    } else {
      styleElement.textContent = this.config.customCSS || ''
    }

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

  private getCSSUrl(): string | null {
    const script = document.currentScript as HTMLScriptElement
    const scriptSrc = script?.src || ''
    if (!scriptSrc) return null
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
