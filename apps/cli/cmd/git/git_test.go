package git

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

func TestGitCommands_PreRunE(t *testing.T) {
	tests := []struct {
		name        string
		cmd         *cobra.Command
		wantFeature string
	}{
		{
			name:        "PushCmd",
			cmd:         PushCmd,
			wantFeature: "Git Push",
		},
		{
			name:        "PullCmd",
			cmd:         PullCmd,
			wantFeature: "Git Pull",
		},
		{
			name:        "CloneCmd",
			cmd:         CloneCmd,
			wantFeature: "Git Clone",
		},
		{
			name:        "JustPushCmd",
			cmd:         JustPushCmd,
			wantFeature: "Git Just Push",
		},
		{
			name:        "DelBranchCmd",
			cmd:         DelBranchCmd,
			wantFeature: "Git Delete Remote Branch",
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
