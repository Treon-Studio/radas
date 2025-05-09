defmodule RadasStateWeb.KnowledgeJSON do
  def index(%{notes: notes}) do
    %{data: Enum.map(notes, &note/1)}
  end

  def show(%{note: note}) do
    %{data: note(note)}
  end

  defp note(note) do
    %{
      id: note.id,
      title: note.title,
      content: note.content,
      tags: note.tags,
      inserted_at: note.inserted_at,
      updated_at: note.updated_at
    }
  end
end
