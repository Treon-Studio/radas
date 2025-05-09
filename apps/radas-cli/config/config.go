package config

import (
	"encoding/json"
	"fmt"
	"os"
)

func LoadJSONConfig(filename string, config interface{}) error {
	file, err := os.Open(filename)
	if err != nil {
		return fmt.Errorf("failed to open config file: %w", err)
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(config); err != nil {
		return fmt.Errorf("failed to decode JSON: %w", err)
	}

	return nil
}
