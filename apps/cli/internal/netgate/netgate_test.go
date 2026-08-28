package netgate_test

import (
	"context"
	"errors"
	"net"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/netgate"
)

type mockProber struct {
	probeFunc func(ctx context.Context) error
	calls     int32
}

func (m *mockProber) Probe(ctx context.Context) error {
	atomic.AddInt32(&m.calls, 1)
	if m.probeFunc != nil {
		return m.probeFunc(ctx)
	}
	return nil
}

func (m *mockProber) CallCount() int {
	return int(atomic.LoadInt32(&m.calls))
}

func TestIsConnected(t *testing.T) {
	t.Run("online when prober succeeds", func(t *testing.T) {
		netgate.ResetCache()
		mock := &mockProber{
			probeFunc: func(ctx context.Context) error {
				return nil
			},
		}
		netgate.SetProber(mock)

		connected := netgate.IsConnected(context.Background())
		if !connected {
			t.Errorf("expected IsConnected to be true, got false")
		}
		if mock.CallCount() != 1 {
			t.Errorf("expected prober to be called 1 time, got %d", mock.CallCount())
		}
	})

	t.Run("offline when prober fails", func(t *testing.T) {
		netgate.ResetCache()
		mock := &mockProber{
			probeFunc: func(ctx context.Context) error {
				return errors.New("network unreachable")
			},
		}
		netgate.SetProber(mock)

		connected := netgate.IsConnected(context.Background())
		if connected {
			t.Errorf("expected IsConnected to be false, got true")
		}
	})

	t.Run("offline on context timeout", func(t *testing.T) {
		netgate.ResetCache()
		mock := &mockProber{
			probeFunc: func(ctx context.Context) error {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(100 * time.Millisecond):
					return nil
				}
			},
		}
		netgate.SetProber(mock)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
		defer cancel()

		connected := netgate.IsConnected(ctx)
		if connected {
			t.Errorf("expected IsConnected to be false on timeout, got true")
		}
	})
}

func TestCacheMemoization(t *testing.T) {
	netgate.ResetCache()
	mock := &mockProber{
		probeFunc: func(ctx context.Context) error {
			return nil
		},
	}
	netgate.SetProber(mock)

	// Call IsConnected multiple times
	for i := 0; i < 5; i++ {
		connected := netgate.IsConnected(context.Background())
		if !connected {
			t.Errorf("call %d: expected IsConnected to be true", i)
		}
	}

	if mock.CallCount() != 1 {
		t.Fatalf("expected prober to be called exactly 1 time due to cache, got %d", mock.CallCount())
	}

	// Reset cache and call again
	netgate.ResetCache()
	connected := netgate.IsConnected(context.Background())
	if !connected {
		t.Errorf("expected IsConnected to be true after reset cache")
	}
	if mock.CallCount() != 2 {
		t.Fatalf("expected prober to be called 2 times after cache reset, got %d", mock.CallCount())
	}
}

func TestEnsureConnected(t *testing.T) {
	t.Run("returns nil when online", func(t *testing.T) {
		netgate.ResetCache()
		netgate.SetProber(&mockProber{
			probeFunc: func(ctx context.Context) error { return nil },
		})

		err := netgate.EnsureConnected("Cloud Sync")
		if err != nil {
			t.Errorf("expected nil error when online, got %v", err)
		}
	})

	t.Run("returns NetworkRequiredError when offline", func(t *testing.T) {
		netgate.ResetCache()
		netgate.SetProber(&mockProber{
			probeFunc: func(ctx context.Context) error { return errors.New("no route to host") },
		})

		err := netgate.EnsureConnected("Cloud Sync")
		if err == nil {
			t.Fatal("expected error when offline, got nil")
		}

		var netErr *netgate.NetworkRequiredError
		if !errors.As(err, &netErr) {
			t.Fatalf("expected error to be *NetworkRequiredError, got %T", err)
		}
		if netErr.Feature != "Cloud Sync" {
			t.Errorf("expected feature to be 'Cloud Sync', got %q", netErr.Feature)
		}
	})
}

func TestRequireNetwork(t *testing.T) {
	cmd := &cobra.Command{
		Use: "test",
	}

	t.Run("preRun succeeds when online", func(t *testing.T) {
		netgate.ResetCache()
		netgate.SetProber(&mockProber{
			probeFunc: func(ctx context.Context) error { return nil },
		})

		preRun := netgate.RequireNetwork("Deploy Stack")
		err := preRun(cmd, []string{})
		if err != nil {
			t.Errorf("expected preRun to succeed when online, got %v", err)
		}
	})

	t.Run("preRun fails when offline", func(t *testing.T) {
		netgate.ResetCache()
		netgate.SetProber(&mockProber{
			probeFunc: func(ctx context.Context) error { return errors.New("offline") },
		})

		preRun := netgate.RequireNetwork("Deploy Stack")
		err := preRun(cmd, []string{})
		if err == nil {
			t.Fatal("expected preRun to fail when offline, got nil")
		}

		var netErr *netgate.NetworkRequiredError
		if !errors.As(err, &netErr) {
			t.Fatalf("expected error to be *netgate.NetworkRequiredError, got %T", err)
		}
		if netErr.Feature != "Deploy Stack" {
			t.Errorf("expected feature to be 'Deploy Stack', got %q", netErr.Feature)
		}
	})
}

func TestIsNetworkError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "nil error",
			err:      nil,
			expected: false,
		},
		{
			name:     "generic business logic error",
			err:      errors.New("invalid user input"),
			expected: false,
		},
		{
			name:     "net.OpError dial tcp",
			err:      &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connection refused")},
			expected: true,
		},
		{
			name:     "net.DNSError no such host",
			err:      &net.DNSError{Err: "no such host", Name: "api.radas.dev"},
			expected: true,
		},
		{
			name:     "context.DeadlineExceeded",
			err:      context.DeadlineExceeded,
			expected: true,
		},
		{
			name: "url.Error wrapping OpError",
			err: &url.Error{
				Op:  "Get",
				URL: "https://api.github.com",
				Err: &net.OpError{Op: "read", Net: "tcp", Err: errors.New("connection reset by peer")},
			},
			expected: true,
		},
		{
			name:     "NetworkRequiredError instance",
			err:      &netgate.NetworkRequiredError{Feature: "AI Chat"},
			expected: true,
		},
		{
			name:     "string matching connection refused",
			err:      errors.New("dial tcp 127.0.0.1:8080: connect: connection refused"),
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := netgate.IsNetworkError(tt.err)
			if got != tt.expected {
				t.Errorf("IsNetworkError(%v) = %v, expected %v", tt.err, got, tt.expected)
			}
		})
	}
}

func TestWrapError(t *testing.T) {
	t.Run("nil error returns nil", func(t *testing.T) {
		got := netgate.WrapError("Test Feature", nil)
		if got != nil {
			t.Errorf("expected nil, got %v", got)
		}
	})

	t.Run("non-network error returns original error", func(t *testing.T) {
		origErr := errors.New("validation failed: missing name")
		got := netgate.WrapError("Test Feature", origErr)
		if got != origErr {
			t.Errorf("expected original error %v, got %v", origErr, got)
		}
	})

	t.Run("network error wraps into NetworkRequiredError", func(t *testing.T) {
		rawNetErr := &net.DNSError{Err: "no such host", Name: "api.example.com"}
		got := netgate.WrapError("Update CLI", rawNetErr)
		if got == nil {
			t.Fatal("expected wrapped error, got nil")
		}

		var netErr *netgate.NetworkRequiredError
		if !errors.As(got, &netErr) {
			t.Fatalf("expected error to be *NetworkRequiredError, got %T", got)
		}
		if netErr.Feature != "Update CLI" {
			t.Errorf("expected feature to be 'Update CLI', got %q", netErr.Feature)
		}
		if !errors.Is(got, rawNetErr) && netErr.Cause != rawNetErr {
			t.Errorf("expected cause to be rawNetErr, got %v", netErr.Cause)
		}
	})
}

func TestFormatNetworkErrorAndErrorString(t *testing.T) {
	feature := "AI Assistant"
	formatted := netgate.FormatNetworkError(feature)

	expectedLines := []string{
		"[✗] Koneksi Internet Diperlukan",
		"    Fitur   : AI Assistant",
		"    Detail  : Perintah ini memerlukan koneksi internet aktif untuk berkomunikasi dengan layanan luar.",
		"    Saran   : Periksa koneksi Wi-Fi / jaringan internet Anda, lalu coba jalankan kembali perintah ini.",
	}

	for _, line := range expectedLines {
		if !strings.Contains(formatted, line) {
			t.Errorf("FormatNetworkError output missing line: %q\nFull output:\n%s", line, formatted)
		}
	}

	netErr := &netgate.NetworkRequiredError{
		Feature: feature,
		Cause:   errors.New("dial tcp timeout"),
	}

	if netErr.Error() != formatted {
		t.Errorf("NetworkRequiredError.Error() does not match FormatNetworkError\nGot:\n%s\nExpected:\n%s", netErr.Error(), formatted)
	}

	if netErr.Unwrap() == nil || netErr.Unwrap().Error() != "dial tcp timeout" {
		t.Errorf("NetworkRequiredError.Unwrap() failed, got %v", netErr.Unwrap())
	}
}
