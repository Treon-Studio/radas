package tui

import (
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

	showSlashMenu bool
	slashCursor   int
}

type slashCommand struct {
	name string
	desc string
}

var allSlashCommands = []slashCommand{
	{"/clear", "Bersihkan layar percakapan"},
	{"/activity", "Tampilkan top proses CPU & Memori"},
	{"/memory", "Tampilkan sisa memori sistem"},
	{"/weather", "Cek prakiraan cuaca hari ini"},
	{"/news", "Baca berita nasional terkini"},
	{"/whatsapp", "Kirim pesan via WhatsApp"},
	{"/email", "Kirim pesan via Gmail"},
	{"/calendar", "Setup jadwal di kalender"},
	{"/hackernews", "Baca trending topics HackerNews"},
	{"/todo", "Tambahkan atau selesaikan todo list"},
	{"/rebuild", "Rebuild aplikasi CLI dan jalankan ulang"},
	{"/exit", "Keluar dari aplikasi CLI"},
}

func (c *ChatView) filteredSlashCommands() []slashCommand {
	val := strings.ToLower(strings.TrimSpace(c.textarea.Value()))
	if val == "" || val == "/" {
		return allSlashCommands
	}
	var filtered []slashCommand
	for _, cmd := range allSlashCommands {
		if strings.HasPrefix(cmd.name, val) {
			filtered = append(filtered, cmd)
		}
	}
	return filtered
}

func (c *ChatView) updateViewportHeight() {
	bottomLines := 0

	if c.showSlashMenu {
		cmdsList := c.filteredSlashCommands()
		if len(cmdsList) > 0 {
			bottomLines += len(cmdsList) + 2 // menu height with borders
		}
	}

	if c.isWaiting {
		bottomLines += 1 // spinner line
	}

	// renderInputBar uses padding/border: top+bottom=2. textarea height is 3. Total=5
	bottomLines += 5 
	bottomLines += 1 // hint line

	h := c.height - bottomLines
	if h < 1 {
		h = 1
	}
	c.viewport.Height = h
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
		
		if !c.ready {
			c.viewport = viewport.New(msg.Width, 1)
			c.ready = true
		} else {
			c.viewport.Width = msg.Width
		}
		
		c.textarea.SetWidth(msg.Width - 4)
		c.textarea.SetHeight(3)
		c.updateViewportHeight()

	case spinner.TickMsg:
		var cmd tea.Cmd
		c.spinner, cmd = c.spinner.Update(msg)
		cmds = append(cmds, cmd)

	case tea.MouseMsg:
		if c.ready {
			var cmd tea.Cmd
			c.viewport, cmd = c.viewport.Update(msg)
			cmds = append(cmds, cmd)
		}

	case tea.KeyMsg:
		if msg.Type == tea.KeyPgUp || msg.Type == tea.KeyPgDown {
			if c.ready {
				var cmd tea.Cmd
				c.viewport, cmd = c.viewport.Update(msg)
				cmds = append(cmds, cmd)
			}
			break
		}

		if c.showSlashMenu {
			cmdsList := c.filteredSlashCommands()
			switch msg.Type {
			case tea.KeyUp, tea.KeyCtrlK:
				c.slashCursor--
				if c.slashCursor < 0 {
					c.slashCursor = len(cmdsList) - 1
				}
				return c, nil
			case tea.KeyDown, tea.KeyCtrlJ:
				c.slashCursor++
				if c.slashCursor >= len(cmdsList) {
					c.slashCursor = 0
				}
				return c, nil
			case tea.KeyEnter:
				if len(cmdsList) > 0 && c.slashCursor >= 0 && c.slashCursor < len(cmdsList) {
					selected := cmdsList[c.slashCursor]
					c.textarea.SetValue(selected.name + " ")
					c.textarea.SetCursor(len(c.textarea.Value()))
				}
				c.showSlashMenu = false
				c.slashCursor = 0
				c.updateViewportHeight()
				return c, nil
			case tea.KeyEsc:
				c.showSlashMenu = false
				c.slashCursor = 0
				c.updateViewportHeight()
				return c, nil
			}
		}
		
		if !c.textarea.Focused() {
			debugLog("ChatView.KeyMsg: NOT FOCUSED, dropping key=", string(msg.Runes))
			break
		}
		before := c.textarea.Value()
		var cmd tea.Cmd
		c.textarea, cmd = c.textarea.Update(msg)
		after := c.textarea.Value()
		
		if strings.HasPrefix(after, "/") {
			c.showSlashMenu = len(c.filteredSlashCommands()) > 0
			if c.slashCursor >= len(c.filteredSlashCommands()) {
				c.slashCursor = 0
			}
		} else {
			c.showSlashMenu = false
		}
		c.updateViewportHeight()

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
	c.updateViewportHeight()
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
	c.updateViewportHeight()
	if c.ready {
		c.viewport.SetContent(c.renderMessages())
		c.viewport.GotoBottom()
	}
}

func (c *ChatView) AddToolMessage(content string) {
	c.messages = append(c.messages, chatMsg{role: ai.RoleTool, content: content})
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


func getIndicatorStyle(action string, t theme.Theme) (string, lipgloss.Color) {
	action = strings.ToLower(strings.TrimSpace(action))
	switch action {
	case "bash", "shell", "run", "cmd", "exec": return "💻", lipgloss.Color("#10B981")
	case "fetch", "get", "curl", "http": return "🌐", lipgloss.Color("#3B82F6")
	case "read", "view", "cat", "ls": return "📖", lipgloss.Color("#EAB308")
	case "write", "edit", "append", "touch": return "✏️ ", lipgloss.Color("#EF4444")
	case "delete", "rm", "remove", "kill": return "🗑️ ", lipgloss.Color("#DC2626")
	case "search", "find", "grep", "locate": return "🔍", lipgloss.Color("#A855F7")
	case "system", "os", "hw", "monitor": return "⚙️ ", lipgloss.Color("#6B7280")
	case "sleep", "wait", "pause", "delay": return "⏳", lipgloss.Color("#F59E0B")
	case "db", "sql", "query", "insert": return "🗄️ ", lipgloss.Color("#6366F1")
	case "build", "make", "compile": return "🔨", lipgloss.Color("#D97706")
	case "test", "verify", "check": return "🧪", lipgloss.Color("#14B8A6")
	case "deploy", "publish", "ship": return "🚀", lipgloss.Color("#8B5CF6")
	case "git", "commit", "push", "pull": return "🐙", lipgloss.Color("#F43F5E")
	case "ai", "think", "analyze", "predict": return "🧠", lipgloss.Color("#EC4899")
	case "ui", "render", "draw", "display": return "🎨", lipgloss.Color("#F472B6")
	case "config", "set", "env", "options": return "🔧", lipgloss.Color("#9CA3AF")
	case "auth", "login", "token": return "🔐", lipgloss.Color("#10B981")
	case "crypto", "hash", "encrypt": return "🛡️ ", lipgloss.Color("#4B5563")
	case "math", "calc", "compute", "add": return "🧮", lipgloss.Color("#0EA5E9")
	case "audio", "play", "sound", "volume": return "🔊", lipgloss.Color("#8B5CF6")
	case "video", "record", "stream": return "📹", lipgloss.Color("#EF4444")
	case "image", "picture", "photo": return "🖼️ ", lipgloss.Color("#F59E0B")
	case "map", "location", "gps", "geo": return "🗺️ ", lipgloss.Color("#10B981")
	case "weather", "forecast", "climate": return "🌤️ ", lipgloss.Color("#0EA5E9")
	case "mail", "email", "send", "smtp": return "📧", lipgloss.Color("#3B82F6")
	case "chat", "msg", "talk", "say": return "💬", lipgloss.Color("#14B8A6")
	case "schedule", "cron", "timer", "job": return "📅", lipgloss.Color("#F59E0B")
	case "scrape", "parse", "extract": return "🕷️ ", lipgloss.Color("#A855F7")
	case "compress", "zip", "tar", "gzip": return "🗜️ ", lipgloss.Color("#6B7280")
	case "upload", "put": return "📤", lipgloss.Color("#3B82F6")
	case "download", "dl": return "📥", lipgloss.Color("#10B981")
	case "start", "boot", "init", "up": return "🟢", lipgloss.Color("#10B981")
	case "stop", "halt", "down": return "🛑", lipgloss.Color("#EF4444")
	case "restart", "reboot", "reload": return "🔄", lipgloss.Color("#F59E0B")
	case "print", "echo", "log": return "🖨️ ", lipgloss.Color("#9CA3AF")
	case "filter", "reduce": return "🌪️ ", lipgloss.Color("#A855F7")
	case "route", "proxy", "forward": return "🔀", lipgloss.Color("#6366F1")
	case "cache", "redis", "memcached": return "⚡", lipgloss.Color("#F59E0B")
	case "format", "lint", "style": return "✨", lipgloss.Color("#14B8A6")
	case "clean", "clear", "sweep": return "🧹", lipgloss.Color("#9CA3AF")
	case "sync", "update", "refresh": return "🔁", lipgloss.Color("#3B82F6")
	case "backup", "save", "snapshot": return "💾", lipgloss.Color("#6B7280")
	case "migrate", "move", "transfer": return "🚚", lipgloss.Color("#F59E0B")
	case "patch", "fix", "repair": return "🩹", lipgloss.Color("#10B981")
	case "lock", "mutex": return "🔒", lipgloss.Color("#EF4444")
	case "unlock", "free", "release": return "🔓", lipgloss.Color("#10B981")
	case "notify", "alert", "warn": return "🔔", lipgloss.Color("#F59E0B")
	case "export", "dump": return "📦", lipgloss.Color("#8B5CF6")
	case "import", "load": return "📥", lipgloss.Color("#3B82F6")
	case "generate", "create": return "🪄 ", lipgloss.Color("#A855F7")
	default: return "●", t.Success
	}
}

func (c *ChatView) renderMessages() string {
	t := theme.OpenCode
	var b strings.Builder

	for i, m := range c.messages {
		switch m.role {
		case ai.RoleUser:
			if i > 0 {
				b.WriteString(lipgloss.NewStyle().Foreground(t.Border).Render(strings.Repeat("─", 60)))
				b.WriteString("\n\n")
			}
			b.WriteString(lipgloss.NewStyle().Foreground(t.Accent).Render("> " + m.content))
			b.WriteString("\n\n")

		case ai.RoleAssistant:
			b.WriteString(lipgloss.NewStyle().Foreground(t.TextPrimary).Render(m.content))
			b.WriteString("\n\n")

		case ai.RoleTool:
			action := m.content
			args := ""
			if parts := strings.SplitN(m.content, "(", 2); len(parts) == 2 {
				action = parts[0]
				args = "(" + parts[1]
			}
			
			icon, color := getIndicatorStyle(action, t)

			b.WriteString(lipgloss.NewStyle().Foreground(color).Render(icon + " "))
			b.WriteString(lipgloss.NewStyle().Foreground(color).Render(action))
			b.WriteString(lipgloss.NewStyle().Foreground(t.TextMuted).Render(args))
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

func (c *ChatView) renderSlashMenu() string {
	t := theme.OpenCode
	cmdsList := c.filteredSlashCommands()
	if len(cmdsList) == 0 {
		return ""
	}

	var b strings.Builder
	for i, cmd := range cmdsList {
		if i == c.slashCursor {
			b.WriteString(lipgloss.NewStyle().Background(t.Accent).Foreground(t.BGPrimary).Bold(true).Render(" "+cmd.name) + " " + lipgloss.NewStyle().Foreground(t.TextPrimary).Render(cmd.desc))
		} else {
			b.WriteString(lipgloss.NewStyle().Foreground(t.TextPrimary).Bold(true).Render(" "+cmd.name) + " " + lipgloss.NewStyle().Foreground(t.TextMuted).Render(cmd.desc))
		}
		b.WriteString("\n")
	}

	return lipgloss.NewStyle().
		Width(c.width - 4).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Border).
		Padding(0, 1).
		Render(strings.TrimRight(b.String(), "\n"))
}

func (c *ChatView) View() string {
	if !c.ready {
		return "Loading..."
	}

	var b strings.Builder
	b.WriteString(c.viewport.View())
	b.WriteString("\n")

	if c.showSlashMenu {
		b.WriteString(c.renderSlashMenu())
		b.WriteString("\n")
	}

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
