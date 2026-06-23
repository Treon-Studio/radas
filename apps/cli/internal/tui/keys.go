package tui

import "github.com/charmbracelet/bubbles/key"

type keyMap struct {
	Quit        key.Binding
	FocusMain   key.Binding
	FocusInfo   key.Binding
	FocusInput  key.Binding
	SendMessage key.Binding
	NewLine     key.Binding
	NewSession  key.Binding
	CloseSession key.Binding
	CancelStream key.Binding
	ClearChat   key.Binding
	Help        key.Binding
	RefreshInfo  key.Binding
	ToggleSidebar key.Binding
	Enter        key.Binding
}

var keys = keyMap{
	Quit: key.NewBinding(
		key.WithKeys("ctrl+q", "ctrl+c"),
		key.WithHelp("Ctrl+Q", "quit"),
	),
	FocusMain: key.NewBinding(
		key.WithKeys("ctrl+m"),
		key.WithHelp("Ctrl+M", "focus main"),
	),
	FocusInfo: key.NewBinding(
		key.WithKeys("ctrl+shift+i"),
		key.WithHelp("Ctrl+Shift+I", "toggle info panel"),
	),
	ToggleSidebar: key.NewBinding(
		key.WithKeys("ctrl+b"),
		key.WithHelp("Ctrl+B", "toggle sidebar"),
	),
	FocusInput: key.NewBinding(
		key.WithKeys(":"),
		key.WithHelp(":", "focus input"),
	),
	SendMessage: key.NewBinding(
		key.WithKeys("enter"),
		key.WithHelp("Enter", "send"),
	),
	NewLine: key.NewBinding(
		key.WithKeys("shift+enter", "alt+enter", "ctrl+j"),
		key.WithHelp("Shift/Alt+Enter", "new line"),
	),
	NewSession: key.NewBinding(
		key.WithKeys("ctrl+n"),
		key.WithHelp("Ctrl+N", "new session"),
	),
	CloseSession: key.NewBinding(
		key.WithKeys("ctrl+w"),
		key.WithHelp("Ctrl+W", "close session"),
	),
	CancelStream: key.NewBinding(
		key.WithKeys("esc"),
		key.WithHelp("Esc", "cancel"),
	),
	ClearChat: key.NewBinding(
		key.WithKeys("ctrl+k"),
		key.WithHelp("Ctrl+K", "clear chat"),
	),
	Help: key.NewBinding(
		key.WithKeys("?"),
		key.WithHelp("?", "help"),
	),
	RefreshInfo: key.NewBinding(
		key.WithKeys("r"),
		key.WithHelp("r", "refresh"),
	),
	Enter: key.NewBinding(
		key.WithKeys("enter"),
	),
}
