package netgate

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/spf13/cobra"
)

// Prober defines an interface for probing network connectivity.
type Prober interface {
	Probe(ctx context.Context) error
}

type defaultProber struct {
	timeout time.Duration
}

func (d *defaultProber) Probe(ctx context.Context) error {
	timeout := d.timeout
	if timeout <= 0 {
		timeout = 750 * time.Millisecond
	}

	probeCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Targets for fast DNS ping (TCP port 53)
	targets := []string{"1.1.1.1:53", "8.8.8.8:53", "1.0.0.1:53", "8.8.4.4:53"}
	var dialer net.Dialer
	var lastErr error

	for _, target := range targets {
		conn, err := dialer.DialContext(probeCtx, "tcp", target)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		lastErr = err
	}

	// Fallback: HTTP 204 / captive portal endpoints if DNS port 53 was blocked
	req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, "http://clients3.google.com/generate_204", nil)
	if err == nil {
		client := &http.Client{
			Timeout: timeout,
		}
		resp, err := client.Do(req)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusNoContent || (resp.StatusCode >= 200 && resp.StatusCode < 400) {
				return nil
			}
		} else {
			lastErr = err
		}
	}

	if lastErr != nil {
		return lastErr
	}
	return errors.New("network probe failed: no connectivity")
}

var (
	mu           sync.RWMutex
	activeProber Prober = &defaultProber{timeout: 750 * time.Millisecond}
	hasCached    bool
	cachedResult bool
)

// SetProber configures a custom prober implementation (e.g. for testing).
func SetProber(p Prober) {
	mu.Lock()
	defer mu.Unlock()
	activeProber = p
}

// ResetCache clears the memoized network status.
func ResetCache() {
	mu.Lock()
	defer mu.Unlock()
	hasCached = false
	cachedResult = false
}

// IsConnected checks whether internet connection is active with thread-safe memoization.
func IsConnected(ctx context.Context) bool {
	mu.RLock()
	if hasCached {
		res := cachedResult
		mu.RUnlock()
		return res
	}
	mu.RUnlock()

	mu.Lock()
	defer mu.Unlock()
	if hasCached {
		return cachedResult
	}

	if ctx == nil {
		ctx = context.Background()
	}

	p := activeProber
	if p == nil {
		p = &defaultProber{timeout: 750 * time.Millisecond}
	}

	err := p.Probe(ctx)
	cachedResult = (err == nil)
	hasCached = true
	return cachedResult
}

// EnsureConnected checks if the network is reachable and returns NetworkRequiredError if offline.
func EnsureConnected(featureName string) error {
	if !IsConnected(context.Background()) {
		return &NetworkRequiredError{
			Feature: featureName,
		}
	}
	return nil
}

// RequireNetwork returns a Cobra PreRunE hook that validates network connectivity.
func RequireNetwork(featureName string) func(cmd *cobra.Command, args []string) error {
	return func(cmd *cobra.Command, args []string) error {
		return EnsureConnected(featureName)
	}
}

// NetworkRequiredError represents a failure caused by missing network connectivity.
type NetworkRequiredError struct {
	Feature string
	Cause   error
}

func (e *NetworkRequiredError) Error() string {
	return FormatNetworkError(e.Feature)
}

func (e *NetworkRequiredError) Unwrap() error {
	return e.Cause
}

// FormatNetworkError generates a standardized error display message for offline errors.
func FormatNetworkError(feature string) string {
	if feature == "" {
		feature = "Operasi ini"
	}
	return fmt.Sprintf("[✗] Koneksi Internet Diperlukan\n    Fitur   : %s\n    Detail  : Perintah ini memerlukan koneksi internet aktif untuk berkomunikasi dengan layanan luar.\n    Saran   : Periksa koneksi Wi-Fi / jaringan internet Anda, lalu coba jalankan kembali perintah ini.", feature)
}

// IsNetworkError determines if an error is network-related.
func IsNetworkError(err error) bool {
	if err == nil {
		return false
	}

	var netReqErr *NetworkRequiredError
	if errors.As(err, &netReqErr) {
		return true
	}

	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		if IsNetworkError(urlErr.Err) {
			return true
		}
	}

	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return true
	}

	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return true
	}

	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}

	var sysErr syscall.Errno
	if errors.As(err, &sysErr) {
		switch sysErr {
		case syscall.ECONNREFUSED, syscall.ECONNRESET, syscall.ETIMEDOUT,
			syscall.ENETUNREACH, syscall.EHOSTUNREACH, syscall.ENETDOWN:
			return true
		}
	}

	msg := strings.ToLower(err.Error())
	keywords := []string{
		"no such host",
		"connection refused",
		"network is unreachable",
		"network unreachable",
		"i/o timeout",
		"context deadline exceeded",
		"dial tcp",
		"dial udp",
		"network down",
		"host is down",
		"connection reset by peer",
	}
	for _, kw := range keywords {
		if strings.Contains(msg, kw) {
			return true
		}
	}

	return false
}

// WrapError wraps a network-related error into NetworkRequiredError or returns original error.
func WrapError(featureName string, err error) error {
	if err == nil {
		return nil
	}

	if !IsNetworkError(err) {
		return err
	}

	var netReqErr *NetworkRequiredError
	if errors.As(err, &netReqErr) {
		if featureName != "" && netReqErr.Feature != featureName {
			return &NetworkRequiredError{
				Feature: featureName,
				Cause:   netReqErr.Cause,
			}
		}
		return netReqErr
	}

	return &NetworkRequiredError{
		Feature: featureName,
		Cause:   err,
	}
}
