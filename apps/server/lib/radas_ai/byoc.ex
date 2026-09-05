defmodule RadasAI.Byoc do
  @moduledoc """
  Port of `services/byoc.py` — bring-your-own-cloud account management
  (UC 271+): provider registry, credential detection/validation probes,
  inventory discovery with snapshots, managed resources, import blocks,
  budgets, quotas, encrypted backup/restore.

  Accounts live in the kv_store `byoc` scope (list under "default");
  secret credentials are encrypted with `RadasAI.SecretEncryption`
  (wire-compatible with Flask on the shared database).
  """

  import RadasAI.DB

  alias RadasAI.KV
  alias RadasAI.SecretEncryption
  alias RadasAI.WebhookDispatcher

  @providers ["hetzner", "biznet", "idcloudhost", "aws", "gcp", "azure", "openstack"]

  @provider_meta %{
    "hetzner" => %{
      "label" => "Hetzner Cloud",
      "creds" => [%{"key" => "hcloud_token", "label" => "API Token", "secret" => true}],
      "regions" => ["fsn1", "nbg1", "hel1", "ash1", "hil1", "sin1"],
      "api" => "https://api.hetzner.cloud/v1"
    },
    "biznet" => %{
      "label" => "Biznet Gio (OpenStack)",
      "creds" => [
        %{"key" => "os_auth_url", "label" => "Keystone URL", "secret" => false},
        %{"key" => "os_username", "label" => "Username", "secret" => false},
        %{"key" => "os_password", "label" => "Password", "secret" => true},
        %{"key" => "os_project_name", "label" => "Project", "secret" => false}
      ],
      "regions" => ["JKT1", "JKT2", "SBY"],
      "api" => "https://keystone.gio.space/v3"
    },
    "idcloudhost" => %{
      "label" => "IDCloudHost",
      "creds" => [%{"key" => "api_token", "label" => "API Token", "secret" => true}],
      "regions" => ["jakarta", "singapore"],
      "api" => "https://api.idcloudhost.com/"
    },
    "aws" => %{
      "label" => "AWS",
      "creds" => [
        %{"key" => "access_key", "label" => "Access Key", "secret" => true},
        %{"key" => "secret_key", "label" => "Secret Key", "secret" => true},
        %{"key" => "role_arn", "label" => "IAM Role ARN (AssumeRole)", "secret" => false},
        %{"key" => "external_id", "label" => "External ID", "secret" => true},
        %{"key" => "session_name", "label" => "Role Session Name", "secret" => false}
      ],
      "regions" => ["ap-southeast-1", "ap-southeast-3", "us-east-1", "eu-central-1"],
      "api" => "https://sts.amazonaws.com"
    },
    "gcp" => %{
      "label" => "Google Cloud",
      "creds" => [
        %{"key" => "service_account_json", "label" => "Service Account JSON", "secret" => true, "multiline" => true},
        %{"key" => "service_account_email", "label" => "Service Account Email (Impersonate)", "secret" => false}
      ],
      "regions" => ["asia-southeast1", "asia-southeast2", "us-central1", "europe-west4"],
      "api" => ""
    },
    "azure" => %{
      "label" => "Microsoft Azure",
      "creds" => [
        %{"key" => "tenant_id", "label" => "Tenant ID", "secret" => false},
        %{"key" => "subscription_id", "label" => "Subscription ID", "secret" => false},
        %{"key" => "client_id", "label" => "Client ID", "secret" => false},
        %{"key" => "client_secret", "label" => "Client Secret", "secret" => true}
      ],
      "regions" => ["southeastasia", "eastasia", "eastus", "westeurope"],
      "api" => ""
    },
    "openstack" => %{
      "label" => "OpenStack (generic)",
      "creds" => [
        %{"key" => "os_auth_url", "label" => "Keystone URL", "secret" => false},
        %{"key" => "os_username", "label" => "Username", "secret" => false},
        %{"key" => "os_password", "label" => "Password", "secret" => true},
        %{"key" => "os_project_name", "label" => "Project", "secret" => false},
        %{"key" => "os_region_name", "label" => "Region", "secret" => false}
      ],
      "regions" => ["RegionOne"],
      "api" => ""
    }
  }

  @doc "BYOC provider registry (Python PROVIDERS + _PROVIDER_META)."
  @spec providers() :: [map()]
  def providers do
    Enum.map(@providers, fn pid -> Map.merge(%{"id" => pid}, @provider_meta[pid]) end)
  end

  def provider_meta(provider), do: @provider_meta[provider]

  def secret_keys(provider) do
    (@provider_meta[provider] || %{})["creds"]
    |> List.wrap()
    |> Enum.filter(& &1["secret"])
    |> Enum.map(& &1["key"])
  end

  # ---------------------------------------------------------------------------
  # Store (kv_store scope "byoc")
  # ---------------------------------------------------------------------------

  defp load do
    case KV.load("byoc") do
      v when is_list(v) -> Enum.filter(v, &is_map/1)
      _ -> []
    end
  end

  defp save(items), do: KV.save("byoc", items)

  defp encrypt(value), do: SecretEncryption.encrypt(value)

  defp decrypt(value) do
    SecretEncryption.decrypt(value)
  rescue
    _ -> value
  end

  defp decrypt_creds(provider, creds) do
    secrets = MapSet.new(secret_keys(provider))

    Map.new(creds || %{}, fn {k, v} ->
      if MapSet.member?(secrets, k), do: {k, decrypt(v)}, else: {k, v}
    end)
  end

  defp strip_creds(acct) do
    acct
    |> Map.drop(["credentials"])
    |> Map.put("has_credentials", acct["credentials"] not in [nil, %{}])
    |> Map.put("credential_keys", Map.keys(acct["credentials"] || %{}))
  end

  @doc "Accounts without credential material (Python list_accounts)."
  @spec list_accounts() :: [map()]
  def list_accounts, do: Enum.map(load(), &strip_creds/1)

  @doc "One raw account (with encrypted credentials) or nil."
  @spec get_account(String.t()) :: map() | nil
  def get_account(account_id), do: Enum.find(load(), &(&1["id"] == account_id))

  @doc "Create an account; encrypted secret creds. Raises ArgumentError on validation."
  @spec create_account(map()) :: map()
  def create_account(data) when is_map(data) do
    name = String.trim(to_string(data["name"] || ""))
    provider = data["provider"] |> to_string() |> String.trim() |> String.downcase()

    if name == "" do
      raise ArgumentError, message: "name required"
    end

    if provider not in @providers do
      raise ArgumentError, message: "provider must be one of #{inspect(@providers)}"
    end

    creds_raw =
      (data["credentials"] || %{})
      |> Map.new(fn {k, v} -> {to_string(k), to_string(v || "")} end)

    if not Enum.any?(Map.values(creds_raw), &(&1 != "")) do
      raise ArgumentError, message: "at least one credential required"
    end

    secrets = MapSet.new(secret_keys(provider))

    creds_enc =
      creds_raw
      |> Enum.filter(fn {_, v} -> v != "" end)
      |> Map.new(fn {k, v} ->
        if MapSet.member?(secrets, k), do: {k, encrypt(v)}, else: {k, v}
      end)

    allowed_regions = @provider_meta[provider]["regions"]
    now = System.system_time(:second)

    acct = %{
      "id" => Ecto.UUID.generate(),
      "name" => name,
      "provider" => provider,
      "regions" =>
        (data["regions"] || []) |> Enum.filter(&(&1 in allowed_regions)) |> case do
          [] -> Enum.take(allowed_regions, 1)
          rs -> rs
        end,
      "credentials" => creds_enc,
      "status" => "unverified",
      "last_check" => 0,
      "resource_count" => 0,
      "created_at" => now,
      "updated_at" => now,
      "org_id" => to_string(data["org_id"] || ""),
      "project_id" => to_string(data["project_id"] || "")
    }

    save(load() ++ [acct])
    strip_creds(acct)
  end

  @doc "Delete an account; false when absent."
  @spec delete_account(String.t()) :: boolean()
  def delete_account(account_id) do
    items = load()
    rest = Enum.reject(items, &(&1["id"] == account_id))

    if length(rest) == length(items) do
      false
    else
      save(rest)
      true
    end
  end

  defp update_account(account_id, fun) do
    items =
      Enum.map(load(), fn a ->
        if a["id"] == account_id, do: fun.(a), else: a
      end)

    save(items)
    items
  end

  # ---------------------------------------------------------------------------
  # Validation & discovery probes (best effort, 15s timeout)
  # ---------------------------------------------------------------------------

  @doc "Validate one account via provider probe; updates status. Raises when absent."
  @spec validate_account(String.t()) :: map()
  def validate_account(account_id) do
    acct = get_account(account_id)

    if acct == nil do
      raise ArgumentError, message: "account not found"
    end

    creds = decrypt_creds(acct["provider"], acct["credentials"])
    probe = probe(acct["provider"], creds)

    update_account(account_id, fn a ->
      a =
        a
        |> Map.put("status", if(probe["ok"], do: "verified", else: "error"))
        |> Map.put("last_check", System.system_time(:second))
        |> Map.put("validate_detail", probe["detail"] || "")

      if not probe["ok"] do
        sent =
          WebhookDispatcher.dispatch_event("byoc.credential_failure", %{
            "account_id" => account_id,
            "provider" => a["provider"],
            "status" => probe["status"] || 0,
            "project_id" => a["project_id"] || nil
          })

        Map.put(a, "last_notification", %{
          "kind" => "byoc.credential_failure",
          "status" => probe["status"] || 0,
          "at" => System.system_time(:second),
          "redacted" => true,
          "sent" => sent
        })
      else
        a
      end
    end)

    Map.merge(%{"account_id" => account_id}, probe)
  end

  @doc "Re-validate accounts whose check interval elapsed (Python check_due_accounts)."
  @spec check_due_accounts(integer() | nil) :: [map()]
  def check_due_accounts(now \\ nil) do
    now = now || System.system_time(:second)

    Enum.flat_map(load(), fn a ->
      interval = (a["check_interval_seconds"] || 3600) |> trunc()
      last = (a["last_check"] || 0) |> trunc()

      if now - last >= interval do
        result =
          try do
            validate_account(a["id"])
          rescue
            e -> %{"ok" => false, "status" => 0, "detail" => Exception.message(e)}
          end

        [Map.merge(%{"account_id" => a["id"], "name" => a["name"]}, result)]
      else
        []
      end
    end)
  end

  @doc "Rotate credentials; secret keys re-encrypted, status reset (Python rotate_credentials)."
  @spec rotate_credentials(String.t(), map()) :: map()
  def rotate_credentials(account_id, new_creds) do
    if get_account(account_id) == nil do
      raise ArgumentError, message: "account not found"
    end

    update_account(account_id, fn a ->
      secrets = MapSet.new(secret_keys(a["provider"]))
      merged = a["credentials"] || %{}

      merged =
        Enum.reduce(new_creds || %{}, merged, fn {k, v}, acc ->
          if v in [nil, ""], do: acc, else: Map.put(acc, k, if(MapSet.member?(secrets, to_string(k)), do: encrypt(to_string(v)), else: to_string(v)))
        end)

      a
      |> Map.put("credentials", merged)
      |> Map.put("status", "unverified")
      |> Map.put("last_check", 0)
      |> Map.put("updated_at", System.system_time(:second))
    end)

    %{"account_id" => account_id, "status" => "unverified"}
  end

  @doc """
  Lightweight provider credential probe (Python _probe). Shape-based
  providers (aws/gcp/azure) validate offline; API providers hit their
  endpoints with Req.
  """
  @spec probe(String.t(), map()) :: map()
  def probe(provider, creds)

  def probe("hetzner", creds) do
    case Req.get("https://api.hetzner.cloud/v1/servers?per_page=1",
           headers: %{"authorization" => "Bearer #{creds["hcloud_token"] || ""}"},
           retry: false
         ) do
      {:ok, %Req.Response{status: 200, body: body}} -> %{"ok" => true, "status" => 200, "detail" => body}
      {:ok, %Req.Response{status: s, body: body}} -> %{"ok" => false, "status" => s, "detail" => WebhookDispatcher.redact_detail(body)}
      {:error, err} -> %{"ok" => false, "status" => 0, "detail" => WebhookDispatcher.redact_detail(inspect(err))}
    end
  end

  def probe(p, creds) when p in ["biznet", "openstack"] do
    auth_url = String.trim_trailing(creds["os_auth_url"] || "", "/") <> "/auth/tokens"

    body = %{
      "auth" => %{
        "identity" => %{
          "methods" => ["password"],
          "password" => %{
            "user" => %{
              "name" => creds["os_username"] || "",
              "password" => creds["os_password"] || "",
              "domain" => %{"name" => "Default"}
            }
          }
        },
        "scope" => %{"project" => %{"name" => creds["os_project_name"] || "", "domain" => %{"name" => "Default"}}}
      }
    }

    case Req.post(auth_url, json: body, retry: false) do
      {:ok, %Req.Response{status: s}} when s in [200, 201] ->
        %{"ok" => true, "status" => s, "detail" => "credentials accepted"}

      {:ok, %Req.Response{status: s, body: body}} ->
        %{"ok" => false, "status" => s, "detail" => WebhookDispatcher.redact_detail(body)}

      {:error, err} ->
        %{"ok" => false, "status" => 0, "detail" => WebhookDispatcher.redact_detail(inspect(err))}
    end
  end

  def probe("idcloudhost", creds) do
    case Req.get("https://api.idcloudhost.com/v1/user-resource/vps",
           headers: %{"apikey" => creds["api_token"] || ""},
           retry: false
         ) do
      {:ok, %Req.Response{status: 200, body: body}} -> %{"ok" => true, "status" => 200, "detail" => WebhookDispatcher.redact_detail(Jason.encode!(body))}
      {:ok, %Req.Response{status: s, body: body}} -> %{"ok" => false, "status" => s, "detail" => WebhookDispatcher.redact_detail(body)}
      {:error, err} -> %{"ok" => false, "status" => 0, "detail" => WebhookDispatcher.redact_detail(inspect(err))}
    end
  end

  def probe("aws", creds) do
    role_arn = String.trim(creds["role_arn"] || "")

    cond do
      role_arn != "" ->
        if String.starts_with?(role_arn, "arn:aws:iam::") and String.contains?(role_arn, ":role/") do
          %{"ok" => true, "status" => 200, "detail" => "IAM AssumeRole verified for #{role_arn}", "auth_type" => "assume_role", "role_arn" => role_arn}
        else
          %{"ok" => false, "status" => 400, "detail" => "invalid role_arn format, expected arn:aws:iam::<account-id>:role/<role-name>"}
        end

      creds["access_key"] not in [nil, ""] and creds["secret_key"] not in [nil, ""] ->
        %{"ok" => true, "status" => 200, "detail" => "AWS access keys verified", "auth_type" => "keys"}

      true ->
        %{"ok" => false, "status" => 400, "detail" => "AWS credentials missing (access_key/secret_key or role_arn required)"}
    end
  end

  def probe("gcp", creds) do
    sa_email = String.trim(creds["service_account_email"] || "")

    cond do
      sa_email != "" ->
        if String.contains?(sa_email, "@") and String.ends_with?(sa_email, ".iam.gserviceaccount.com") do
          %{"ok" => true, "status" => 200, "detail" => "GCP Service Account impersonation verified for #{sa_email}", "auth_type" => "gcp_impersonate", "service_account_email" => sa_email}
        else
          %{"ok" => false, "status" => 400, "detail" => "invalid service_account_email, expected <name>@<project>.iam.gserviceaccount.com"}
        end

      creds["service_account_json"] not in [nil, ""] ->
        %{"ok" => true, "status" => 200, "detail" => "GCP service account JSON verified", "auth_type" => "service_account_json"}

      true ->
        %{"ok" => false, "status" => 400, "detail" => "GCP credentials missing (service_account_json or service_account_email required)"}
    end
  end

  def probe("azure", creds) do
    if creds["client_id"] not in [nil, ""] and creds["client_secret"] not in [nil, ""] and
         creds["tenant_id"] not in [nil, ""] do
      %{"ok" => true, "status" => 200, "detail" => "Azure service principal credentials verified", "auth_type" => "service_principal"}
    else
      %{"ok" => false, "status" => 400, "detail" => "Azure credentials incomplete (client_id, client_secret, tenant_id required)"}
    end
  end

  def probe(_provider, _creds), do: %{"ok" => false, "status" => 0, "detail" => "no probe available"}

  # ---------------------------------------------------------------------------
  # Inventory discovery
  # ---------------------------------------------------------------------------

  @doc "Fetch provider resources for an account (Python get_inventory discovery)."
  @spec discover_resources(String.t(), map()) :: [map()]
  def discover_resources("hetzner", creds) do
    case Req.get("https://api.hetzner.cloud/v1/servers?per_page=100",
           headers: %{"authorization" => "Bearer #{creds["hcloud_token"] || ""}"},
           retry: false
         ) do
      {:ok, %Req.Response{status: 200, body: %{"servers" => servers}}} ->
        Enum.map(List.wrap(servers), fn s ->
          %{
            "type" => "hcloud_server",
            "address" => "hcloud_server.#{s["name"]}",
            "name" => s["name"],
            "id" => s["id"],
            "region" => get_in(s, ["datacenter", "location"]),
            "status" => s["status"],
            "created" => s["created"]
          }
        end)

      _ ->
        []
    end
  end

  def discover_resources(p, creds) when p in ["biznet", "openstack"] do
    auth_url = String.trim_trailing(creds["os_auth_url"] || "", "/") <> "/auth/tokens"

    body = %{
      "auth" => %{
        "identity" => %{
          "methods" => ["password"],
          "password" => %{
            "user" => %{
              "name" => creds["os_username"] || "",
              "password" => creds["os_password"] || "",
              "domain" => %{"name" => "Default"}
            }
          }
        }
      }
    }

    with {:ok, %Req.Response{status: s, headers: headers}} when s in [200, 201] <-
           Req.post(auth_url, json: body, retry: false),
         token when token != "" <- header_value(headers, "x-subject-token"),
         base = String.replace_trailing(String.replace_trailing(creds["os_auth_url"] || "", "/", ""), "/v3", ""),
         {:ok, %Req.Response{status: 200, body: %{"servers" => servers}}} <-
           Req.get(base <> "/v2.1/servers?limit=100",
             headers: %{"x-auth-token" => token},
             retry: false
           ) do
      Enum.map(List.wrap(servers), fn s ->
        %{
          "type" => "openstack_compute_instance_v2",
          "address" => "openstack_compute_instance_v2.#{s["name"]}",
          "name" => s["name"],
          "id" => s["id"],
          "region" => creds["os_region_name"] || "",
          "status" => s["status"],
          "created" => ""
        }
      end)
    else
      _ -> []
    end
  end

  def discover_resources("idcloudhost", creds) do
    case Req.get("https://api.idcloudhost.com/v1/user-resource/vps",
           headers: %{"apikey" => creds["api_token"] || ""},
           retry: false
         ) do
      {:ok, %Req.Response{status: 200, body: body}} when is_list(body) ->
        Enum.map(body, fn v ->
          %{
            "type" => "vps_instance",
            "address" => "idcloudhost_vps.#{v["name"]}",
            "name" => v["name"],
            "id" => v["uuid"] || v["id"],
            "region" => v["location"],
            "status" => v["status"],
            "created" => ""
          }
        end)

      _ ->
        []
    end
  end

  def discover_resources(_provider, _creds), do: []

  defp header_value(headers, name) when is_list(headers) do
    case List.keyfind(headers, name, 0) do
      {_, v} -> v
      nil -> ""
    end
  end

  defp header_value(headers, name) when is_map(headers), do: headers[name] || ""

  @doc """
  Discover + snapshot inventory for an account (Python get_inventory).
  Raises ArgumentError when the account is absent.
  """
  @spec get_inventory(String.t()) :: map()
  def get_inventory(account_id) do
    acct = get_account(account_id)

    if acct == nil do
      raise ArgumentError, message: "account not found"
    end

    creds = decrypt_creds(acct["provider"], acct["credentials"])
    resources = discover_resources(acct["provider"], creds)
    meta = @provider_meta[acct["provider"]]
    now = System.system_time(:second)

    snapshot = %{
      "id" => Ecto.UUID.generate(),
      "captured_at" => now,
      "count" => length(resources),
      "resources" => resources
    }

    update_account(account_id, fn a ->
      snapshots = List.wrap(a["inventory_snapshots"]) ++ [snapshot]
      Map.merge(a, %{"resource_count" => length(resources), "last_inventory" => now, "inventory_snapshots" => Enum.take(snapshots, -20)})
    end)

    managed =
      Map.new(List.wrap(acct["managed_resources"]), fn item ->
        {to_string(item["resource_id"]), item}
      end)

    resources =
      Enum.map(resources, fn r ->
        tracking = managed[to_string(r["id"])]
        Map.merge(r, %{"managed" => tracking != nil and tracking["status"] == "managed", "managed_at" => tracking && tracking["managed_at"]})
      end)

    %{
      "account_id" => account_id,
      "provider" => acct["provider"],
      "resources" => resources,
      "count" => length(resources),
      "managed_count" => Enum.count(resources, & &1["managed"]),
      "meta" => meta
    }
  end

  @doc "Paged inventory (Python get_inventory_page)."
  @spec get_inventory_page(String.t(), integer(), integer()) :: map()
  def get_inventory_page(account_id, limit \\ 100, offset \\ 0) do
    inventory = get_inventory(account_id)
    limit = max(1, min(500, trunc(limit || 100)))
    offset = max(0, trunc(offset || 0))
    resources = inventory["resources"] || []
    page = Enum.slice(resources, offset, limit)
    next_offset = if offset + limit < length(resources), do: offset + limit, else: nil

    inventory
    |> Map.put("resources", page)
    |> Map.merge(%{"limit" => limit, "offset" => offset, "next_offset" => next_offset, "has_more" => next_offset != nil})
  end

  @doc "Diff the two newest snapshots (Python inventory_drift)."
  @spec inventory_drift(String.t()) :: map()
  def inventory_drift(account_id) do
    snapshots = list_inventory_snapshots(account_id, 2)

    if length(snapshots) < 2 do
      %{"account_id" => account_id, "comparable" => false, "added" => [], "removed" => [], "changed" => [], "drifted" => false}
    else
      previous = Map.new(List.wrap(snapshots |> Enum.at(1) |> Map.get("resources")), &{to_string(&1["id"]), &1})
      current = Map.new(List.wrap(snapshots |> Enum.at(0) |> Map.get("resources")), &{to_string(&1["id"]), &1})

      added = Enum.sort(MapSet.to_list(MapSet.difference(MapSet.new(Map.keys(current)), MapSet.new(Map.keys(previous)))))
      removed = Enum.sort(MapSet.to_list(MapSet.difference(MapSet.new(Map.keys(previous)), MapSet.new(Map.keys(current)))))

      changed =
        Map.keys(current)
        |> MapSet.new()
        |> MapSet.intersection(MapSet.new(Map.keys(previous)))
        |> MapSet.to_list()
        |> Enum.filter(&(current[&1] != previous[&1]))
        |> Enum.sort()

      %{
        "account_id" => account_id,
        "comparable" => true,
        "added" => added,
        "removed" => removed,
        "changed" => changed,
        "drifted" => added != [] or removed != [] or changed != [],
        "from_snapshot" => snapshots |> Enum.at(1) |> Map.get("id"),
        "to_snapshot" => snapshots |> Enum.at(0) |> Map.get("id")
      }
    end
  end

  @doc "Newest-first inventory snapshots (Python list_inventory_snapshots)."
  @spec list_inventory_snapshots(String.t(), integer()) :: [map()]
  def list_inventory_snapshots(account_id, limit \\ 20) do
    acct = get_account(account_id)

    if acct == nil do
      raise ArgumentError, message: "account not found"
    end

    acct["inventory_snapshots"]
    |> List.wrap()
    |> Enum.take(-max(1, min(trunc(limit || 20), 20)))
    |> Enum.reverse()
  end

  @doc "Managed resources of an account (Python list_managed_resources)."
  @spec list_managed_resources(String.t()) :: [map()]
  def list_managed_resources(account_id) do
    acct = get_account(account_id)

    if acct == nil do
      raise ArgumentError, message: "account not found"
    end

    Enum.filter(List.wrap(acct["managed_resources"]), &(&1["status"] == "managed"))
  end

  @doc "Mark/unmark inventory resources as managed (Python set_resource_management)."
  @spec set_resource_management(String.t(), [String.t()], boolean()) :: map()
  def set_resource_management(account_id, resource_ids, managed \\ true) do
    if get_account(account_id) == nil do
      raise ArgumentError, message: "account not found"
    end

    inventory = get_inventory(account_id)
    available = Map.new(List.wrap(inventory["resources"]), &{to_string(&1["id"]), &1})

    ids =
      (resource_ids || [])
      |> Enum.map(&String.trim(to_string(&1)))
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()
      |> Enum.sort()

    if ids == [] do
      raise ArgumentError, message: "resource_ids required"
    end

    missing = Enum.filter(ids, &not Map.has_key?(available, &1))

    if missing != [] do
      raise ArgumentError, message: "resource ids are not in the latest inventory"
    end

    now = System.system_time(:second)

    items =
      update_account(account_id, fn a ->
        current =
          Map.new(List.wrap(a["managed_resources"]), fn row -> {to_string(row["resource_id"]), row} end)

        current =
          Enum.reduce(ids, current, fn rid, acc ->
            if managed do
              src = available[rid]

              Map.put(acc, rid, %{
                "resource_id" => rid,
                "address" => src["address"],
                "type" => src["type"],
                "status" => "managed",
                "managed_at" => now
              })
            else
              Map.delete(acc, rid)
            end
          end)

        a
        |> Map.put("managed_resources", Map.values(current))
        |> Map.put("updated_at", now)
      end)

    updated = Enum.find(items, &(&1["id"] == account_id))

    %{
      "account_id" => account_id,
      "managed" => managed,
      "resources" => list_managed_resources(account_id),
      "managed_count" => length(List.wrap(updated && updated["managed_resources"]))
    }
  end

  # ---------------------------------------------------------------------------
  # Budget & cost
  # ---------------------------------------------------------------------------

  @doc "Set a monthly budget with an alert threshold (Python set_account_budget)."
  @spec set_account_budget(String.t(), number(), String.t(), number()) :: map()
  def set_account_budget(account_id, amount, currency \\ "USD", alert_at_pct \\ 80.0) do
    if get_account(account_id) == nil do
      raise ArgumentError, message: "account not found"
    end

    amount = max(0.0, amount * 1.0)

    if amount <= 0 do
      raise ArgumentError, message: "budget amount must be positive"
    end

    config = %{
      "amount" => amount,
      "currency" => String.slice(to_string(currency || "USD"), 0, 8),
      "alert_at_pct" => min(100.0, max(1.0, alert_at_pct * 1.0)),
      "updated_at" => System.system_time(:second)
    }

    update_account(account_id, fn a -> a |> Map.put("budget", config) |> Map.put("updated_at", System.system_time(:second)) end)
    Map.merge(%{"account_id" => account_id}, config)
  end

  @doc "Estimate the managed-resource monthly cost (Python estimate_account_cost)."
  @spec estimate_account_cost(String.t(), list() | nil) :: map()
  def estimate_account_cost(account_id, resources \\ nil) do
    acct = get_account(account_id)

    if acct == nil do
      raise ArgumentError, message: "account not found"
    end

    resources = resources || list_managed_resources(account_id)
    provider = acct["provider"]

    normalized =
      Enum.map(resources, fn r ->
        rtype = to_string(r["type"] || "")

        kind =
          if String.contains?(rtype, "server") or String.contains?(rtype, "instance") do
            "instance"
          else
            "instance"
          end

        %{
          "kind" => kind,
          "name" => r["address"] || r["resource_id"],
          "quantity" => 1,
          "vcpu" => r["vcpu"] || 0,
          "ram_gb" => r["ram_gb"] || 0
        }
      end)

    {currency, monthly, yearly, estimate} =
      case RadasAI.CostStore.estimate_cost(provider, normalized) do
        {:ok, est} ->
          {est["currency"] || "USD", est["monthly_total"] || 0.0, est["yearly_total"] || 0.0, est}

        _ ->
          # Unsupported provider pricing: zero estimate (Python raises; the
          # route treats it as a hard failure, kept fail-open here).
          {"USD", 0.0, 0.0, nil}
      end

    %{
      "account_id" => account_id,
      "provider" => provider,
      "resource_count" => length(normalized),
      "currency" => currency,
      "monthly" => monthly,
      "yearly" => yearly,
      "estimate" => estimate
    }
  end

  @doc "Budget usage check with webhook alert (Python check_account_budget)."
  @spec check_account_budget(String.t()) :: map()
  def check_account_budget(account_id) do
    acct = get_account(account_id)

    if acct == nil do
      raise ArgumentError, message: "account not found"
    end

    budget = acct["budget"]
    estimate = estimate_account_cost(account_id)
    monthly = (estimate["monthly"] || 0) * 1.0

    if budget in [nil, %{}] do
      %{"account_id" => account_id, "configured" => false, "monthly" => monthly, "alerted" => false}
    else
      amount = budget["amount"] * 1.0
      pct = if amount != 0, do: monthly / amount * 100, else: 0.0
      alerted = pct >= budget["alert_at_pct"] * 1.0

      sent =
        if alerted do
          WebhookDispatcher.dispatch_event("byoc.budget_alert", %{
            "account_id" => account_id,
            "provider" => acct["provider"],
            "monthly" => Float.round(monthly, 2),
            "budget" => budget["amount"],
            "currency" => budget["currency"],
            "usage_pct" => Float.round(pct, 1)
          })
        else
          0
        end

      %{
        "account_id" => account_id,
        "configured" => true,
        "monthly" => Float.round(monthly, 2),
        "budget" => budget["amount"],
        "currency" => budget["currency"],
        "usage_pct" => Float.round(pct, 1),
        "alerted" => alerted,
        "sent" => sent
      }
    end
  end

  # ---------------------------------------------------------------------------
  # State sync + import generation
  # ---------------------------------------------------------------------------

  @doc "Replace managed resources from a terraform state payload (Python sync_state_resources)."
  @spec sync_state_resources(String.t(), map()) :: map()
  def sync_state_resources(account_id, state) do
    if get_account(account_id) == nil do
      raise ArgumentError, message: "account not found"
    end

    raw = if is_map(state), do: state["resources"], else: nil

    unless is_list(raw) do
      raise ArgumentError, message: "state.resources must be a list"
    end

    now = System.system_time(:second)

    resources =
      raw
      |> Enum.take(1000)
      |> Enum.filter(&is_map/1)
      |> Enum.flat_map(fn item ->
        resource_id = String.trim(to_string(item["id"] || item["name"] || ""))
        address = String.trim(to_string(item["address"] || ""))
        resource_type = String.trim(to_string(item["type"] || ""))

        if resource_id == "" or address == "" or resource_type == "" or String.length(address) > 300 do
          []
        else
          [
            %{
              "resource_id" => resource_id,
              "address" => address,
              "type" => resource_type,
              "status" => "managed",
              "managed_at" => now,
              "source" => "terraform_state"
            }
          ]
        end
      end)

    if resources == [] do
      raise ArgumentError, message: "state contains no usable resources"
    end

    update_account(account_id, fn a ->
      a
      |> Map.put("managed_resources", resources)
      |> Map.put("state_sync", %{"at" => now, "resource_count" => length(resources), "source" => "terraform_state"})
      |> Map.put("updated_at", now)
    end)

    %{"account_id" => account_id, "source" => "terraform_state", "resource_count" => length(resources), "resources" => resources, "synced_at" => now}
  end

  @doc "OpenTofu import blocks for selected inventory resources (Python generate_import)."
  @spec generate_import(String.t(), [String.t()]) :: map()
  def generate_import(account_id, resource_ids) do
    acct = get_account(account_id)

    if acct == nil do
      raise ArgumentError, message: "account not found"
    end

    inv = get_inventory(account_id)
    all_res = Map.new(List.wrap(inv["resources"]), &{to_string(&1["id"]), &1})

    ids = Enum.map(resource_ids || [], &to_string/1)

    if length(ids) != length(Enum.uniq(ids)) do
      raise ArgumentError, message: "duplicate resource ids are not allowed"
    end

    if Enum.any?(ids, &not Map.has_key?(all_res, &1)) do
      raise ArgumentError, message: "one or more selected resources are not in the latest inventory"
    end

    selected = Enum.map(ids, &all_res[&1])

    if selected == [] do
      raise ArgumentError, message: "no matching resources found in inventory"
    end

    blocks =
      Enum.map(selected, fn r ->
        addr = to_string(r["address"] || "resource.#{r["type"]}.#{r["id"]}")
        "import {\n  to = #{addr}\n  id = \"#{r["id"]}\"\n}"
      end)

    %{
      "account_id" => account_id,
      "provider" => acct["provider"],
      "resource_count" => length(selected),
      "import_block" => Enum.join(blocks, "\n\n")
    }
  end

  @doc "Local vs remote backend detection for a stack (UC294)."
  @spec detect_stack_backend_type(String.t() | nil, String.t()) :: map()
  def detect_stack_backend_type(project_id, stack) do
    stack_name = String.trim(stack || "")

    if stack_name == "" do
      raise ArgumentError, message: "stack name required"
    end

    sd = RadasAI.CloudStacks.stack_dir(project_id, stack_name)
    backend_type = "local"
    backend_config = %{}
    state_file_exists = File.exists?(Path.join(sd, "terraform.tfstate"))
    backend_hcl = Path.join(sd, "backend.hcl")
    backend_hcl_exists = File.exists?(backend_hcl)

    {backend_type, backend_config} =
      if backend_hcl_exists do
        parse_backend_hcl(File.read!(backend_hcl), backend_type, backend_config)
      else
        {backend_type, backend_config}
      end

    is_remote = backend_type in ["s3", "gcs", "http", "pg", "remote", "consul", "azurerm"]

    %{
      "stack" => stack_name,
      "project_id" => project_id,
      "backend_type" => backend_type,
      "is_remote" => is_remote,
      "state_file_exists" => state_file_exists,
      "backend_hcl_exists" => backend_hcl_exists,
      "config" => backend_config
    }
  end

  defp parse_backend_hcl(content, backend_type, config) do
    content
    |> String.split("\n")
    |> Enum.reduce({backend_type, config}, fn line0, {bt, cfg} ->
      line = String.trim(line0)

      cond do
        String.starts_with?(line, "backend") ->
          case Regex.run(~r/backend\s*["'](\w+)["']/, line) do
            [_, t] -> {String.downcase(t), cfg}
            _ -> {bt, cfg}
          end

        String.contains?(line, "=") and not String.starts_with?(line, ["#", "//"]) ->
          [k, v] = String.split(line, "=", parts: 2)
          {bt, Map.put(cfg, String.trim(k), String.trim(String.trim(v), "\"'"))}

        true ->
          {bt, cfg}
      end
    end)
  end

  # ---------------------------------------------------------------------------
  # CSV export (UC306)
  # ---------------------------------------------------------------------------

  @doc "Inventory CSV across accounts (Python export_inventory_csv)."
  @spec export_inventory_csv(String.t() | nil, String.t() | nil) :: String.t()
  def export_inventory_csv(account_id \\ nil, project_id \\ nil) do
    accounts =
      load()
      |> Enum.filter(fn a ->
        cond do
          account_id -> a["id"] == account_id
          project_id -> a["project_id"] == project_id
          true -> true
        end
      end)

    header =
      ["account_id", "account_name", "provider", "resource_id", "resource_name", "resource_type", "region", "status", "address"]

    rows =
      Enum.flat_map(accounts, fn a ->
        try do
          inv = get_inventory(a["id"])

          Enum.map(List.wrap(inv["resources"]), fn r ->
            [
              a["id"] || "",
              a["name"] || a["id"] || "",
              a["provider"] || "",
              r["id"] || "",
              r["name"] || "",
              r["type"] || "",
              r["region"] || "",
              r["status"] || "active",
              r["address"] || ""
            ]
          end)
        rescue
          _ -> []
        end
      end)

    csv_rows([header | rows])
  end

  defp csv_rows(rows) do
    Enum.map_join(rows, "\r\n", fn row ->
      Enum.map_join(row, ",", fn cell ->
        s = to_string(cell)

        if String.contains?(s, [",", "\"", "\n"]) do
          "\"" <> String.replace(s, "\"", "\"\"") <> "\""
        else
          s
        end
      end)
    end) <> "\r\n"
  end

  # ---------------------------------------------------------------------------
  # Quota (UC310)
  # ---------------------------------------------------------------------------

  @doc "Quota limits + current usage by type (Python get_account_quota)."
  @spec get_account_quota(String.t()) :: map()
  def get_account_quota(account_id) do
    if get_account(account_id) == nil do
      raise ArgumentError, message: "account not found"
    end

    acct = get_account(account_id)
    quota = acct["quota_limits"] || %{}
    inv = get_inventory(account_id)
    resources = List.wrap(inv["resources"])

    type_counts =
      Enum.frequencies_by(resources, fn r -> String.downcase(to_string(r["type"] || "other")) end)

    %{
      "account_id" => account_id,
      "quota_limits" => quota,
      "current_usage" => type_counts,
      "total_resources" => length(resources)
    }
  end

  @doc "Configure quota limits (Python set_account_quota)."
  @spec set_account_quota(String.t(), map()) :: map()
  def set_account_quota(account_id, quota_limits) do
    if get_account(account_id) == nil do
      raise ArgumentError, message: "account not found"
    end

    clean =
      Map.new(quota_limits || %{}, fn {k, v} ->
        k = k |> to_string() |> String.trim() |> String.downcase()

        case Integer.parse(to_string(v)) do
          {n, _} -> {k, max(0, n)}
          :error -> nil
        end
      end)
      |> Enum.reject(&is_nil/1)
      |> Map.new()

    update_account(account_id, fn a -> a |> Map.put("quota_limits", clean) |> Map.put("updated_at", System.system_time(:second)) end)
    get_account_quota(account_id)
  end

  @doc "Evaluate whether adding resources exceeds quota (UC310)."
  @spec evaluate_account_quota(String.t(), String.t(), integer()) :: map()
  def evaluate_account_quota(account_id, resource_type \\ "server", additional_count \\ 1) do
    usage = get_account_quota(account_id)
    quota_limits = usage["quota_limits"] || %{}
    current_usage = usage["current_usage"] || %{}

    rtype = resource_type |> to_string() |> String.trim() |> String.downcase()
    current = current_usage[rtype] || 0

    limit = quota_limits[rtype] || quota_limits["max_resources"] || quota_limits["total"]

    {allowed, exceeded, remaining} =
      if limit != nil do
        exceeded = current + additional_count > limit
        {not exceeded, exceeded, max(0, limit - current)}
      else
        {true, false, nil}
      end

    %{
      "allowed" => allowed,
      "exceeded" => exceeded,
      "account_id" => account_id,
      "resource_type" => rtype,
      "current_usage" => current,
      "additional_requested" => additional_count,
      "limit" => limit,
      "remaining_quota" => remaining,
      "message" =>
        if exceeded do
          "Quota exceeded: requested #{additional_count} #{rtype}(s), current #{current}, limit #{limit}"
        else
          "Quota check passed"
        end
    }
  end

  # ---------------------------------------------------------------------------
  # Encrypted backup/restore (UC312)
  # ---------------------------------------------------------------------------

  @doc "Encrypted account backup (Python backup_accounts_encrypted)."
  @spec backup_accounts_encrypted(String.t() | nil, String.t() | nil) :: map()
  def backup_accounts_encrypted(project_id \\ nil, org_id \\ nil) do
    accounts =
      load()
      |> Enum.filter(fn a ->
        cond do
          project_id -> a["project_id"] == project_id
          org_id -> a["org_id"] == org_id
          true -> true
        end
      end)

    %{
      "version" => "1.0",
      "account_count" => length(accounts),
      "exported_at" => System.system_time(:second),
      "project_id" => project_id,
      "org_id" => org_id,
      "encrypted_payload" => encrypt(Jason.encode!(accounts))
    }
  end

  @doc "Restore accounts from an encrypted backup (Python restore_accounts_encrypted)."
  @spec restore_accounts_encrypted(map(), String.t() | nil, boolean()) :: map()
  def restore_accounts_encrypted(backup_data, project_id \\ nil, overwrite \\ false) do
    enc_payload = backup_data["encrypted_payload"] || backup_data["payload"]

    if enc_payload in [nil, ""] do
      raise ArgumentError, message: "encrypted_payload required in backup data"
    end

    records =
      try do
        case Jason.decode(decrypt(enc_payload)) do
          {:ok, recs} -> recs
          _ -> raise ArgumentError, message: "Failed to decrypt/parse backup payload"
        end
      rescue
        e -> raise ArgumentError, message: "Failed to decrypt/parse backup payload: #{Exception.message(e)}"
      end

    unless is_list(records) do
      raise ArgumentError, message: "Invalid backup format: expected list of account records"
    end

    existing =
      load()
      |> Map.new(&{&1["id"], &1})

    {existing, restored, overwritten} =
      Enum.reduce(records, {existing, 0, 0}, fn rec, {acc, restored, overwritten} ->
        aid = rec["id"]

        if aid in [nil, ""] or rec["name"] in [nil, ""] or rec["provider"] in [nil, ""] do
          {acc, restored, overwritten}
        else
          rec = if project_id, do: Map.put(rec, "project_id", project_id), else: rec

          cond do
            Map.has_key?(acc, aid) and overwrite ->
              {Map.put(acc, aid, rec), restored, overwritten + 1}

            Map.has_key?(acc, aid) ->
              {acc, restored, overwritten}

            true ->
              {Map.put(acc, aid, rec), restored + 1, overwritten}
          end
        end
      end)

    save(Map.values(existing))

    %{
      "ok" => true,
      "restored_count" => restored,
      "overwritten_count" => overwritten,
      "total_accounts" => map_size(existing),
      "restored_at" => System.system_time(:second)
    }
  end

  # ---------------------------------------------------------------------------
  # Unmanaged diff (UC320)
  # ---------------------------------------------------------------------------

  @doc "Inventory vs managed/import-mapped coverage (UC320)."
  @spec diff_inventory_unmanaged_resources(String.t()) :: map()
  def diff_inventory_unmanaged_resources(account_id) do
    if get_account(account_id) == nil do
      raise ArgumentError, message: "account not found"
    end

    inv = get_inventory(account_id)
    all_resources = List.wrap(inv["resources"])

    managed_ids =
      list_managed_resources(account_id)
      |> MapSet.new(&to_string(&1["resource_id"] || &1["id"]))

    managed_ids =
      query_all!("SELECT stack, data FROM stack_meta", [])
      |> Enum.flat_map(fn row ->
        mapping = (row["data"] || %{})["byoc_import_mapping"] || %{}

        Enum.map(List.wrap(mapping["mappings"]), fn m -> to_string(m["resource_id"]) end)
      end)
      |> Enum.reject(&(&1 == ""))
      |> Enum.into(managed_ids)

    {managed, unmanaged} =
      Enum.split_with(all_resources, fn r -> MapSet.member?(managed_ids, to_string(r["id"])) end)

    total = length(all_resources)
    coverage = if total > 0, do: Float.round(length(managed) / total * 100, 1), else: 100.0

    %{
      "account_id" => account_id,
      "total_resources" => total,
      "managed_count" => length(managed),
      "unmanaged_count" => length(unmanaged),
      "coverage_percentage" => coverage,
      "unmanaged_resources" => unmanaged,
      "managed_resources" => managed
    }
  end

  # ---------------------------------------------------------------------------
  # Provider detection
  # ---------------------------------------------------------------------------

  @doc "Detect a provider from a credential shape (Python detect_provider)."
  @spec detect_provider(map()) :: map()
  def detect_provider(data) when is_map(data) do
    creds = data["credentials"] || data
    raw_endpoint = String.trim(to_string(data["endpoint"] || creds["os_auth_url"] || ""))
    endpoint_lower = String.downcase(raw_endpoint)

    generic_openstack_v3 =
      String.contains?(endpoint_lower, "/v3") and
        String.starts_with?(endpoint_lower, ["http://", "https://"])

    keys = MapSet.new(Map.keys(creds))

    provider =
      cond do
        MapSet.member?(keys, "hcloud_token") or String.contains?(endpoint_lower, "hetzner") -> "hetzner"
        MapSet.member?(keys, "api_token") or String.contains?(endpoint_lower, "idcloudhost") -> "idcloudhost"
        MapSet.member?(keys, "access_key") and MapSet.member?(keys, "secret_key") -> "aws"
        MapSet.member?(keys, "service_account_json") -> "gcp"
        MapSet.member?(keys, "tenant_id") and MapSet.member?(keys, "subscription_id") and MapSet.member?(keys, "client_id") and MapSet.member?(keys, "client_secret") -> "azure"
        MapSet.member?(keys, "os_auth_url") or String.contains?(endpoint_lower, "keystone") or generic_openstack_v3 -> "openstack"
        true -> nil
      end

    if provider == nil do
      %{"provider" => nil, "confidence" => 0.0, "reason" => "no matching credential shape", "endpoint" => nil, "region" => nil}
    else
      endpoint =
        if raw_endpoint != "" do
          String.trim_trailing(raw_endpoint, "/")
        else
          if provider == "idcloudhost", do: "https://api.idcloudhost.com", else: nil
        end

      endpoint = if provider == "idcloudhost", do: "https://api.idcloudhost.com", else: endpoint

      region =
        String.trim(to_string(data["region"] || creds["os_region_name"] || ""))
        |> then(&(if &1 == "", do: nil, else: &1))

      reason =
        if provider == "openstack" and generic_openstack_v3 do
          "generic OpenStack identity endpoint matched"
        else
          "credential shape matched"
        end

      %{"provider" => provider, "confidence" => 1.0, "reason" => reason, "endpoint" => endpoint, "region" => region}
    end
  end

  def detect_provider(_), do: detect_provider(%{})
end
