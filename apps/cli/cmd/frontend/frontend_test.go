package frontend

import (
	"context"
	"errors"
	"testing"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/netgate"
)

type mockProber struct {
	err error
}

func (m *mockProber) Probe(ctx context.Context) error {
	return m.err
}

func TestCmdDefinition(t *testing.T) {
	if Cmd.Use != "fe" {
		t.Errorf("Cmd.Use = %q, want 'fe'", Cmd.Use)
	}
	if Cmd.Short == "" {
		t.Error("Cmd.Short should not be empty")
	}
	if Cmd.Long == "" {
		t.Error("Cmd.Long should not be empty")
	}
}

func TestCmdHasSubcommands(t *testing.T) {
	subs := Cmd.Commands()
	if len(subs) == 0 {
		t.Error("Frontend Cmd should have subcommands registered")
	}
}

func TestCmdHelpOutput(t *testing.T) {
	Cmd.SetOut(nil)
	Cmd.SetErr(nil)
	Cmd.SetArgs([]string{"--help"})
	err := Cmd.Execute()
	// Help flag exits with nil error in most cobra versions
	if err != nil {
		t.Errorf("Help command failed: %v", err)
	}
}

func TestFrontendCommands_PreRunE(t *testing.T) {
	tests := []struct {
		name        string
		cmd         *cobra.Command
		wantFeature string
	}{
		{
			name:        "InstallCmd",
			cmd:         InstallCmd,
			wantFeature: "Frontend Package Install",
		},
		{
			name:        "VulnCmd",
			cmd:         VulnCmd,
			wantFeature: "Frontend Vulnerability Scan",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name+" offline", func(t *testing.T) {
			errOffline := errors.New("network unreachable")
			netgate.ResetCache()
			netgate.SetProber(&mockProber{err: errOffline})
			defer netgate.ResetCache()

			if tt.cmd.PreRunE == nil {
				t.Fatalf("expected %s.PreRunE to be set", tt.name)
			}

			err := tt.cmd.PreRunE(tt.cmd, []string{})
			if err == nil {
				t.Fatalf("expected PreRunE to return error when offline, got nil")
			}

			var netErr *netgate.NetworkRequiredError
			if !errors.As(err, &netErr) {
				t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
			}

			if netErr.Feature != tt.wantFeature {
				t.Errorf("expected Feature %q, got %q", tt.wantFeature, netErr.Feature)
			}
		})

		t.Run(tt.name+" online", func(t *testing.T) {
			netgate.ResetCache()
			netgate.SetProber(&mockProber{err: nil})
			defer netgate.ResetCache()

			if tt.cmd.PreRunE == nil {
				t.Fatalf("expected %s.PreRunE to be set", tt.name)
			}

			err := tt.cmd.PreRunE(tt.cmd, []string{})
			if err != nil {
				t.Fatalf("expected PreRunE to succeed when online, got %v", err)
			}
		})
	}
}

