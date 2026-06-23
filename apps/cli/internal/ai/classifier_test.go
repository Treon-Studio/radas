package ai

import (
	"testing"
)

func TestClassifier(t *testing.T) {
	c, err := LoadClassifier()
	if err != nil {
		t.Fatalf("Failed to load embedded model: %v", err)
	}

	tests := []struct {
		input  string
		expect string
	}{
		{"tolong bukakan activity monitor sekarang", "activity_monitor"},
		{"baca berita", "baca_berita"},
		{"tolong cek memori komputer dong", "cek_memory"},
		{"bro bisa bantu cek sisa ram hari ini", "cek_memory"},
		{"tampilkan kabar terbaru ya", "baca_berita"},
		{"halo radas tolong pantau cuaca hari ini dong", "cek_cuaca"},
		{"gimana prakiraan cuaca sekarang", "cek_cuaca"},
	}

	for _, tc := range tests {
		intent, score := c.Predict(tc.input)
		if intent != tc.expect {
			t.Errorf("For %q, expected %s, got %s (score: %f)", tc.input, tc.expect, intent, score)
		} else {
			t.Logf("Success: %q -> %s (%.2f)", tc.input, intent, score)
		}
	}
}
