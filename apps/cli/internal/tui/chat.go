package tui

import "github.com/raizora/radas/v4/internal/ai"

type ChatView struct {
	chat *ai.ChatSession
}

func NewChatView(chat *ai.ChatSession) *ChatView {
	return &ChatView{chat: chat}
}

func (c *ChatView) View() string {
	return "Chat view"
}
