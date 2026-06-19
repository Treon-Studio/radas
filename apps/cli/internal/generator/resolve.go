// resolve.go — variable resolution: overrides take priority over defaults;
// validation patterns are checked on the final resolved value.
package generator

import (
	"fmt"
	"regexp"
)

func ResolveVariables(def *Definition, overrides map[string]string, nonInteractive bool) (map[string]string, error) {
	result := make(map[string]string, len(def.Variables))

	for _, v := range def.Variables {
		var val string

		if overrides != nil {
			if ov, ok := overrides[v.Name]; ok {
				val = ov
			}
		}

		if val == "" && !nonInteractive {
			// Interactive prompting deferred to CLI layer (Task C7)
			// For now, fall through to default or empty
		}

		if val == "" {
			val = v.Default
		}

		// Validate the final value against the pattern when present
		if v.Validate != "" && val != "" {
			re, err := regexp.Compile(v.Validate)
			if err != nil {
				return nil, fmt.Errorf("invalid regex %q for %s: %w", v.Validate, v.Name, err)
			}
			if !re.MatchString(val) {
				return nil, fmt.Errorf("%s: value %q does not match pattern %q", v.Name, val, v.Validate)
			}
		}

		result[v.Name] = val
	}

	return result, nil
}
