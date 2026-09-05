defmodule RadasAI.WebhookDispatcher do
  @moduledoc """
  Port of `services/webhook_dispatcher.py` — outbound webhooks stored in the
  kv_store `webhooks` scope (list under the "default" key). Delivery is async
  (Task), HMAC-SHA256 signed, 3 attempts, 5s timeout, best-effort.
  """

  import RadasAI.DB

  alias RadasAI.KV

  defp load_webhooks do
    case KV.load("webhooks") do
      v when is_list(v) -> Enum.filter(v, &is_map/1)
      _ -> []
    end
  end

  defp save_webhooks(items), do: KV.save("webhooks", Enum.filter(items, &is_map/1))

  @doc "Create one webhook subscription (Python create_webhook)."
  @spec create_webhook(String.t(), [String.t()], String.t()) :: map()
  def create_webhook(url, events, secret \\ "") do
    now = System.system_time(:second)

    wh = %{
      "id" => Ecto.UUID.generate(),
      "url" => to_string(url),
      "events" => Enum.map(List.wrap(events || []), &to_string/1),
      "secret" => to_string(secret || ""),
      "enabled" => true,
      "created_at" => now,
      "updated_at" => now
    }

    save_webhooks([wh | load_webhooks()])
    wh
  end

  @doc "Update one webhook; returns nil when not found."
  @spec update_webhook(String.t(), map()) :: map() | nil
  def update_webhook(webhook_id, updates) do
    items = load_webhooks()

    {updated, rest} =
      Enum.split_with(items, &(&1["id"] == webhook_id))

    case updated do
      [] ->
        nil

      [wh] ->
        wh =
          wh
          |> Map.merge(Map.new(updates || %{}, fn {k, v} -> {to_string(k), v} end))
          |> Map.put("updated_at", System.system_time(:second))

        save_webhooks([wh | rest])
        wh
    end
  end

  @doc "Delete one webhook; returns false when not found."
  @spec delete_webhook(String.t()) :: boolean()
  def delete_webhook(webhook_id) do
    items = load_webhooks()
    rest = Enum.reject(items, &(&1["id"] == webhook_id))

    if length(rest) == length(items) do
      false
    else
      save_webhooks(rest)
      true
    end
  end

  @doc """
  Fire `event` to every enabled webhook subscribed to it (async, fail-open).
  Returns the number of dispatches started (Python dispatch_event).
  """
  @spec dispatch_event(String.t(), map()) :: integer()
  def dispatch_event(event, payload) do
    body = Jason.encode!(payload || %{})

    targets =
      Enum.filter(load_webhooks(), fn wh ->
        wh["enabled"] and event in List.wrap(wh["events"] || [])
      end)

    Enum.each(targets, fn wh ->
      Task.start(fn -> deliver(wh, event, body) end)
    end)

    length(targets)
  rescue
    _ -> 0
  end

  defp deliver(wh, event, body) do
    headers = %{
      "content-type" => "application/json",
      "user-agent" => "radas-webhook/1.0",
      "x-radas-event" => event
    }

    headers =
      if wh["secret"] not in [nil, ""] do
        Map.put(headers, "x-radas-signature", "sha256=" <> sign(wh["secret"], body))
      else
        headers
      end

    Enum.reduce_while(1..3, :ok, fn attempt, _acc ->
      case Req.post(wh["url"], body: body, headers: headers, retry: false) do
        {:ok, %Req.Response{status: s}} when s in 200..299 ->
          {:halt, :ok}

        _ ->
          if attempt == 3, do: {:halt, :error}, else: {:cont, :retry}
      end
    end)

    :ok
  rescue
    _ -> :error
  end

  defp sign(secret, body) do
    :crypto.mac(:hmac, :sha256, secret, body) |> Base.encode16(case: :lower)
  end

  @doc "Redact a probe detail line (Python _safe_probe_detail lives in byoc; shared helper)."
  @spec redact_detail(String.t()) :: String.t()
  def redact_detail(value) do
    text = to_string(value || "")

    Enum.reduce(["password", "token", "secret", "apikey", "authorization"], text, fn marker, acc ->
      Regex.replace(
        ~r/(#{marker}\s*[=:]\s*)[^,;\s}]+/i,
        acc,
        "\\1[REDACTED]"
      )
    end)
    |> String.slice(0, 200)
  end
end
