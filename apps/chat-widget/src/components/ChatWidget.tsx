import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageCircle, X, Send, Minimize2, Maximize2, Paperclip } from 'lucide-react'
import { WidgetConfig } from '../types'
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
    const handleSend = (e: Event) => {
      const customEvent = e as CustomEvent
      setInputValue(customEvent.detail.message)
      handleSendMessage()
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

  const handleSendMessage = useCallback(async () => {
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
  }, [inputValue, wsSendMessage, setMessages])

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
                    onKeyPress={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    className="flex-1"
                    disabled={!isConnected}
                  />
                  <Button
                    onClick={handleSendMessage}
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
