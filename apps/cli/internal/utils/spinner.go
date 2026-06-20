package utils

import (
	"time"

	"github.com/briandowns/spinner"
)

// NewSpinner returns a pre-configured spinner using the braille charset (14)
// and a custom suffix, mimicking modern CLI agents (like Claude Code).
func NewSpinner(message string) *spinner.Spinner {
	s := spinner.New(spinner.CharSets[14], 80*time.Millisecond)
	s.Suffix = " " + message
	s.Color("magenta", "bold")
	return s
}
