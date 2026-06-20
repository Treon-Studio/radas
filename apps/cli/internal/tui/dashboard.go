package tui

type Dashboard struct {
	projects  []string
	templates []string
}

func NewDashboard(projects, templates []string) *Dashboard {
	return &Dashboard{
		projects:  projects,
		templates: templates,
	}
}

func (d *Dashboard) View() string {
	if len(d.projects) == 0 {
		return "No workspace found.\nRun `radas workspace init` to create one.\n"
	}
	return "Loading workspace..."
}
