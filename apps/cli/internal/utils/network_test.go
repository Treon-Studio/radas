package utils_test

import (
	"context"
	"errors"
	"testing"

	"github.com/raizora/radas/v4/internal/netgate"
	"github.com/raizora/radas/v4/internal/utils"
)

type mockProber struct {
	err error
}

func (m *mockProber) Probe(ctx context.Context) error {
	return m.err
}

func TestCheckNetwork(t *testing.T) {
	t.Run("online returns nil", func(t *testing.T) {
		netgate.ResetCache()
		netgate.SetProber(&mockProber{err: nil})
		defer netgate.ResetCache()

		err := utils.CheckNetwork()
		if err != nil {
			t.Fatalf("expected CheckNetwork to return nil when online, got %v", err)
		}
	})

	t.Run("offline returns NetworkRequiredError", func(t *testing.T) {
		errOffline := errors.New("network down")
		netgate.ResetCache()
		netgate.SetProber(&mockProber{err: errOffline})
		defer netgate.ResetCache()

		err := utils.CheckNetwork()
		if err == nil {
			t.Fatal("expected CheckNetwork to return error when offline, got nil")
		}

		var netErr *netgate.NetworkRequiredError
		if !errors.As(err, &netErr) {
			t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T (%v)", err, err)
		}

		if netErr.Feature != "Koneksi Jaringan" {
			t.Errorf("expected Feature 'Koneksi Jaringan', got %q", netErr.Feature)
		}
	})
}
