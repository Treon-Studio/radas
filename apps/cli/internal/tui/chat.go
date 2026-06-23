package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/raizora/radas/v4/internal/ai"
	"github.com/raizora/radas/v4/internal/tui/theme"
)

type chatMsg struct {
	role    string
	content string
}

type ChatView struct {
	messages  []chatMsg
	textarea  textarea.Model
	streaming string
	viewport  viewport.Model
	spinner   spinner.Model
	isWaiting bool
	chat      *ai.ChatSession
	ready     bool
	width     int
	height    int

	sessionID int
}

func NewChatView(chat *ai.ChatSession) *ChatView {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	ta := textarea.New()
	ta.Placeholder = "Ask anything..."
	ta.FocusedStyle.CursorLine = lipgloss.NewStyle()
	ta.ShowLineNumbers = false
	ta.CharLimit = 0
	ta.MaxHeight = 3
	ta.KeyMap.InsertNewline = keys.NewLine
	
	// Style the cursor like OpenCode/Gemini
	ta.Cursor.Style = lipgloss.NewStyle().Foreground(theme.OpenCode.Accent)

	return &ChatView{
		chat:    chat,
		spinner: s,
		textarea: ta,
	}
}

func (c *ChatView) Init() tea.Cmd {
	return tea.Batch(c.spinner.Tick, textarea.Blink)
}

func (c *ChatView) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		c.width = msg.Width
		c.height = msg.Height
		inputHeight := 3
		// Viewport takes remaining height: msg.Height - inputHeight - 3
		viewportHeight := msg.Height - inputHeight - 3
		if viewportHeight < 1 {
			viewportHeight = 1
		}
		if !c.ready {
			c.viewport = viewport.New(msg.Width, viewportHeight)
			c.ready = true
		} else {
			c.viewport.Width = msg.Width
			c.viewport.Height = viewportHeight
		}
		c.textarea.SetWidth(msg.Width - 4)
		c.textarea.SetHeight(inputHeight)

	case spinner.TickMsg:
		var cmd tea.Cmd
		c.spinner, cmd = c.spinner.Update(msg)
		cmds = append(cmds, cmd)

	case tea.KeyMsg:
		if !c.textarea.Focused() {
			debugLog("ChatView.KeyMsg: NOT FOCUSED, dropping key=", string(msg.Runes))
			break
		}
		before := c.textarea.Value()
		var cmd tea.Cmd
		c.textarea, cmd = c.textarea.Update(msg)
		after := c.textarea.Value()
		debugLog("ChatView.KeyMsg: key=", string(msg.Runes),
			" before=", before,
			" after=", after,
			" focused=", c.textarea.Focused())
		cmds = append(cmds, cmd)

	default:
		// Forward all unhandled messages (cursor blink, etc.) to textarea
		var cmd tea.Cmd
		c.textarea, cmd = c.textarea.Update(msg)
		cmds = append(cmds, cmd)
	}

	return c, tea.Batch(cmds...)
}

func (c *ChatView) AddUserMessage(content string) {
	c.messages = append(c.messages, chatMsg{role: ai.RoleUser, content: content})
	c.streaming = ""
	c.isWaiting = true
	c.textarea.Reset()
	if c.ready {
		c.viewport.SetContent(c.renderMessages())
		c.viewport.GotoBottom()
	}
}

func (c *ChatView) AddAIMessage(content string) {
	c.messages = append(c.messages, chatMsg{role: ai.RoleAssistant, content: content})
	c.streaming = ""
	c.isWaiting = false
	if c.ready {
		c.viewport.SetContent(c.renderMessages())
		c.viewport.GotoBottom()
	}
}

func (c *ChatView) UpdateStreaming(chunk string) {
	c.streaming += chunk
	if c.ready {
		c.viewport.SetContent(c.renderMessages() + "\n" + c.renderStreamingPart())
		c.viewport.GotoBottom()
	}
}

func (c *ChatView) FocusInput() tea.Cmd {
	debugLog("FocusInput: was focused=", c.textarea.Focused())
	cmd := c.textarea.Focus()
	debugLog("FocusInput: now focused=", c.textarea.Focused())
	return cmd
}

func (c *ChatView) BlurInput() {
	c.textarea.Blur()
}

func (c *ChatView) InputFocused() bool {
	return c.textarea.Focused()
}

func (c *ChatView) Input() string {
	return c.textarea.Value()
}

func (c *ChatView) Clear() {
	c.messages = nil
	c.streaming = ""
	c.isWaiting = false
	c.textarea.Reset()
	if c.ready {
		c.viewport.SetContent("")
	}
}

func (c *ChatView) SessionID() int {
	return c.sessionID
}

func (c *ChatView) SetSessionID(id int) {
	c.sessionID = id
}

func (c *ChatView) IsWaiting() bool {
	return c.isWaiting
}

var userStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#3B82F6"))
var aiStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#10B981"))

func (c *ChatView) renderMessages() string {
	t := theme.OpenCode
	var b strings.Builder

	for _, m := range c.messages {
		switch m.role {
		case ai.RoleUser:
			b.WriteString(userStyle.Render("You"))
			b.WriteString("\n")
			b.WriteString(lipgloss.NewStyle().Foreground(t.TextPrimary).Render(m.content))
			b.WriteString("\n\n")

		case ai.RoleAssistant:
			b.WriteString(aiStyle.Render("Radas AI"))
			b.WriteString("\n")
			b.WriteString(lipgloss.NewStyle().Foreground(t.TextPrimary).Render(m.content))
			b.WriteString("\n\n")

		case ai.RoleTool:
			b.WriteString(lipgloss.NewStyle().
				Foreground(t.TextMuted).
				Italic(true).
				Render(fmt.Sprintf("⚙ %s", m.content)))
			b.WriteString("\n\n")
		}
	}

	return b.String()
}

func (c *ChatView) renderStreamingPart() string {
	t := theme.OpenCode
	return lipgloss.NewStyle().
		Foreground(t.Accent).
		Italic(true).
		Render(c.streaming)
}

func (c *ChatView) renderInputBar() string {
	t := theme.OpenCode

	barStyle := lipgloss.NewStyle().
		Width(c.width - 4).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Border).
		Padding(0, 1)

	if c.textarea.Focused() {
		barStyle = barStyle.BorderForeground(t.Accent)
	}

	content := c.textarea.View()
	return barStyle.Render(content)
}

func (c *ChatView) View() string {
	if !c.ready {
		return "Loading..."
	}

	var b strings.Builder
	b.WriteString(c.viewport.View())
	b.WriteString("\n")

	if c.isWaiting {
		if c.streaming == "" {
			b.WriteString(c.spinner.View() + " Thinking...\n")
		} else {
			b.WriteString(c.spinner.View() + " Generating...\n")
		}
	}

	b.WriteString(c.renderInputBar())
	b.WriteString("\n")
	
	hint := lipgloss.NewStyle().Foreground(theme.OpenCode.TextMuted).Render("  Enter to send • Alt+Enter for new line")
	b.WriteString(hint)

	return b.String()
}
