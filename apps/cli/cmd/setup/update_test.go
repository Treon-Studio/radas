package setup

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

func TestUpdateCmd_PreRunE(t *testing.T) {
	t.Run("offline returns NetworkRequiredError", func(t *testing.T) {
		errOffline := errors.New("network unreachable")
		netgate.ResetCache()
		netgate.SetProber(&mockProber{err: errOffline})
		defer netgate.ResetCache()

		if UpdateCmd.PreRunE == nil {
			t.Fatal("expected UpdateCmd.PreRunE to be set")
		}

		err := UpdateCmd.PreRunE(UpdateCmd, []string{})
		if err == nil {
			t.Fatal("expected PreRunE to return an error when offline, got nil")
		}

		var netErr *netgate.NetworkRequiredError
		if !errors.As(err, &netErr) {
			t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
		}

		if netErr.Feature != "Pembaruan RADAS CLI" {
			t.Errorf("expected Feature 'Pembaruan RADAS CLI', got %q", netErr.Feature)
		}
	})

	t.Run("online returns nil", func(t *testing.T) {
		netgate.ResetCache()
		netgate.SetProber(&mockProber{err: nil})
		defer netgate.ResetCache()

		if UpdateCmd.PreRunE == nil {
			t.Fatal("expected UpdateCmd.PreRunE to be set")
		}

		err := UpdateCmd.PreRunE(UpdateCmd, []string{})
		if err != nil {
			t.Fatalf("expected PreRunE to succeed when online, got %v", err)
		}
	})
}

func TestUpdateCmd_Structure(t *testing.T) {
	if UpdateCmd.Use != "update" {
		t.Errorf("expected Use 'update', got %q", UpdateCmd.Use)
	}
	if UpdateCmd.Short == "" {
		t.Error("expected Short description to be set")
	}
	flag := UpdateCmd.Flags().Lookup("build-from-source")
	if flag == nil {
		t.Error("expected --build-from-source flag to be registered")
	}
}
