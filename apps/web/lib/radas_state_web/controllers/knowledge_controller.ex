defmodule RadasStateWeb.KnowledgeController do
  use RadasStateWeb, :controller
  alias RadasState.Knowledges

  def index(conn, _params) do
    notes = Knowledges.list_notes()
    render(conn, "index.json", notes: notes)
  end

  def show(conn, %{"id" => id}) do
    note = Knowledges.get_note!(id)
    render(conn, "show.json", note: note)
  end

  def create(conn, %{"note" => note_params}) do
    with {:ok, note} <- Knowledges.create_note(note_params) do
      conn
      |> put_status(:created)
      |> render("show.json", note: note)
    end
  end

  def update(conn, %{"id" => id, "note" => note_params}) do
    note = Knowledges.get_note!(id)
    with {:ok, note} <- Knowledges.update_note(note, note_params) do
      render(conn, "show.json", note: note)
    end
  end

  def delete(conn, %{"id" => id}) do
    note = Knowledges.get_note!(id)
    with {:ok, _} <- Knowledges.delete_note(note) do
      send_resp(conn, :no_content, "")
    end
  end
end
