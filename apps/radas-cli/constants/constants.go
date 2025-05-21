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

// RadasASCIIArt is the ASCII art banner for Radas CLI
const RadasASCIIArt = `
▗▄▄▖  ▗▄▖ ▗▄▄▄   ▗▄▖  ▗▄▄▖
▐▌ ▐▌▐▌ ▐▌▐▌  █ ▐▌ ▐▌▐▌   
▐▛▀▚▖▐▛▀▜▌▐▌  █ ▐▛▀▜▌ ▝▀▚▖
▐▌ ▐▌▐▌ ▐▌▐▙▄▄▀ ▐▌ ▐▌▗▄▄▞▘
`

// CommandAliases defines short aliases for common radas commands
var CommandAliases = map[string]string{
	// Git commands
	"rcb": "create-branch",
	"rcm": "commit",
	"rp":  "push",
	"rpl": "pull",
	"rlb": "list-branch",
	"rdb": "del-branch",
	"rjp": "just-push",
	
	// Frontend commands
	"rfd": "fe doctor",
	"rfi": "fe init",
	"rfin": "fe install",
	"rfb": "fe build",
	"rfc": "fe clean",
	"rff": "fe fresh",
	"rfde": "fe dev",
	
	// Backend commands
	"rbd": "be doctor",
	"rbi": "be init",
	"rbin": "be install",
	"rbc": "be clean",
	"rbf": "be fresh",
	
	// DevOps commands
	"rdd": "devops doctor",
	
	// Design commands
	"rdsd": "design doctor",
	
	// Other commands
	"rdr": "doctor",
	"ri":  "install",
	"rsc": "sync-config",
	"rsr": "sync-repo",
	"rrb": "rebuild",
	"ru":  "update",
	"rv":  "version",
	"rcf": "config",
	"re":  "env",
}
