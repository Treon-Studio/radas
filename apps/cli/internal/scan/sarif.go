package scan

import "encoding/json"

func sarifLevel(severity string) string {
	switch severity {
	case "error":
		return "error"
	case "warning":
		return "warning"
	default:
		return "note"
	}
}

type sarifReport struct {
	Version string     `json:"version"`
	Schema  string     `json:"$schema"`
	Runs    []sarifRun `json:"runs"`
}

type sarifRun struct {
	Tool    sarifTool     `json:"tool"`
	Results []sarifResult `json:"results,omitempty"`
}

type sarifTool struct {
	Driver sarifDriver `json:"driver"`
}

type sarifDriver struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Info    string `json:"informationUri,omitempty"`
}

type sarifResult struct {
	RuleID    string          `json:"ruleId"`
	Level     string          `json:"level"`
	Message   sarifMessage    `json:"message"`
	Locations []sarifLocation `json:"locations"`
}

type sarifMessage struct {
	Text string `json:"text"`
}

type sarifLocation struct {
	PhysicalLocation sarifPhys `json:"physicalLocation"`
}

type sarifPhys struct {
	ArtifactLocation sarifArtifact `json:"artifactLocation"`
	Region           sarifRegion   `json:"region"`
}

type sarifArtifact struct {
	URI string `json:"uri"`
}

type sarifRegion struct {
	StartLine   int    `json:"startLine"`
	SnippetText string `json:"snippet,omitempty"`
}

func ToSARIF(findings []Finding, toolVersion string) []byte {
	rep := sarifReport{
		Version: "2.1.0",
		Schema:  "https://json.schemastore.org/sarif-2.1.0.json",
		Runs: []sarifRun{{
			Tool: sarifTool{
				Driver: sarifDriver{
					Name:    "radas",
					Version: toolVersion,
					Info:    "https://github.com/raizora/radas",
				},
			},
		}},
	}
	for _, f := range findings {
		rep.Runs[0].Results = append(rep.Runs[0].Results, sarifResult{
			RuleID: f.Rule,
			Level:  sarifLevel(f.Severity),
			Message: sarifMessage{
				Text: "secret detected: " + f.Rule,
			},
			Locations: []sarifLocation{{
				PhysicalLocation: sarifPhys{
					ArtifactLocation: sarifArtifact{URI: f.File},
					Region:           sarifRegion{StartLine: f.Line, SnippetText: f.Secret},
				},
			}},
		})
	}
	out, _ := json.MarshalIndent(rep, "", "  ")
	return out
}
