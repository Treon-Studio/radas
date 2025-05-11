package rootcmd

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sort"
	"time"

	"github.com/spf13/cobra"
	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/jedib0t/go-pretty/v6/text"
)

var nFlag int

var ListBranchCmd = &cobra.Command{
	Use:   "list-branch",
	Short: "List all local branches with last commit time, tabular format. Use -n to limit.",
	Run: func(cmd *cobra.Command, args []string) {
		// 1. List all local branches, mark current
		var branchOut bytes.Buffer
		gitBranchCmd := exec.Command("git", "branch")
		gitBranchCmd.Stdout = &branchOut
		gitBranchCmd.Stderr = os.Stderr
		if err := gitBranchCmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to list branches: %v\n", err)
			os.Exit(1)
		}
		branches := []string{}
		current := ""
		for _, line := range strings.Split(branchOut.String(), "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if strings.HasPrefix(line, "*") {
				current = strings.TrimSpace(line[1:])
				branches = append(branches, current)
			} else {
				branches = append(branches, line)
			}
		}

		type branchInfo struct {
			Name      string
			LastUsed  string
			Current   bool
			Origin    string
		}
		var infos []branchInfo
		for _, branch := range branches {
			var logOut bytes.Buffer
			logCmd := exec.Command("git", "log", "-1", "--format=%ci", branch)
			logCmd.Stdout = &logOut
			logCmd.Stderr = os.Stderr
			if err := logCmd.Run(); err != nil {
				infos = append(infos, branchInfo{Name: branch, LastUsed: "(error)", Current: branch == current, Origin: "-"})
				continue
			}
			lastUsed := strings.TrimSpace(logOut.String())

			// Check if origin/<branch> exists
			originName := "-"
			var showRefOut bytes.Buffer
			showRefCmd := exec.Command("git", "show-ref", "--verify", "refs/remotes/origin/"+branch)
			showRefCmd.Stdout = &showRefOut
			showRefCmd.Stderr = nil
			if err := showRefCmd.Run(); err == nil {
				originName = "origin/" + branch
			}
			infos = append(infos, branchInfo{Name: branch, LastUsed: lastUsed, Current: branch == current, Origin: originName})
		}

		// Sort by lastUsed desc (most recent first)
		// Parse time, fallback to zero time for errors
		importedTime := func(s string) time.Time {
			t, err := time.Parse("2006-01-02 15:04:05 -0700", s)
			if err != nil {
				return time.Time{}
			}
			return t
		}
		// sort.SliceStable keeps current branch at the top if same date
		sort.SliceStable(infos, func(i, j int) bool {
			return importedTime(infos[i].LastUsed).After(importedTime(infos[j].LastUsed))
		})

		if nFlag > 0 && nFlag < len(infos) {
			infos = infos[:nFlag]
		}

		t := table.NewWriter()
		t.SetOutputMirror(os.Stdout)
		t.SetStyle(table.StyleLight)
		t.AppendHeader(table.Row{
			text.FgHiCyan.Sprint("Cur"),
			text.FgHiCyan.Sprint("Branch"),
			text.FgHiCyan.Sprint("Last Used"),
			text.FgHiCyan.Sprint("Origin"),
		})
		for _, info := range infos {
			currentMark := ""
			rowStyle := table.RowConfig{}
			if info.Current {
				currentMark = text.FgHiGreen.Sprint("*")
				rowStyle.AutoMerge = true
			}
			displayTime := info.LastUsed
			if t, err := time.Parse("2006-01-02 15:04:05 -0700", info.LastUsed); err == nil {
				displayTime = t.Format("2006-01-02 15:04")
			}
			row := table.Row{currentMark, info.Name, displayTime, info.Origin}
			if info.Current {
				for i := range row {
					row[i] = text.FgHiGreen.Sprint(row[i])
				}
			}
			t.AppendRow(row, rowStyle)
		}
		t.Render()

	},
}

func init() {
	ListBranchCmd.Flags().IntVarP(&nFlag, "number", "n", 0, "Number of branches to show (most recently used)")
	// Register in your root command
}
