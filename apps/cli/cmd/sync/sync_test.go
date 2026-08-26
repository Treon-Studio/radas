package sync

import (
	"context"
	"errors"
	"testing"

	"github.com/raizora/radas/v4/internal/netgate"
)

type mockProber struct {
	err error
}

func (m *mockProber) Probe(ctx context.Context) error {
	return m.err
}

func TestSyncRepoCmd_PreRunE(t *testing.T) {
	t.Run("offline returns NetworkRequiredError", func(t *testing.T) {
		errOffline := errors.New("network unreachable")
		netgate.ResetCache()
		netgate.SetProber(&mockProber{err: errOffline})
		defer netgate.ResetCache()

		if SyncRepoCmd.PreRunE == nil {
			t.Fatal("expected SyncRepoCmd.PreRunE to be set")
		}

		err := SyncRepoCmd.PreRunE(SyncRepoCmd, []string{})
		if err == nil {
			t.Fatal("expected PreRunE to return an error when offline, got nil")
		}

		var netErr *netgate.NetworkRequiredError
		if !errors.As(err, &netErr) {
			t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
		}

		if netErr.Feature != "Sync Repo" {
			t.Errorf("expected Feature 'Sync Repo', got %q", netErr.Feature)
		}
	})

	t.Run("online returns nil", func(t *testing.T) {
		netgate.ResetCache()
		netgate.SetProber(&mockProber{err: nil})
		defer netgate.ResetCache()

		if SyncRepoCmd.PreRunE == nil {
			t.Fatal("expected SyncRepoCmd.PreRunE to be set")
		}

		err := SyncRepoCmd.PreRunE(SyncRepoCmd, []string{})
		if err != nil {
			t.Fatalf("expected PreRunE to succeed when online, got %v", err)
		}
	})
}
