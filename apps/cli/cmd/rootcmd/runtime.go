package rootcmd

import (
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/config"
)

// RegisterRuntimeFlags attaches the shared connection and tenant selection
// flags to the root command. Every remote command resolves them through
// config.LoadRuntimeConfig with precedence: flag > environment > persisted
// selector > built-in default. The token is never persisted or printed.
func RegisterRuntimeFlags(root *cobra.Command) {
	config.RegisterPersistentFlags(root)
}
