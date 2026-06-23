package tui

import "time"

type WindowResizeMsg struct {
	Width  int
	Height int
}

type FocusPaneMsg struct {
	Pane PaneType
}

type PaneType int

const (
	PaneMain PaneType = iota
	PaneInfo
	PaneInput
)

type ShowModalMsg struct {
	Title   string
	Content string
}

type HideModalMsg struct{}

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
	Error     error
}

type InfoPanelRefreshMsg struct{}

type SendChatMsg struct {
	Content string
}

type AIMessageMsg struct {
	Content string
	Done    bool
}
