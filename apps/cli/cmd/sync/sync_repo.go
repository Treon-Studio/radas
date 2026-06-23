package sync

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/utils"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

type SyncConfig struct {
	Sync struct {
		Repo []map[string]string `yaml:"repo"`
	} `yaml:"sync"`
}


var dryRun bool

var SyncRepoCmd = &cobra.Command{
	Use:   "sync-repo",
	Short: "Sync folders/files based on radas.yml config",
	Run: func(cmd *cobra.Command, args []string) {
		cfg := SyncConfig{}
		if err := loadRadasConfig(&cfg); err != nil {
			fmt.Println(err)
			os.Exit(1)
		}
		if len(cfg.Sync.Repo) == 0 {
			fmt.Println("No sync.repo config found in radas.yml")
			os.Exit(1)
		}
		for _, mapping := range cfg.Sync.Repo {
			for dst, src := range mapping {
				playground := os.Getenv("RADAS_PLAYGROUND")
				// Find radas.yml location to resolve dst relative to project root
				configPath, _ := config.FindConfig()
				projectRoot := filepath.Dir(configPath)
				resolveSrc := func(path string) string {
					if strings.HasPrefix(path, "/") || strings.HasPrefix(path, "./") || strings.HasPrefix(path, "../") {
						return path
					}
					return filepath.Join(playground, path)
				}
				resolveDst := func(path string) string {
					if strings.HasPrefix(path, "/") || strings.HasPrefix(path, "./") || strings.HasPrefix(path, "../") {
						return path
					}
					return filepath.Join(projectRoot, path)
				}
				srcAbs, _ := filepath.Abs(resolveSrc(src))
				dstAbs, _ := filepath.Abs(resolveDst(dst))
				fmt.Printf("Checking: %s -> %s\n", srcAbs, dstAbs)
				s := utils.NewSpinner("🔎 Bip bop! Menajamkan mata elang buat nyari file yang beda...")
				s.Start()
				diff, err := diffDirs(srcAbs, dstAbs)
				s.Stop()
				if err != nil {
					fmt.Println("Error comparing:", err)
					continue
				}
				if len(diff) == 0 {
					fmt.Println("🤷 Bip bop! Sama aja ah, ga ada yang beda. Mager nyalin jadinya.")
					continue
				}
				fmt.Printf("Bip bop! Ada %d file/folder yang minta di-update nih:\n", len(diff))
				for _, f := range diff {
					fmt.Println("  ", f)
				}
				if dryRun {
					fmt.Println("[Dry Run] Tenang, ini cuma simulasi. Belum dicopy kok.")
					continue
				}
				fmt.Print("Bip bop! Mau ditabrak (overwrite) file-file ini? [y/N]: ")
				var resp string
				fmt.Scanln(&resp)
				if !strings.HasPrefix(strings.ToLower(resp), "y") {
					fmt.Println("Sip, di-skip ya ngab.")
					continue
				}
				syncSpin := utils.NewSpinner("🚚 Bip bop! Angkut-angkut file ke tempat tujuan, awas nyangkut...")
				syncSpin.Start()
				err = copyDir(srcAbs, dstAbs)
				syncSpin.Stop()
				if err != nil {
					fmt.Println("Sync error:", err)
				} else {
					fmt.Println("Sync complete.")
				}
			}
		}
	},
}

func init() {
	SyncRepoCmd.Flags().BoolVar(&dryRun, "dry-run", false, "Show what would be synced, but do not copy any files.")
}

// diffDirs returns a list of files/dirs in src that are different or missing in dst
func diffDirs(src, dst string) ([]string, error) {
	var diff []string
	_ = filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil { return err }
		rel, _ := filepath.Rel(src, path)
		if rel == "." { return nil }
		dstPath := filepath.Join(dst, rel)
		if info.IsDir() {
			if _, err := os.Stat(dstPath); os.IsNotExist(err) {
				diff = append(diff, rel+"/")
			}
		} else {
			if dstInfo, err := os.Stat(dstPath); os.IsNotExist(err) || dstInfo.Size() != info.Size() {
				diff = append(diff, rel)
			}
		}
		return nil
	})
	return diff, nil
}

// copyDir recursively copies src to dst, overwriting existing files
func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil { return err }
		rel, _ := filepath.Rel(src, path)
		dstPath := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(dstPath, info.Mode())
		}
		// Only copy regular files, skip symlinks, sockets, etc.
		if !info.Mode().IsRegular() {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
			return err
		}
		srcF, err := os.Open(path)
		if err != nil { return err }
		defer srcF.Close()
		dstF, err := os.Create(dstPath)
		if err != nil { return err }
		defer dstF.Close()
		if _, err := io.Copy(dstF, srcF); err != nil {
			return err
		}
		return dstF.Chmod(info.Mode())
	})
}

func loadRadasConfig(out interface{}) error {
	configPath, err := config.FindConfig()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("could not read %s: %w", configPath, err)
	}
	if err := yaml.Unmarshal(data, out); err != nil {
		return fmt.Errorf("could not parse %s: %w", configPath, err)
	}
	return nil
}
