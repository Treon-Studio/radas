package backend

import (
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"github.com/spf13/cobra"
	"github.com/AlecAivazis/survey/v2"
)

// InitCmd is the command to initialize a backend project from a template
var repoFlag string

var InitCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize a new backend project from a template",
	Run: func(cmd *cobra.Command, args []string) {
		var repo string
		var projectName string

		if repoFlag != "" {
			repo = repoFlag
			projectName = getProjectNameFromRepo(repo)
		} else {
			templates := map[string]string{
				"Go Clean Architecture": "golang-standards/project-layout",
				"Express.js":           "expressjs/express",
				// Tambahkan template lain
			}
			var templateNames []string
			for k := range templates {
				templateNames = append(templateNames, k)
			}
			var selected string
			prompt := &survey.Select{
				Message: "Pilih template backend:",
				Options: templateNames,
			}
			err := survey.AskOne(prompt, &selected)
			if err != nil {
				fmt.Println("Prompt cancelled.")
				os.Exit(1)
			}
			repo = templates[selected]
			projectName = getProjectNameFromRepo(repo)
		}

		fmt.Printf("Cloning %s into %s...\n", repo, projectName)
		c := exec.Command("degit", repo, projectName)
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr
		if err := c.Run(); err != nil {
			fmt.Printf("Failed to fetch template: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Project '%s' created successfully!\n", projectName)
	},
}

func init() {
	InitCmd.Flags().StringVarP(&repoFlag, "repo", "r", "", "Repository URL or shortcut (e.g. gitlab:user/repo, https://gitlab.com/user/repo)")
}

func getProjectNameFromRepo(repo string) string {
	re := regexp.MustCompile(`[/:]([\w.-]+)(?:\.git)?$`)
	matches := re.FindStringSubmatch(repo)
	if len(matches) > 1 {
		return matches[1]
	}
	return "project"
}

func mapTemplateToRepo(template, team string) string {
	beTemplates := map[string]string{
		"go-clean": "golang-standards/project-layout",
		"express":  "expressjs/express",
		// Tambahkan mapping sesuai kebutuhan
	}
	if team == "be" {
		if repo, ok := beTemplates[template]; ok {
			return repo
		}
	}
	return ""
}
