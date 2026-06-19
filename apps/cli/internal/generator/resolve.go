package generator

import (
	"fmt"
	"regexp"
)

func ResolveVariables(def *Definition, overrides map[string]string, nonInteractive bool) (map[string]string, error) {
	if overrides == nil {
		overrides = make(map[string]string)
	}

	result := make(map[string]string, len(def.Variables))

	for _, v := range def.Variables {
		if val, ok := overrides[v.Name]; ok {
			result[v.Name] = val
			continue
		}

		if nonInteractive {
			result[v.Name] = v.Default
			continue
		}

		val, err := promptVariable(v)
		if err != nil {
			return nil, fmt.Errorf("prompt %s: %w", v.Name, err)
		}
		result[v.Name] = val
	}

	return result, nil
}

func promptVariable(v Variable) (string, error) {
	msg := v.Prompt
	if msg == "" {
		msg = "Enter " + v.Name
	}
	if v.Default != "" {
		msg += " [" + v.Default + "]"
	}

	if v.Validate != "" {
		re, err := regexp.Compile(v.Validate)
		if err != nil {
			return "", fmt.Errorf("invalid regex %q: %w", v.Validate, err)
		}
		if !re.MatchString(v.Default) {
			return "", fmt.Errorf("%s: default %q does not match validation %q", v.Name, v.Default, v.Validate)
		}
	}

	return v.Default, nil
}
