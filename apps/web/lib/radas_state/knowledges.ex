defmodule RadasState.Knowledges do
  @moduledoc """
  Context for Knowledge (Notes) Management
  """
  import Ecto.Query, warn: false
  alias RadasState.Repo
  alias RadasState.Knowledge
  alias RadasState.Services.KnowledgeService
  alias RadasState.Notification
  alias RadasState.AuditLog
  alias RadasState.Jobs

  def list_notes do
    Repo.all(Knowledge)
  end

  def get_note!(id), do: Repo.get!(Knowledge, id)

  def create_note(attrs \\ %{}, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      # Validasi unik title
      title = Map.get(attrs, "title") || Map.get(attrs, :title)
      if Repo.get_by(Knowledge, title: title) do
        {:error, :title_taken}
      else
        result =
          %Knowledge{}
          |> Knowledge.changeset(attrs)
          |> Repo.insert()

        if match?({:ok, _}, result) do
          KnowledgeService.after_create(result)
          Notification.send(:note_created, result)
          AuditLog.log(:create, :note, result)
          Jobs.enqueue(:note_created, result)
        end

        result
      end
    end
  end

  def update_note(%Knowledge{} = note, attrs, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      title = Map.get(attrs, "title") || Map.get(attrs, :title)
      cond do
        title && title != note.title ->
          case Repo.get_by(Knowledge, title: title) do
            %Knowledge{id: id} when id != note.id -> {:error, :title_taken}
            _ ->
              do_update_note(note, attrs)
          end
        true ->
          do_update_note(note, attrs)
      end
    end
  end

  defp do_update_note(note, attrs) do
    result =
      note
      |> Knowledge.changeset(attrs)
      |> Repo.update()

    if match?({:ok, _}, result) do
      KnowledgeService.after_update(result)
      Notification.send(:note_updated, result)
      AuditLog.log(:update, :note, result)
      Jobs.enqueue(:note_updated, result)
    end
    result
  end

  def delete_note(%Knowledge{} = note, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      result = Repo.delete(note)

      if match?({:ok, _}, result) do
        KnowledgeService.after_delete(result)
        Notification.send(:note_deleted, result)
        AuditLog.log(:delete, :note, result)
        Jobs.enqueue(:note_deleted, result)
      end
      result
    end
  end

  def change_note(%Knowledge{} = note, attrs \\ %{}) do
    Knowledge.changeset(note, attrs)
  end
end
