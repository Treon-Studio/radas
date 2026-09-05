defmodule RadasWeb.TestCasesController do
  @moduledoc """
  Port of `api/test_case_routes.py` (Fase 6 — UC 161+): test case
  catalog/CRUD/versions/clone, run (local assertion engine) + tofu-test
  (worker-queued), history, and the UC202 compliance score.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.TestCases

  defp project_id(conn, body \\ %{}),
    do: body["project_id"] || get_req_header(conn, "x-project-id") |> List.first() ||
          conn.query_params["project_id"]

  def catalog(conn, _params), do: json(conn, %{"templates" => TestCases.list_templates()})

  def list(conn, _params) do
    cases =
      TestCases.list_test_cases(project_id(conn),
        tag: conn.query_params["tag"],
        environment: conn.query_params["environment"],
        kind: conn.query_params["kind"],
        enabled: parse_bool(conn.query_params["enabled"])
      )

    json(conn, %{"tests" => cases})
  end

  def validate(conn, _params) do
    json(conn, TestCases.validate_test_definition(conn.body_params || %{}))
  end

  def create(conn, _params) do
    try do
      rec = TestCases.create_test_case(conn.body_params || %{}, project_id(conn, conn.body_params || %{}))
      conn |> put_status(201) |> json(%{"success" => true, "test" => rec})
    rescue
      e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
    end
  end

  def show(conn, %{"test_id" => test_id}) do
    case TestCases.get_test_case(test_id, project_id(conn)) do
      nil -> conn |> put_status(404) |> json(%{"error" => "not found"})
      tc -> json(conn, tc)
    end
  end

  def update(conn, %{"test_id" => test_id}) do
    case TestCases.update_test_case(test_id, conn.body_params || %{}, project_id(conn)) do
      nil -> conn |> put_status(404) |> json(%{"error" => "not found"})
      tc -> json(conn, %{"success" => true, "test" => tc})
    end
  end

  def delete(conn, %{"test_id" => test_id}) do
    if TestCases.delete_test_case(test_id, project_id(conn)) do
      json(conn, %{"success" => true})
    else
      conn |> put_status(404) |> json(%{"error" => "not found"})
    end
  end

  def versions(conn, %{"test_id" => test_id}) do
    versions = TestCases.list_test_case_versions(test_id, project_id(conn))
    json(conn, %{"versions" => versions, "count" => length(versions)})
  end

  def rollback(conn, %{"test_id" => test_id, "version" => version}) do
    case TestCases.rollback_test_case(test_id, version, project_id(conn)) do
      nil -> conn |> put_status(404) |> json(%{"error" => "not found"})
      tc -> json(conn, %{"success" => true, "test" => tc})
    end
  end

  def clone(conn, %{"test_id" => test_id}) do
    case TestCases.clone_test_case(test_id, project_id(conn)) do
      nil -> conn |> put_status(404) |> json(%{"error" => "not found"})
      tc -> conn |> put_status(201) |> json(%{"success" => true, "test" => tc})
    end
  end

  def run(conn, %{"test_id" => test_id}) do
    data = conn.body_params || %{}
    pid = project_id(conn, data)

    result =
      if to_string(data["mode"] || "") == "tofu" or to_string(data["kind"] || "") == "tofu_test" do
        TestCases.run_tofu_test(pid, test_id)
      else
        TestCases.run_test_case(pid, test_id,
          timeout_seconds: parse_int(data["timeout_seconds"], 30),
          mock_provider: !!data["mock_provider"]
        )
      end

    json(conn, result)
  rescue
    e in ArgumentError ->
      status = if e.message in ["test case not found", "test case is disabled"], do: 404, else: 400
      conn |> put_status(status) |> json(%{"error" => e.message})
  end

  def tofu_test(conn, %{"test_id" => test_id}) do
    json(conn, TestCases.run_tofu_test(project_id(conn), test_id))
  rescue
    e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
  end

  def history(conn, %{"test_id" => test_id}) do
    limit = parse_int(conn.query_params["limit"], 50)
    results = TestCases.list_test_results(limit, project_id(conn), test_id)
    json(conn, %{"results" => results, "count" => length(results)})
  end

  def score(conn, _params) do
    json(conn, TestCases.score(project_id(conn), conn.query_params["stack"] || ""))
  end

  defp parse_bool(nil), do: nil
  defp parse_bool(v), do: String.downcase(v) in ["1", "true", "yes", "on"]

  defp parse_int(v, default) when is_integer(v), do: v

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_int(_, default), do: default
end
