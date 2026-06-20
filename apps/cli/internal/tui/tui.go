package tui

import (
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/raizora/radas/v4/internal/ai"
)

// Start launches the TUI with the given workspace context. The TUI
// runs until the user quits or a fatal error occurs.
func Start(projects, templates []string, aiConfig *ai.AIConfig) error {
	chatSession := setupChatSession(aiConfig, projects, templates)
	p := NewProgram(projects, templates, chatSession)
	_, err := p.Run()
	return err
}

// NewProgram creates a tea.Program configured for the TUI. Exposed for testing.
func NewProgram(projects, templates []string, chatSession *ai.ChatSession) *tea.Program {
	m := NewModel(projects, templates, chatSession)
	return tea.NewProgram(m, tea.WithOutput(os.Stderr), tea.WithAltScreen())
}

func setupChatSession(aiConfig *ai.AIConfig, projects, templates []string) *ai.ChatSession {
	if aiConfig == nil || aiConfig.DefaultProvider == "" {
		return nil
	}
	providerCfg, ok := aiConfig.Providers[aiConfig.DefaultProvider]
	if !ok || providerCfg.APIKey == "" {
		return nil
	}

	provider := ai.NewOpenAIProvider(ai.OpenAIConfig{
		APIKey:  providerCfg.APIKey,
		BaseURL: providerCfg.BaseURL,
		Model:   providerCfg.Model,
	})

	reg := ai.NewToolRegistry()
	costTracker := ai.NewCostTracker(aiConfig.CostCeiling)

	session := ai.NewChatSession(ai.ChatConfig{
		Provider:      provider,
		ToolRegistry:  reg,
		Model:         providerCfg.Model,
		MaxIterations: aiConfig.MaxToolIterations,
		CostTracker:   costTracker,
	})

	systemPrompt := ai.BuildSystemPrompt(ai.SystemContext{
		Tools:     reg.Definitions(),
		Projects:  projects,
		Templates: templates,
	})
	session.AddSystem(systemPrompt)

	return session
}
