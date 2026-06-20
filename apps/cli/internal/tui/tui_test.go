package tui

import (
	"testing"

	"github.com/raizora/radas/v4/internal/ai"
)

func TestSetupChatSession_Nil(t *testing.T) {
	if got := setupChatSession(nil, nil, nil); got != nil {
		t.Error("expected nil for nil config")
	}
}

func TestSetupChatSession_Empty(t *testing.T) {
	cfg := &ai.AIConfig{}
	if got := setupChatSession(cfg, nil, nil); got != nil {
		t.Error("expected nil for empty config")
	}
}

func TestSetupChatSession_NoProvider(t *testing.T) {
	cfg := &ai.AIConfig{DefaultProvider: "missing"}
	if got := setupChatSession(cfg, nil, nil); got != nil {
		t.Error("expected nil when default provider not in map")
	}
}

func TestSetupChatSession_EmptyAPIKey(t *testing.T) {
	cfg := &ai.AIConfig{
		DefaultProvider: "test",
		Providers: map[string]ai.ProviderConfig{
			"test": {Model: "x"},
		},
	}
	if got := setupChatSession(cfg, nil, nil); got != nil {
		t.Error("expected nil when API key is empty")
	}
}

func TestSetupChatSession_Full(t *testing.T) {
	cfg := &ai.AIConfig{
		DefaultProvider:    "test",
		CostCeiling:        0.10,
		MaxToolIterations:  10,
		Providers: map[string]ai.ProviderConfig{
			"test": {
				APIKey:  "test-key",
				BaseURL: "https://api.example.com/v1",
				Model:   "test-model",
			},
		},
	}
	got := setupChatSession(cfg, []string{"api"}, []string{"go-api"})
	if got == nil {
		t.Fatal("expected non-nil session")
	}
}

func TestNewProgram_ReturnsProgram(t *testing.T) {
	p := NewProgram([]string{"api"}, []string{"go-api"}, nil)
	if p == nil {
		t.Fatal("expected non-nil tea.Program")
	}
}
