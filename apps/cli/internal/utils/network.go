package utils

import (
	"fmt"
	"net"
	"time"
)

// CheckNetwork memastikan ada koneksi internet sebelum eksekusi command yang butuh jaringan
func CheckNetwork() error {
	spin := NewSpinner("📡 Bip bop! Nge-ping satelit buat ngecek kuota internet kamu...")
	spin.Start()
	defer spin.Stop()

	timeout := 3 * time.Second
	conn, err := net.DialTimeout("tcp", "github.com:443", timeout)
	if err != nil {
		return fmt.Errorf("🦖 Bip bop! Yaaaah, ga ada sinyal internet! Cek WiFi atau hotspot kamu dulu gih, ngab!")
	}
	conn.Close()
	return nil
}
