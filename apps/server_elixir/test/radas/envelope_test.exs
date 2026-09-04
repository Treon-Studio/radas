defmodule Radas.EnvelopeTest do
  use ExUnit.Case, async: true

  describe "success_envelope" do
    test "wraps redacted data with request_id" do
      body = Radas.Envelope.success(%{"name" => "x", "api_key" => "raw"}, "req-1")
      assert body["data"] == %{"name" => "x", "api_key" => "[REDACTED]"}
      assert body["request_id"] == "req-1"
    end
  end

  describe "error_envelope" do
    test "builds code/message/details envelope" do
      body = Radas.Envelope.error("CONFLICT", "already exists", %{"retryable" => false}, "req-2")

      assert body["error"] == %{
               "code" => "CONFLICT",
               "message" => "already exists",
               "details" => %{"retryable" => false}
             }

      assert body["request_id"] == "req-2"
    end

    test "nil details become empty map" do
      body = Radas.Envelope.error("BAD_REQUEST", "nope", nil, "req-3")
      assert body["error"]["details"] == %{}
    end

    test "message and details are redacted" do
      body = Radas.Envelope.error("BAD_REQUEST", "failed: token=abc", %{"password" => "x"}, "req-4")
      assert body["error"]["message"] == "failed: token=[REDACTED]"
      assert body["error"]["details"] == %{"password" => "[REDACTED]"}
    end
  end

  describe "operation_envelope" do
    test "builds operation + data.operation alias" do
      op = %{"id" => "op-1", "kind" => "service.deploy", "status" => "queued", "poll_url" => "/api/platform/operations/op-1"}

      body = Radas.Envelope.operation(op, "req-5")

      assert body["operation"] == op
      assert body["data"] == %{"operation" => op}
      assert body["request_id"] == "req-5"
    end

    test "missing required fields raise" do
      assert_raise ArgumentError, ~r/missing required fields: kind, poll_url/, fn ->
        Radas.Envelope.operation(%{"id" => "op-2", "status" => "queued"}, "req-6")
      end
    end
  end

  describe "error_code_for" do
    test "canonical mappings" do
      assert Radas.Envelope.error_code_for(400) == "BAD_REQUEST"
      assert Radas.Envelope.error_code_for(401) == "UNAUTHORIZED"
      assert Radas.Envelope.error_code_for(403) == "FORBIDDEN"
      assert Radas.Envelope.error_code_for(404) == "NOT_FOUND"
      assert Radas.Envelope.error_code_for(405) == "METHOD_NOT_ALLOWED"
      assert Radas.Envelope.error_code_for(409) == "CONFLICT"
      assert Radas.Envelope.error_code_for(422) == "VALIDATION_ERROR"
      assert Radas.Envelope.error_code_for(429) == "RATE_LIMITED"
      assert Radas.Envelope.error_code_for(500) == "INTERNAL_SERVER_ERROR"
    end

    test "unknown statuses fall back to HTTP_<status>" do
      assert Radas.Envelope.error_code_for(418) == "HTTP_418"
    end
  end

  describe "retryable" do
    test "only RATE_LIMITED is retryable" do
      assert Radas.Envelope.retryable?("RATE_LIMITED")
      refute Radas.Envelope.retryable?("CONFLICT")
      refute Radas.Envelope.retryable?("INTERNAL_SERVER_ERROR")
    end
  end

  describe "request id helpers" do
    test "generate returns UUID-shaped string" do
      assert Regex.match?(~r/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, Radas.RequestID.generate())
    end

    test "valid? enforces the wire format" do
      assert Radas.RequestID.valid?("req-abc-123")
      assert Radas.RequestID.valid?("a.:-x")
      refute Radas.RequestID.valid?("-starts-with-dash")
      refute Radas.RequestID.valid?("has space")
      refute Radas.RequestID.valid?(123)
      refute Radas.RequestID.valid?(String.duplicate("a", 200))
    end

    test "extract reads X-Request-ID then Request-Id" do
      assert Radas.RequestID.extract(%{"x-request-id" => "req-1"}) == "req-1"
      assert Radas.RequestID.extract(%{"request-id" => "req-2"}) == "req-2"
      assert Radas.RequestID.extract(%{"x-request-id" => "!!bad!!"}) == nil
      assert Radas.RequestID.extract(%{}) == nil
    end
  end
end
