package infopanel

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/raizora/radas/v4/internal/network"
	"github.com/raizora/radas/v4/internal/radas"
	"github.com/raizora/radas/v4/internal/tui/theme"
)

type RadasCheckMsg struct {
	Detected bool
	Path     string
	Version  string
	Valid    bool
	Error    error
}

type NetworkCheckMsg struct {
	Connected bool
	Latency   time.Duration
	Error     error
}

type MCPCheckMsg struct {
	Connected bool
	Count     int
	Servers   []string
	Error     error
}

type RefreshMsg struct{}

func CheckRadas() tea.Cmd {
	return func() tea.Msg {
		r := radas.Detect()
		return RadasCheckMsg{
			Detected: r.Detected,
			Path:     r.Path,
			Version:  r.Version,
			Valid:    r.Valid,
			Error:    r.Error,
		}
	}
}

func CheckNetwork() tea.Cmd {
	return func() tea.Msg {
		result := network.Check(context.Background())
		return NetworkCheckMsg{
			Connected: result.Connected,
			Latency:   result.Latency,
			Error:     result.Error,
		}
	}
}

func CheckMCP() tea.Cmd {
	return func() tea.Msg {
		servers, err := radas.DetectMCPServers()
		if err != nil {
			return MCPCheckMsg{Connected: false, Count: 0, Error: err}
		}
		list := make([]string, len(servers))
		copy(list, servers)
		return MCPCheckMsg{
			Connected: len(servers) > 0,
			Count:     len(servers),
			Servers:   list,
		}
	}
}

type SectionState int

const (
	StateUnknown SectionState = iota
	StateOK
	StateWarning
	StateError
	StateChecking
)

type Model struct {
	width  int
	height int
	focused bool

	radasDetected  bool
	radasValid     bool
	radasPath      string
	radasVersion   string
	radasState     SectionState

	networkConnected bool
	networkLatency   time.Duration
	networkState     SectionState

	mcpConnected bool
	mcpCount     int
	mcpState     SectionState

	mcpServers   string

	lastCheck time.Time
	loading   bool
}

func New() Model {
	return Model{
		radasState:   StateUnknown,
		networkState: StateUnknown,
		mcpState:     StateUnknown,
	}
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case RadasCheckMsg:
		m.radasDetected = msg.Detected
		m.radasPath = msg.Path
		m.radasVersion = msg.Version
		m.radasValid = msg.Valid
		m.lastCheck = time.Now()
		m.loading = false

		switch {
		case !msg.Detected:
			m.radasState = StateError
		case msg.Error != nil || !msg.Valid:
			m.radasState = StateWarning
		default:
			m.radasState = StateOK
		}

	case NetworkCheckMsg:
		m.networkConnected = msg.Connected
		m.networkLatency = msg.Latency
		m.lastCheck = time.Now()

		if msg.Error != nil || !msg.Connected {
			m.networkState = StateError
		} else {
			m.networkState = StateOK
		}

	case MCPCheckMsg:
		m.mcpConnected = msg.Connected
		m.mcpCount = msg.Count
		m.lastCheck = time.Now()
		m.mcpServers = m.buildServerList(msg)

		if msg.Error != nil || !msg.Connected {
			m.mcpState = StateError
		} else {
			m.mcpState = StateOK
		}

	case RefreshMsg:
		m.loading = true
		m.radasState = StateChecking
		m.networkState = StateChecking
		m.mcpState = StateChecking
		return m, tea.Batch(CheckRadas(), CheckNetwork(), CheckMCP())
	}

	return m, nil
}

func (m Model) buildServerList(msg MCPCheckMsg) string {
	if !msg.Connected || msg.Count == 0 {
		return ""
	}
	return formatServerList(msg.Servers)
}

func formatServerList(servers []string) string {
	if len(servers) == 0 {
		return ""
	}
	var b strings.Builder
	for i, s := range servers {
		b.WriteString(fmt.Sprintf("\n  %s%s", serverPrefix(i, len(servers)), s))
	}
	return b.String()
}

func serverPrefix(i, total int) string {
	if i == total-1 {
		return "└─ "
	}
	return "├─ "
}

func (m Model) SetWidth(w int) Model {
	m.width = w
	return m
}

func (m Model) SetHeight(h int) Model {
	m.height = h
	return m
}

func (m Model) SetFocused(v bool) Model {
	m.focused = v
	return m
}

func (m Model) View() string {
	t := theme.OpenCode

	panelStyle := lipgloss.NewStyle().
		Width(m.width).
		Height(m.height).
		Border(lipgloss.NormalBorder()).
		BorderForeground(t.Border).
		Padding(1, 1)

	if m.focused {
		panelStyle = panelStyle.BorderForeground(t.BorderFocus)
	}

	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(t.Accent).
		MarginBottom(1)

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render("SYSTEM STATUS"),
		m.renderRadasSection(t),
		"",
		m.renderServiceHealthSection(t),
		"",
		m.renderNetworkSection(t),
		"",
		m.renderMCPSection(t),
		"",
		m.renderFooter(t),
	)

	return panelStyle.Render(content)
}

func (m Model) renderFooter(t theme.Theme) string {
	return lipgloss.NewStyle().
		Foreground(t.TextMuted).
		Render(fmt.Sprintf("Last check: %s", m.lastCheck.Format("15:04:05")))
}

func (m Model) renderRadasSection(t theme.Theme) string {
	header := lipgloss.NewStyle().Bold(true).Foreground(t.TextPrimary).Render("RADAS CONFIG")

	var status string
	switch m.radasState {
	case StateOK:
		icon := lipgloss.NewStyle().Foreground(t.Success).Render("●")
		status = fmt.Sprintf("%s Detected", icon)
	case StateWarning:
		icon := lipgloss.NewStyle().Foreground(t.Warning).Render("◐")
		status = fmt.Sprintf("%s Detected (invalid)", icon)
	case StateError:
		icon := lipgloss.NewStyle().Foreground(t.Error).Render("○")
		status = fmt.Sprintf("%s Not Detected", icon)
	default:
		icon := lipgloss.NewStyle().Foreground(t.TextMuted).Render("◌")
		status = fmt.Sprintf("%s Checking...", icon)
	}

	return lipgloss.NewStyle().
		Width(m.width - 6).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Border).
		Padding(0, 1).
		Render(header + "\n" + status)
}

func (m Model) renderServiceHealthSection(t theme.Theme) string {
	header := lipgloss.NewStyle().Bold(true).Foreground(t.TextPrimary).Render("SERVICE HEALTH")
	sep := strings.Repeat("─", max(0, m.width-10))

	// Hardcoded values to match mockup
	healthData := []struct{ name, bar, percent string }{
		{"Backend ", "[████████░░]", " 80%"},
		{"AI Model", "[██████░░░░]", " 60%"},
		{"Memory  ", "[██████████]", "100%"},
		{"Disk    ", "[████░░░░░░]", " 40%"},
	}

	var b strings.Builder
	b.WriteString(header + "\n" + sep)
	for _, h := range healthData {
		b.WriteString("\n" + h.name + " " + h.bar + h.percent)
	}

	return lipgloss.NewStyle().
		Width(m.width - 6).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Border).
		Padding(0, 1).
		Render(b.String())
}

func (m Model) renderNetworkSection(t theme.Theme) string {
	header := lipgloss.NewStyle().Bold(true).Foreground(t.TextPrimary).Render("INTERNET")

	var status string
	switch m.networkState {
	case StateOK:
		icon := lipgloss.NewStyle().Foreground(t.Success).Render("●")
		status = fmt.Sprintf("%s Connected %s", icon, m.networkLatency)
	case StateError:
		icon := lipgloss.NewStyle().Foreground(t.Error).Render("○")
		status = fmt.Sprintf("%s Disconnected", icon)
	default:
		icon := lipgloss.NewStyle().Foreground(t.TextMuted).Render("◌")
		status = fmt.Sprintf("%s Checking...", icon)
	}

	return lipgloss.NewStyle().
		Width(m.width - 6).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Border).
		Padding(0, 1).
		Render(header + "\n" + status)
}

func (m Model) renderMCPSection(t theme.Theme) string {
	header := lipgloss.NewStyle().Bold(true).Foreground(t.TextPrimary).Render("MCP SERVERS")

	var status string
	switch m.mcpState {
	case StateOK:
		icon := lipgloss.NewStyle().Foreground(t.Success).Render("●")
		status = fmt.Sprintf("%s Connected (%d)", icon, m.mcpCount)
	case StateError:
		icon := lipgloss.NewStyle().Foreground(t.Error).Render("○")
		status = fmt.Sprintf("%s None Connected", icon)
	default:
		icon := lipgloss.NewStyle().Foreground(t.TextMuted).Render("◌")
		status = fmt.Sprintf("%s Checking...", icon)
	}

	return lipgloss.NewStyle().
		Width(m.width - 6).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Border).
		Padding(0, 1).
		Render(header + "\n" + status)
}
