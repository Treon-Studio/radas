package theme

import "github.com/charmbracelet/lipgloss"

type Theme struct {
	BGPrimary   lipgloss.Color
	BGSecondary lipgloss.Color
	BGTertiary  lipgloss.Color
	Accent      lipgloss.Color
	AccentHover lipgloss.Color
	AccentDim   lipgloss.Color
	TextPrimary   lipgloss.Color
	TextSecondary lipgloss.Color
	TextMuted     lipgloss.Color
	TextInverse   lipgloss.Color
	Success lipgloss.Color
	Warning lipgloss.Color
	Error   lipgloss.Color
	Info    lipgloss.Color
	Border      lipgloss.Color
	BorderFocus lipgloss.Color
}

var OpenCode = Theme{
	BGPrimary:   lipgloss.Color("#0d1117"),
	BGSecondary: lipgloss.Color("#161b22"),
	BGTertiary:  lipgloss.Color("#21262d"),
	Accent:      lipgloss.Color("#58a6ff"),
	AccentHover: lipgloss.Color("#79c0ff"),
	AccentDim:   lipgloss.Color("#388bfd"),
	TextPrimary:   lipgloss.Color("#c9d1d9"),
	TextSecondary: lipgloss.Color("#8b949e"),
	TextMuted:     lipgloss.Color("#484f58"),
	TextInverse:   lipgloss.Color("#0d1117"),
	Success: lipgloss.Color("#3fb950"),
	Warning: lipgloss.Color("#d29922"),
	Error:   lipgloss.Color("#f85149"),
	Info:    lipgloss.Color("#58a6ff"),
	Border:      lipgloss.Color("#30363d"),
	BorderFocus: lipgloss.Color("#58a6ff"),
}
