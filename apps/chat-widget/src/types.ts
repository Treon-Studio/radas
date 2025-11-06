export interface WidgetConfig {
  apiKey: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  primaryColor?: string
  locale?: 'en' | 'id'
  customCSS?: string
  onReady?: () => void
  onMessage?: (message: any) => void
}
