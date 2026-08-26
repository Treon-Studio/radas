package utils

import (
	"github.com/raizora/radas/v4/internal/netgate"
)

// CheckNetwork memastikan ada koneksi internet sebelum eksekusi command yang butuh jaringan
func CheckNetwork() error {
	return netgate.EnsureConnected("Koneksi Jaringan")
}
