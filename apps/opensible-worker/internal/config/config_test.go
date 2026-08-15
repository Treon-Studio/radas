package config

import "testing"

func setProductionEnvironment(t *testing.T, secret string) {
	t.Helper()
	t.Setenv("FLASK_ENV", "production")
	t.Setenv("DATABASE_URL", "postgresql://db.example.invalid/radas")
	for _, name := range []string{
		"JWT_SECRET_KEY",
		"INTERNAL_CALL_SECRET",
		"GLOBAL_SECRETS_ENCRYPTION_KEY",
		"WORKER_REGISTRATION_SECRET",
		"VAULT_SERVER_SECRET",
	} {
		t.Setenv(name, secret)
	}
}

func TestValidateProductionSecretsUsesASCIIBoundaries(t *testing.T) {
	tests := []struct {
		name   string
		secret string
		valid  bool
	}{
		{"ascii letter and digit", "Abcdefghijklmnop1234567890123456", true},
		{"unicode digit only", "Abcdefghijklmnop١١١١١١١١١١١١١١١١", false},
		{"unicode letter and ascii digit", "ébcdefghijklmnop1234567890123456", true},
		{"unicode letter and digit only", "éééééééééééééééé١١١١١١١١١١١١١١١١", false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setProductionEnvironment(t, test.secret)
			err := ValidateProductionSecrets()
			if test.valid && err != nil {
				t.Fatalf("expected valid secret policy, got %v", err)
			}
			if !test.valid && err == nil {
				t.Fatal("expected secret policy rejection")
			}
		})
	}
}
