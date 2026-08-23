package system

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GenerateStorageInsights scans the user home directory and returns actionable space savings.
func GenerateStorageInsights(homeDir string) []StorageInsight {
	var insights []StorageInsight

	// 1. Check for stale installers in Downloads older than 14 days
	downloadsDir := filepath.Join(homeDir, "Downloads")
	if entries, err := os.ReadDir(downloadsDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			name := strings.ToLower(entry.Name())
			if strings.HasSuffix(name, ".dmg") || strings.HasSuffix(name, ".pkg") || strings.HasSuffix(name, ".iso") || strings.HasSuffix(name, ".zip") {
				fullPath := filepath.Join(downloadsDir, entry.Name())
				if info, err := entry.Info(); err == nil {
					if info.Size() > 50*1024*1024 && time.Since(info.ModTime()) > 14*24*time.Hour {
						insights = append(insights, StorageInsight{
							Type:        "installer",
							Path:        fullPath,
							SizeBytes:   info.Size(),
							HumanSize:   FormatBytes(info.Size()),
							Description: "Stale installer archive downloaded over 14 days ago",
						})
					}
				}
			}
		}
	}

	// 2. Check for large node_modules directories in common project paths
	codeDirs := []string{
		filepath.Join(homeDir, "Projects"),
		filepath.Join(homeDir, "Documents/go"),
		filepath.Join(homeDir, "Developer"),
	}

	for _, cDir := range codeDirs {
		_ = filepath.Walk(cDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return filepath.SkipDir
			}
			if info.IsDir() && info.Name() == "node_modules" {
				sz, _ := CalculateDirSize(path)
				if sz > 200*1024*1024 {
					insights = append(insights, StorageInsight{
						Type:        "node_modules",
						Path:        path,
						SizeBytes:   sz,
						HumanSize:   FormatBytes(sz),
						Description: "Heavy node_modules directory (> 200MB)",
					})
				}
				return filepath.SkipDir
			}
			return nil
		})
	}

	return insights
}
