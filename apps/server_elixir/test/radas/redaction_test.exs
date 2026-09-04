defmodule Radas.RedactionTest do
  use ExUnit.Case, async: true

  # Ported verbatim from `apps/server/tests/test_sensitive_data_redaction.py`.
  # Every payload embeds MARKER inside a secret VALUE; after redaction the
  # marker must never appear in the serialized output.
  @marker "SECRETMARKER123"

  @pem """
  -----BEGIN RSA PRIVATE KEY-----
  MIIEpAIBAAKCAQEA#{@marker}
  -----END RSA PRIVATE KEY-----
  """

  @matrix [
    {"access_token", %{"access_token" => "AT-#{@marker}"}},
    {"refresh_token", %{"refresh_token" => "RT-#{@marker}"}},
    {"password", %{"password" => "hunter2-#{@marker}"}},
    {"secret", %{"secret" => "S-#{@marker}"}},
    {"api_key", %{"api_key" => "sk-live-#{@marker}"}},
    {"api key header form", %{"X-Api-Key" => "sk-live-#{@marker}"}},
    {"private_key pem", %{"private_key" => @pem}},
    {"inline pem in log text", "loaded key #{@pem} for stack"},
    {"authorization bearer value", %{"authorization" => "Bearer AT-#{@marker}"}},
    {"authorization header inline bearer", "Authorization: Bearer AT-#{@marker}"},
    {"authorization header inline basic", "authorization: Basic dXNlck1BUktFU#{@marker}jpwdw=="},
    {"env var nested", %{"env" => %{"DATABASE_PASSWORD" => "hunter2-#{@marker}"}}},
    {"env var short name", %{"env" => %{"DB_PASS" => "hunter2-#{@marker}"}}},
    {"env var inline export", "export DATABASE_PASSWORD=hunter2-#{@marker}"},
    {"provider_ref embedded credential",
     %{"provider_ref" => %{"container_id" => "abc123", "env" => %{"API_TOKEN" => "zz-#{@marker}"}}}},
    {"command line inline", "tofu apply --password=hunter2-#{@marker} -out x"},
    {"command argv list", ["tofu", "apply", "--password=hunter2-#{@marker}"]},
    {"log line", "log: login failed api_key=sk-live-#{@marker}"}
  ]

  defp assert_no_marker(value, note) do
    text = Jason.encode!(value)
    refute String.contains?(String.downcase(text), String.downcase(@marker)),
           "secret value leaked via #{note}: #{String.slice(text, 0, 400)}"
  end

  # One test per matrix entry (mirrors the pytest parametrization).
  for {label, payload} <- @matrix do
    test "redact_sensitive matrix: #{label}" do
      payload = unquote(Macro.escape(payload))
      out = Radas.Redaction.redact_sensitive(payload)
      assert_no_marker(out, "redact_sensitive(#{unquote(label)})")
    end
  end

  test "the same matrix through error_envelope" do
    for {label, payload} <- @matrix do
      body =
        Radas.Envelope.error(
          "BAD_REQUEST",
          "request failed for #{label}: #{Jason.encode!(payload)}",
          %{"payload" => payload},
          Radas.RequestID.generate()
        )

      assert_no_marker(body, "error_envelope(#{label})")
    end
  end

  describe "allowlists" do
    test "secret_ref is metadata, not a value: it must survive redaction" do
      payload = %{"secrets" => %{"cred" => %{"secret_ref" => "secret://proj/cred"}}}
      out = Radas.Redaction.redact_sensitive(payload)
      assert out["secrets"]["cred"] == %{"secret_ref" => "secret://proj/cred"}
    end

    test "ref: scheme secret_ref map survives" do
      out = Radas.Redaction.redact_sensitive(%{"cred" => %{"secret_ref" => "ref:proj/cred"}})
      assert out["cred"] == %{"secret_ref" => "ref:proj/cred"}
    end

    test "invalid secret_ref is treated as a plain map" do
      out = Radas.Redaction.redact_sensitive(%{"cred" => %{"secret_ref" => "not a ref!!"}})
      refute out["cred"] == %{"secret_ref" => "not a ref!!"}
      assert out["cred"]["secret_ref"] == "[REDACTED]" or out["cred"] == "[REDACTED]"
    end

    test "capability tokens survive" do
      out =
        Radas.Redaction.redact_sensitive(%{
          "confirmation_token" => "ct-123",
          "production_confirmation_token" => "pct-123",
          "impact_token" => "it-123"
        })

      assert out == %{
               "confirmation_token" => "ct-123",
               "production_confirmation_token" => "pct-123",
               "impact_token" => "it-123"
             }
    end

    test "plain token values are still redacted" do
      out = Radas.Redaction.redact_sensitive(%{"token" => "raw-secret-value"})
      assert out == %{"token" => "[REDACTED]"}
    end
  end

  describe "sensitive key matching" do
    test "matches dotted and suffixed forms" do
      assert Radas.Redaction.sensitive_key?("password")
      assert Radas.Redaction.sensitive_key?("DATABASE_PASSWORD")
      assert Radas.Redaction.sensitive_key?("X-Api-Key")
      # Python `^(?:.*[_\-.])?SENSITIVE(?:[_\-.].*)?$` also matches
      # `token_count` (suffix `_count`) — pin that behavior deliberately.
      assert Radas.Redaction.sensitive_key?("token_count")
      refute Radas.Redaction.sensitive_key?("username")
    end
  end

  describe "scalars" do
    test "numbers, booleans, nil pass through" do
      assert Radas.Redaction.redact_sensitive(42) == 42
      assert Radas.Redaction.redact_sensitive(true) == true
      assert Radas.Redaction.redact_sensitive(nil) == nil
      assert Radas.Redaction.redact_sensitive(1.5) == 1.5
    end

    test "nested lists are walked" do
      out = Radas.Redaction.redact_sensitive([%{"api_key" => "x"}, %{"name" => "ok"}])
      assert out == [%{"api_key" => "[REDACTED]"}, %{"name" => "ok"}]
    end
  end
end
