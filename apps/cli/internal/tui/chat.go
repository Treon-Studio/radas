package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/raizora/radas/v4/internal/ai"
)

type chatMsg struct {
	role    string
	content string
}

type ChatView struct {
	messages  []chatMsg
	input     string
	streaming string
	viewport  viewport.Model
	chat      *ai.ChatSession
	ready     bool
	width     int
	height    int
}

func NewChatView(chat *ai.ChatSession) *ChatView {
	return &ChatView{
		chat: chat,
	}
}

func (c *ChatView) Init() tea.Cmd {
	return nil
}

func (c *ChatView) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		c.width = msg.Width
		c.height = msg.Height
		if !c.ready {
			c.viewport = viewport.New(msg.Width-4, msg.Height-8)
			c.ready = true
		} else {
			c.viewport.Width = msg.Width - 4
			c.viewport.Height = msg.Height - 8
		}
	}
	return c, nil
}

func (c *ChatView) AddUserMessage(content string) {
	c.messages = append(c.messages, chatMsg{role: "user", content: content})
	c.streaming = ""
	if c.ready {
		c.viewport.SetContent(c.renderMessages())
		c.viewport.GotoBottom()
	}
}

func (c *ChatView) AddAIMessage(content string) {
	c.messages = append(c.messages, chatMsg{role: "assistant", content: content})
	c.streaming = ""
	if c.ready {
		c.viewport.SetContent(c.renderMessages())
		c.viewport.GotoBottom()
	}
}

func (c *ChatView) UpdateStreaming(chunk string) {
	c.streaming += chunk
	if c.ready {
		c.viewport.SetContent(c.renderMessages() + "\n" + streamingStyle.Render(c.streaming))
		c.viewport.GotoBottom()
	}
}

func (c *ChatView) SetInput(input string) {
	c.input = input
}

func (c *ChatView) Input() string {
	return c.input
}

var userStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#3B82F6"))
var aiStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#10B981"))
var streamingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#6B7280")).Italic(true)

func (c *ChatView) renderMessages() string {
	var b strings.Builder
	for _, m := range c.messages {
		switch m.role {
		case "user":
			b.WriteString(userStyle.Render("You:") + "\n")
			b.WriteString(m.content + "\n\n")
		case "assistant":
			b.WriteString(aiStyle.Render("Radas AI:") + "\n")
			b.WriteString(m.content + "\n\n")
		case "tool":
			b.WriteString(fmt.Sprintf("🔧 %s\n\n", m.content))
		}
	}
	return b.String()
}

func (c *ChatView) View() string {
	if !c.ready {
		return "Loading..."
	}

	var b strings.Builder
	b.WriteString(c.viewport.View() + "\n")

	b.WriteString(strings.Repeat("─", c.viewport.Width) + "\n")
	if strings.HasPrefix(c.input, ":") {
		b.WriteString(fmt.Sprintf("cmd> %s", strings.TrimPrefix(c.input, ":")))
	} else {
		b.WriteString(fmt.Sprintf("> %s", c.input))
	}

	return b.String()
}
