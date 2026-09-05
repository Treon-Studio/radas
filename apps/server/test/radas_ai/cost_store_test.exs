defmodule RadasAI.CostStoreTest do
  use Radas.DataCase, async: false

  # Contract tests for the cost_store port: pricing files shared with Flask
  # via DATA_DIR/cost/, the estimate engine, kv-scoped estimates/reports, and
  # the plan extractor.
  alias RadasAI.CostStore

  setup do
    data_dir = Path.join(System.tmp_dir!(), "radas-cost-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)
    on_exit(fn ->
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)
    {:ok, data_dir: data_dir}
  end

  # -- Pricing ----------------------------------------------------------------

  test "get_pricing seeds the default catalog with provider overrides", %{data_dir: data_dir} do
    {:ok, cat} = CostStore.get_pricing("hetzner")
    assert cat["provider"] == "hetzner"
    assert cat["compute"]["vcpu_hour"] == 0.016
    assert cat["network"]["public_ip_month"] == 1.19
    assert File.exists?(Path.join([data_dir, "cost", "pricing", "hetzner.json"]))

    {:ok, aws} = CostStore.get_pricing("aws")
    assert aws["network"]["public_ip_month"] == 3.65
    # Untouched default survives.
    assert aws["storage"]["ssd_gb_month"] == 0.10
  end

  test "unsupported provider rejected" do
    assert {:error, msg} = CostStore.get_pricing("not-a-cloud")
    assert msg =~ ~r/Unsupported provider/
  end

  test "save_pricing bumps version and appends history" do
    {:ok, v1} = CostStore.get_pricing("bytedc")
    {:ok, v2} = CostStore.save_pricing("bytedc", Map.put(v1, "compute", %{"vcpu_hour" => 0.02}))
    assert v2["version"] == 2

    history = CostStore.get_pricing_history("bytedc")
    assert [%{"version" => 1, "catalog" => prev}] = history
    assert prev["compute"]["vcpu_hour"] == 0.018
  end

  # -- Estimate engine ----------------------------------------------------------

  test "estimate computes monthly/yearly with line items" do
    resources = [
      %{"kind" => "instance", "name" => "web-1", "vcpu" => 4, "ram_gb" => 8},
      %{"kind" => "ssd", "name" => "web-1-root", "size_gb" => 100},
      %{"kind" => "kubernetes_cluster", "name" => "prod"}
    ]

    {:ok, result} = CostStore.estimate_cost("bytedc", resources)

    assert result["provider"] == "bytedc"
    assert result["currency"] == "USD"

    [instance, ssd, k8s] = result["line_items"]
    # (4*0.018 + 8*0.004) * 730
    assert instance["monthly"] == Float.round((4 * 0.018 + 8 * 0.004) * 730.0 * 1.0, 2)
    # bytedc does not override storage: default ssd_gb_month = 0.10
    assert ssd["monthly"] == 100 * 0.10 * 1.0
    # bytedc does not override managed: default kubernetes_cluster_month = 73.00
    assert k8s["monthly"] == 73.0

    assert result["monthly_total"] == Float.round(instance["monthly"] + ssd["monthly"] + k8s["monthly"], 2)
    assert result["yearly_total"] == Float.round(result["monthly_total"] * 12, 2)
    # One instance → single-point-of-failure insight (Python parity).
    assert Enum.any?(result["insights"], &(&1 =~ "single point of failure"))
  end

  test "estimate produces overprovisioning warnings and HA insights" do
    {:ok, result} =
      CostStore.estimate_cost("bytedc", [
        %{"kind" => "instance", "name" => "big", "vcpu" => 32, "ram_gb" => 128},
        %{"kind" => "instance", "name" => "big2", "vcpu" => 32, "ram_gb" => 128}
      ])

    assert Enum.any?(result["warnings"], &(&1 =~ "overprovisioned"))
    assert Enum.any?(result["insights"], &(&1 =~ "load balancer"))

    {:ok, single} =
      CostStore.estimate_cost("bytedc", [%{"kind" => "instance", "name" => "solo", "vcpu" => 2, "ram_gb" => 4}])

    assert Enum.any?(single["insights"], &(&1 =~ "single point of failure"))
  end

  test "unknown kinds are skipped with warnings" do
    {:ok, result} = CostStore.estimate_cost("bytedc", [%{"kind" => "quantum_computer", "name" => "q"}])
    assert result["line_items"] == []
    assert Enum.any?(result["warnings"], &(&1 =~ "Unknown resource kind"))
  end

  # -- Estimates (kv-scoped) ------------------------------------------------------

  test "save/list/delete estimates are project-scoped and capped" do
    for i <- 1..3 do
      CostStore.save_estimate("proj-est-1", %{"label" => "est-#{i}", "monthly" => i * 10.0})
    end

    estimates = CostStore.list_estimates("proj-est-1")
    assert length(estimates) == 3
    # newest first
    assert hd(estimates)["label"] == "est-3"

    assert CostStore.list_estimates("proj-est-OTHER") == []

    [newest | _] = estimates
    assert CostStore.delete_estimate("proj-est-1", newest["id"])
    assert length(CostStore.list_estimates("proj-est-1")) == 2
    refute CostStore.delete_estimate("proj-est-1", "nope")
  end

  # -- Reports ----------------------------------------------------------------------

  test "save/get/list/delete reports with slim list view" do
    CostStore.save_report(
      project_id: "proj-rep-1",
      provider: "aws",
      stack: "web",
      resources: [%{"kind" => "instance", "vcpu" => 2, "ram_gb" => 4}],
      result: %{"monthly_total" => 12.0, "yearly_total" => 144.0, "currency" => "USD"},
      source: "apply",
      run_id: "run-1"
    )

    CostStore.save_report(
      project_id: "proj-rep-1",
      provider: "aws",
      stack: "db",
      resources: [],
      result: %{"monthly_total" => 60.0, "yearly_total" => 720.0}
    )

    reports = CostStore.list_reports("proj-rep-1")
    assert length(reports) == 2

    web = Enum.find(reports, &(&1["stack"] == "web"))
    assert web["monthly_total"] == 12.0
    assert web["resource_count"] == 1
    refute Map.has_key?(web, "resources"), "list view is slimmed"

    only_web = CostStore.list_reports("proj-rep-1", stack: "web")
    assert [%{"stack" => "web"}] = only_web

    full = CostStore.get_report("proj-rep-1", web["id"])
    assert full["result"]["monthly_total"] == 12.0

    assert CostStore.delete_report("proj-rep-1", web["id"])
    assert CostStore.get_report("proj-rep-1", web["id"]) == nil
  end

  # -- Flavors & inventory --------------------------------------------------------

  test "flavor_specs parses known, heuristic, and default" do
    assert CostStore.flavor_specs("s3.large.4") == %{"vcpu" => 2.0, "ram_gb" => 8.0}
    assert CostStore.flavor_specs("c6.xlarge.2") == %{"vcpu" => 4.0, "ram_gb" => 8.0}
    # heuristic: <gen>.<size>.<ratio>
    assert CostStore.flavor_specs("s7.large.3") == %{"vcpu" => 2.0, "ram_gb" => 6.0}
    assert CostStore.flavor_specs(nil) == %{"vcpu" => 2, "ram_gb" => 4}
    assert CostStore.flavor_specs("garbage") == %{"vcpu" => 2, "ram_gb" => 4}
  end

  test "resources_from_inventory converts vms/eips" do
    inv = %{
      "vms" => [
        %{"hostname" => "vm-a", "flavor_id" => "s3.large.4", "system_disk_size" => 40, "system_disk_type" => "SSD"},
        %{"hostname" => "vm-b", "flavor_id" => "s3.large.2", "system_disk_size" => 40, "system_disk_type" => "sata"}
      ],
      "eips" => [%{"id" => "eip-1"}]
    }

    resources = CostStore.resources_from_inventory(inv)
    kinds = Enum.map(resources, & &1["kind"])
    assert kinds == ["instance", "ssd", "instance", "hdd", "public_ip"]
    assert List.last(resources)["quantity"] == 1
  end

  # -- Plan extraction ----------------------------------------------------------------

  test "extract_from_plan normalizes resource_changes" do
    plan = %{
      "resource_changes" => [
        %{"type" => "openstack_compute_instance_v2", "name" => "vm1", "change" => %{"after" => %{"vcpus" => 4, "memory_gb" => 8}}},
        %{"type" => "kubernetes_cluster", "name" => "k1", "change" => %{"after" => %{}}},
        %{"type" => "aws_lb", "name" => "lb1", "change" => %{"after" => %{}}},
        %{"type" => "google_storage_bucket", "name" => "b1", "change" => %{"after" => %{}}}
      ]
    }

    {:ok, resources} = CostStore.extract_from_plan(plan)
    kinds = Enum.map(resources, & &1["kind"])
    assert kinds == ["instance", "kubernetes_cluster", "load_balancer", "object_storage"]
  end

  test "extract_from_plan falls back to planned_values" do
    plan = %{
      "planned_values" => %{
        "root_module" => %{
          "resources" => [%{"type" => "aws_nat_gateway", "name" => "nat", "values" => %{}}]
        }
      }
    }

    {:ok, resources} = CostStore.extract_from_plan(plan)
    assert [%{"kind" => "nat_gateway"}] = resources
  end
end

defmodule RadasWeb.CostControllerTest do
  use Radas.DataCase, async: false

  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint

  setup do
    data_dir = Path.join(System.tmp_dir!(), "radas-cost-live-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)
    on_exit(fn ->
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)
    {:ok, conn: build_conn()}
  end

  test "GET /api/cost/pricing lists all supported providers" do
    conn = build_conn() |> get("/api/cost/pricing")
    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    assert length(body) == 9
  end

  test "PUT then GET pricing round trip" do
    conn =
      build_conn()
      |> put("/api/cost/pricing/bytedc", %{"compute" => %{"vcpu_hour" => 0.02}})

    assert conn.status == 200

    conn2 = build_conn() |> get("/api/cost/pricing/bytedc")
    assert Jason.decode!(conn2.resp_body)["compute"]["vcpu_hour"] == 0.02
  end

  test "POST /api/cost/estimate computes and rejects bad providers" do
    conn =
      build_conn()
      |> post("/api/cost/estimate", %{
        "provider" => "bytedc",
        "resources" => [%{"kind" => "instance", "vcpu" => 2, "ram_gb" => 4}]
      })

    assert conn.status == 200
    assert Jason.decode!(conn.resp_body)["provider"] == "bytedc"

    bad = build_conn() |> post("/api/cost/estimate", %{"provider" => "nope", "resources" => []})
    assert bad.status == 400
  end

  test "POST /api/cost/extract/plan validates plan JSON" do
    conn =
      build_conn()
      |> post("/api/cost/extract/plan", %{"plan" => Jason.encode!(%{"bad" => true})})

    assert conn.status == 200
    assert Jason.decode!(conn.resp_body)["count"] == 0

    conn2 = build_conn() |> post("/api/cost/extract/plan", %{"plan" => "{not json"})
    assert conn2.status == 400
  end

  test "estimates CRUD through the HTTP surface" do
    conn = build_conn() |> post("/api/cost/estimates", %{"label" => "http-est"})
    assert conn.status == 200
    %{"id" => id} = Jason.decode!(conn.resp_body)

    conn = build_conn() |> get("/api/cost/estimates")
    assert [%{"id" => ^id}] = Jason.decode!(conn.resp_body)["estimates"]

    conn = build_conn() |> delete("/api/cost/estimates/#{id}")
    assert Jason.decode!(conn.resp_body)["success"]
  end
end
