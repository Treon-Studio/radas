package ai

import (
	_ "embed"
	"encoding/json"
	"math"
	"regexp"
	"strings"
)

//go:embed intent_model.json
var embeddedIntentModel []byte

type IntentModel struct {
	Vocab     map[string]int       `json:"vocab"`
	IDF       []float64            `json:"idf"`
	Centroids map[string][]float64 `json:"centroids"`
}

type Classifier struct {
	model *IntentModel
}

func LoadClassifier() (*Classifier, error) {
	var model IntentModel
	if err := json.Unmarshal(embeddedIntentModel, &model); err != nil {
		return nil, err
	}
	return &Classifier{model: &model}, nil
}

// Tokenize roughly matches scikit-learn's default token pattern: (?u)\b\w\w+\b
var wordRegex = regexp.MustCompile(`\b\w\w+\b`)

func (c *Classifier) Predict(text string) (intent string, confidence float64) {
	if c.model == nil || len(c.model.Vocab) == 0 {
		return "", 0
	}

	text = strings.ToLower(text)
	words := wordRegex.FindAllString(text, -1)

	// Term frequency
	tf := make(map[int]float64)
	for _, w := range words {
		if idx, ok := c.model.Vocab[w]; ok {
			tf[idx]++
		}
	}

	// Calculate TF-IDF vector
	vector := make([]float64, len(c.model.IDF))
	normSq := 0.0
	for idx, count := range tf {
		val := count * c.model.IDF[idx]
		vector[idx] = val
		normSq += val * val
	}
	norm := math.Sqrt(normSq)

	// L2 normalization
	if norm > 0 {
		for i := range vector {
			vector[i] /= norm
		}
	}

	// Find best centroid using cosine similarity
	bestIntent := ""
	bestScore := -1.0

	for name, centroid := range c.model.Centroids {
		dot := 0.0
		centNormSq := 0.0
		for i := range vector {
			dot += vector[i] * centroid[i]
			centNormSq += centroid[i] * centroid[i]
		}
		centNorm := math.Sqrt(centNormSq)
		if centNorm == 0 {
			continue
		}

		score := dot / (1.0 * centNorm) // vector norm is 1.0 (or 0 if empty)
		if score > bestScore {
			bestScore = score
			bestIntent = name
		}
	}

	return bestIntent, bestScore
}
