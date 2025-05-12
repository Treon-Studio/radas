package constants

// BranchTypes defines allowed git branch types for conventional naming
var BranchTypes = []string{"feature", "fix", "chore", "hotfix", "refactor", "test", "docs"}

// ProjectTypes defines allowed project types for radas.yml init
var ProjectTypes = []string{
	"monorepo-frontend",
	"frontend-web",
	"frontend-app",
	"frontend-desktop",
	"monorepo-backend",
	"backend-api",
	"docs",
}

// ConfigFileName is the default config file for radas
const ConfigFileName = "radas.yml"

// DefaultEditor is the fallback editor for opening files
const DefaultEditor = "code"

// Environment names
var EnvList = []string{"staging", "canary", "production"}

// Directory for environment files
const EnvDir = "envs"

// Pattern for environment file naming
const EnvFilePattern = ".env.%s"

// Table headers for pretty printing envs
var EnvHeaders = []string{"KEY", "VALUE", "ROLE"}

// Protected branches
var ProtectedBranches = map[string]bool{"main": true, "master": true, "develop": true}
