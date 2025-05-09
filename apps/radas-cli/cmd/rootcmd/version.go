package rootcmd

import (
	"fmt"
	"runtime"
	"time"

	"github.com/spf13/cobra"
	
	"radas/constants"
)

// VersionCmd represents the version command
var VersionCmd = &cobra.Command{
	Use:   "version",
	Short: "Display version information",
	Long:  `Display detailed version information about the Radas CLI.`,
	Run:   runVersion,
}

func runVersion(cmd *cobra.Command, args []string) {
	fmt.Printf("Radas CLI version: %s\n", constants.Version)
	fmt.Printf("Operating system: %s\n", runtime.GOOS)
	fmt.Printf("Architecture: %s\n", runtime.GOARCH)
	fmt.Printf("Go version: %s\n", runtime.Version())
	fmt.Printf("Build time: %s\n", time.Now().Format(time.RFC3339))
} 