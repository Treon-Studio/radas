package constants

// Version information
// Version is overridden at build time via -ldflags "-X github.com/raizora/radas/v4/constants.Version=<value>"
// The build script derives it from `git describe --tags --always`.
// Note: must be a `var`, not `const`, because the Go linker can only override variables
// (not constants) via the -X ldflag.
var (
	// Version is the current version of the application
	Version = "dev"

	// VersionCheckURL is the URL to check for new versions
	// This should point to a released version JSON file on GitHub
	VersionCheckURL = "https://api.github.com/repos/raizora/radas/releases/latest"
)
