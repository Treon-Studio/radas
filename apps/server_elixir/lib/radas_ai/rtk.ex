defmodule RadasAI.RTK do
  @moduledoc """
  Port of `services/ai_router/rtk.py` — RTK token-saver filters.

  RADAS-native port of the upstream 9Router filter families: an ordered
  auto-detector plus pure text filters. Detection order mirrors upstream —
  git-log → git-diff → git-status → build-output → grep → find → tree → ls →
  read-numbered → dedup-log → smart-truncate — and payloads under 500 chars
  pass through unchanged. All filters are lossless-by-summary: they keep
  head/tail context and replace elided runs with explicit markers.
  """

  @min_compress_size 500
  @detect_window 1024
  @git_diff_hunk_max_lines 100
  @git_log_max_lines 200
  @dedup_line_max 2000
  @grep_per_file_max 10
  @find_per_dir_max 10
  @find_total_dir_max 20
  @status_max_files 10
  @tree_max_lines 200
  @smart_truncate_head 120
  @smart_truncate_tail 60
  @smart_truncate_min_lines 250
  @read_numbered_min_hit_ratio 0.7

  @re_git_diff ~r/^diff --git /m
  @re_git_diff_hunk ~r/^@@ /m
  @re_git_status ~r/^On branch |^nothing to commit|^Changes (not |to be )|^Untracked files:/m
  @re_git_log ~r/^[*|\/\\ ]*commit [0-9a-f]{7,40}$/m
  @re_porcelain ~r/^[ MADRCU?!][ MADRCU?!] \S/
  @re_build_output ~r/^(npm (warn|error|ERR!)|yarn (warn|error)|\s*Compiling\s+\S+|\s*Downloading\s+\S+|added \d+ package|\[ERROR\]|BUILD (SUCCESS|FAILED)|\s*Finished\s+|Successfully (installed|built)|ERROR:)/im
  @re_tree_glyph ~r/[├└]──|│  /
  @re_ls_row ~r/^[-dlbcps][rwx-]{9}/m
  @re_ls_total ~r/^total \d+$/m
  @re_read_numbered ~r/^\s*\d+[|│]/

  @filter_names %{
    "git_log" => "git-log",
    "git_diff" => "git-diff",
    "git_status" => "git-status",
    "build_output" => "build-output",
    "grep" => "grep",
    "find" => "find",
    "tree" => "tree",
    "ls" => "ls",
    "read_numbered" => "read-numbered",
    "dedup_log" => "dedup-log",
    "smart_truncate" => "smart-truncate"
  }

  @spec min_compress_size :: integer()
  def min_compress_size, do: @min_compress_size

  @doc "Compress one payload; returns {text, filter_name_or_empty}."
  @spec compress_text(String.t()) :: {String.t(), String.t()}
  def compress_text(text) when is_binary(text) do
    if String.length(text) < @min_compress_size do
      {text, ""}
    else
      case auto_detect_filter(text) do
        nil -> {text, ""}
        name -> {apply_filter(name, text), Map.fetch!(@filter_names, name)}
      end
    end
  end

  defp apply_filter(name, text) do
    case name do
      "git_log" -> filter_git_log(text)
      "git_diff" -> filter_git_diff(text)
      "git_status" -> filter_git_status(text)
      "build_output" -> filter_build_output(text)
      "grep" -> filter_grep(text)
      "find" -> filter_find(text)
      "tree" -> filter_tree(text)
      "ls" -> filter_ls(text)
      "read_numbered" -> filter_read_numbered(text)
      "dedup_log" -> filter_dedup_log(text)
      "smart_truncate" -> filter_smart_truncate(text)
    end
  end

  # ---------------------------------------------------------------------------
  # Filters
  # ---------------------------------------------------------------------------

  def filter_git_log(text, max_lines \\ @git_log_max_lines) do
    lines = String.split(text, "\n")

    if length(lines) <= max_lines do
      text
    else
      cut = length(lines) - max_lines
      (Enum.take(lines, max_lines) ++ ["... +#{cut} log lines truncated (RTK)"]) |> Enum.join("\n")
    end
  end

  def filter_git_diff(diff, max_hunk_lines \\ @git_diff_hunk_max_lines) do
    {out_rev, _kept, cut} =
      String.split(diff, "\n")
      |> Enum.reduce({[], 0, 0}, fn line, {out, kept, cut} ->
        cond do
          String.starts_with?(line, "diff --git ") or String.starts_with?(line, "@@ ") ->
            out = if cut > 0, do: out ++ ["... +#{cut} hunk lines truncated (RTK)"], else: out
            {out ++ [line], 0, 0}

          kept < max_hunk_lines ->
            {out ++ [line], kept + 1, cut}

          # Beyond the hunk cap: counted, not kept (mirrors Python).
          true ->
            {out, kept, cut + 1}
        end
      end)

    out = Enum.reverse(out_rev)
    out = if cut > 0, do: out ++ ["... +#{cut} hunk lines truncated (RTK)"], else: out
    Enum.join(out, "\n")
  end

  def filter_git_status(input_text) do
    lines = String.split(input_text, "\n")

    if lines == [] or (length(lines) == 1 and String.trim(hd(lines)) == "") do
      "Clean working tree"
    else
      parse_git_status(lines)
    end
  end

  defp parse_git_status(lines) do
    state =
      Enum.reduce(lines, %{branch: "", staged: [], modified: [], untracked: [], counts: %{staged: 0, modified: 0, untracked: 0}, conflicts: 0, clean: false}, fn
        raw, st ->
          cond do
            String.trim(raw) == "" ->
              st

            match = Regex.run(~r/^On branch (\S+)/, raw) ->
              %{st | branch: Enum.at(match, 1)}

            String.starts_with?(raw, "##") ->
              %{st | branch: raw |> String.slice(2..-1//1) |> String.trim()}

            match = Regex.run(~r/^([ MADRCU?!][ MADRCU?!]) (.+)$/, raw) ->
              pair = Enum.at(match, 1)
              path = Enum.at(match, 2)
              x = String.at(pair, 0)
              y = String.at(pair, 1)

              cond do
                String.slice(pair, 0, 2) == "??" ->
                  st |> add_group(:untracked, path) |> bump(:untracked)

                String.contains?("MADRC", x) or String.contains?("MADRC", y) ->
                  key = if x != " ", do: :staged, else: :modified
                  st |> add_group(key, path) |> bump(key)

                x == "U" or y == "U" ->
                  %{st | conflicts: st.conflicts + 1}

                true ->
                  st |> add_group(:modified, path) |> bump(:modified)
              end

            Regex.match?(~r/^\s*(modified|new file|deleted|renamed):/, raw) ->
              path = raw |> String.split(":", parts: 2) |> Enum.at(1) |> to_string() |> String.trim()
              st |> add_group(:modified, path) |> bump(:modified)

            String.contains?(raw, "Untracked files") ->
              st

            String.contains?(raw, "nothing to commit") ->
              %{st | clean: true}

            true ->
              st
          end
      end)

    if state.clean do
      "Clean working tree"
    else
      render_git_status(state)
    end
  end

  defp add_group(st, key, path) do
    kept = Map.fetch!(st, key)

    if length(kept) < @status_max_files do
      Map.put(st, key, kept ++ [path])
    else
      st
    end
  end

  defp bump(st, key) do
    Map.update!(st, :counts, &Map.update!(&1, key, fn c -> c + 1 end))
  end

  defp render_git_status(state) do
    header = if state.branch != "", do: "* #{state.branch}", else: "* (detached)"

    sections =
      for {key, title} <- [staged: "+ Staged", modified: "~ Modified", untracked: "? Untracked"] do
        count = state.counts[key]

        if count > 0 do
          kept = Map.fetch!(state, key)
          paths = Enum.map(kept, &("  " <> &1))

          more =
            if count > length(kept), do: ["  ... +#{count - length(kept)} more (RTK)"], else: []

          [title <> ": #{count} files" | paths ++ more]
        else
          []
        end
      end

    out = [header | Enum.flat_map(sections, & &1)]
    out = if state.conflicts > 0, do: out ++ ["conflicts: #{state.conflicts} files"], else: out

    total = state.counts.staged + state.counts.modified + state.counts.untracked

    if total == 0 and state.conflicts == 0 do
      "Clean working tree"
    else
      Enum.join(out, "\n")
    end
  end

  def filter_build_output(input_text) do
    {out_rev, run_label, run_count} =
      String.split(input_text, "\n")
      |> Enum.reduce({[], nil, 0}, fn line, {out, run_label, run_count} ->
        case Regex.run(~r/^\s*(Compiling|Downloading)\s+(\S+)/, line) do
          [_, verb, pkg] ->
            label = "#{verb} #{pkg}"

            if run_label != nil and String.starts_with?(run_label, verb) do
              {out, run_label, run_count + 1}
            else
              out = flush_run(out, run_label, run_count)
              {out, label, 1}
            end

          nil ->
            out = flush_run(out, run_label, run_count)
            {out ++ [line], nil, 0}
        end
      end)

    out = flush_run(Enum.reverse(out_rev), run_label, run_count)
    Enum.join(out, "\n")
  end

  defp flush_run(out, nil, _count), do: out

  defp flush_run(out, run_label, run_count) do
    if run_count > 1, do: out ++ ["#{run_label} (#{run_count} packages)"], else: out ++ [run_label]
  end

  def filter_grep(input_text) do
    {per_file, counts, order_rev} =
      String.split(input_text, "\n")
      |> Enum.reduce({%{}, %{}, []}, fn line, {per_file, counts, order_rev} ->
        if String.trim(line) == "" do
          {per_file, counts, order_rev}
        else
          file =
            case String.split(line, ":", parts: 2) do
              [head, _] -> head
              [_] -> "(no-file)"
            end

          new? = not Map.has_key?(per_file, file)
          per_file = Map.update(per_file, file, [line], &[line | &1])
          counts = Map.update(counts, file, 1, &(&1 + 1))
          order_rev = if new?, do: [file | order_rev], else: order_rev
          {per_file, counts, order_rev}
        end
      end)

    order = Enum.reverse(order_rev)

    out =
      Enum.flat_map(order, fn file ->
        kept = per_file[file] |> Enum.reverse() |> Enum.take(@grep_per_file_max)
        total = counts[file]

        more =
          if total > @grep_per_file_max,
            do: ["... #{file}: +#{total - @grep_per_file_max} more matches (RTK)"],
            else: []

        kept ++ more
      end)

    Enum.join(out, "\n")
  end

  def filter_find(input_text) do
    {dirs, order_rev} =
      String.split(input_text, "\n")
      |> Enum.reduce({%{}, []}, fn line, {dirs, order_rev} ->
        if String.trim(line) == "" do
          {dirs, order_rev}
        else
          directory =
            if String.contains?(line, "/") do
              line |> String.split("/") |> Enum.drop(-1) |> Enum.join("/")
            else
              "."
            end

          new? = not Map.has_key?(dirs, directory)
          dirs = Map.update(dirs, directory, [line], &[line | &1])
          order_rev = if new?, do: [directory | order_rev], else: order_rev
          {dirs, order_rev}
        end
      end)

    kept_dirs = order_rev |> Enum.reverse() |> Enum.take(@find_total_dir_max)

    out =
      Enum.flat_map(kept_dirs, fn directory ->
        entries = dirs[directory] |> Enum.reverse()
        kept = Enum.take(entries, @find_per_dir_max)

        more =
          if length(entries) > @find_per_dir_max,
            do: ["... #{directory}: +#{length(entries) - @find_per_dir_max} more files (RTK)"],
            else: []

        kept ++ more
      end)

    out =
      if length(order_rev) > @find_total_dir_max do
        out ++ ["... +#{length(order_rev) - @find_total_dir_max} more directories (RTK)"]
      else
        out
      end

    Enum.join(out, "\n")
  end

  def filter_tree(input_text) do
    lines = String.split(input_text, "\n")

    if length(lines) <= @tree_max_lines do
      input_text
    else
      cut = length(lines) - @tree_max_lines
      (Enum.take(lines, @tree_max_lines) ++ ["... +#{cut} tree lines truncated (RTK)"]) |> Enum.join("\n")
    end
  end

  def filter_ls(input_text) do
    lines = String.split(input_text, "\n")
    rows = Enum.filter(lines, &Regex.match?(@re_ls_row, &1))

    if length(rows) <= @status_max_files * 3 do
      input_text
    else
      total = Enum.find(lines, &Regex.match?(@re_ls_total, &1))

      exts =
        Enum.reduce(rows, %{}, fn row, acc ->
          name = row |> String.split() |> Enum.reverse() |> hd()

          ext =
            if String.contains?(name, ".") do
              name |> String.split(".") |> Enum.reverse() |> hd()
            else
              "(none)"
            end

          Map.update(acc, ext, 1, &(&1 + 1))
        end)

      top =
        exts
        |> Enum.sort(fn {_, c1}, {_, c2} -> c1 >= c2 end)
        |> Enum.take(5)
        |> Enum.map(fn {ext, count} -> "#{ext}x#{count}" end)
        |> Enum.join(", ")

      out =
        (if total, do: [total], else: []) ++
          ["[#{length(rows)} entries: #{top}] (RTK)"] ++
          Enum.take(rows, @status_max_files) ++
          ["... +#{length(rows) - @status_max_files} more entries (RTK)"]

      Enum.join(out, "\n")
    end
  end

  def filter_read_numbered(input_text) do
    {out_rev, _blank, _prev} =
      String.split(input_text, "\n")
      |> Enum.reduce({[], 0, nil}, fn line, {out, blank_streak, prev} ->
        cond do
          String.trim(line) == "" ->
            out = if blank_streak < 1, do: out ++ [line], else: out
            {out, blank_streak + 1, nil}

          line == prev ->
            {out, 0, prev}

          true ->
            {out ++ [line], 0, line}
        end
      end)

    Enum.join(Enum.reverse(out_rev), "\n")
  end

  def filter_dedup_log(input_text) do
    {out_rev, prev, run_count, _truncated?} =
      String.split(input_text, "\n")
      |> Enum.reduce({[], nil, 0, false}, fn line, {out, prev, run_count, truncated?} ->
        if truncated? do
          {out, prev, run_count, true}
        else
          cond do
            String.trim(line) == "" ->
              out = flush_dup(out, prev, run_count)
              {out, nil, 0, false}

            line == prev ->
              {out, prev, run_count + 1, false}

            true ->
              out = flush_dup(out, prev, run_count)
              out = out ++ [line]

              if length(out) >= @dedup_line_max do
                {out ++ ["... (truncated at #{@dedup_line_max} lines) (RTK)"], line, 1, true}
              else
                {out, line, 1, false}
              end
          end
        end
      end)

    # Tail flush: a trailing duplicate run is summarized after the loop,
    # mirroring Python's post-loop flush (truncated runs already emitted it).
    out_rev =
      if prev != nil and run_count > 1 and not Enum.any?(out_rev, &String.contains?(&1, "(truncated at")) do
        ["  ... (#{run_count - 1} duplicate lines)" | out_rev]
      else
        out_rev
      end

    Enum.join(Enum.reverse(out_rev), "\n")
  end

  defp flush_dup(out, nil, _run_count), do: out
  defp flush_dup(out, _prev, run_count) when run_count > 1, do: out ++ ["  ... (#{run_count - 1} duplicate lines)"]
  defp flush_dup(out, _prev, _run_count), do: out

  def filter_smart_truncate(input_text) do
    lines = String.split(input_text, "\n")

    if length(lines) < @smart_truncate_min_lines do
      input_text
    else
      head = Enum.take(lines, @smart_truncate_head)
      tail = Enum.take(lines, -@smart_truncate_tail)
      cut = length(lines) - length(head) - length(tail)
      Enum.join(head ++ ["... +#{cut} lines truncated (RTK)"] ++ tail, "\n")
    end
  end

  # ---------------------------------------------------------------------------
  # Auto-detection
  # ---------------------------------------------------------------------------

  @doc "Detect the matching filter for a payload; nil when none applies."
  @spec auto_detect_filter(String.t()) :: String.t() | nil
  def auto_detect_filter(text) do
    head = String.slice(text, 0, @detect_window)
    lines = String.split(text, "\n")
    non_empty = Enum.filter(String.split(head, "\n"), &(String.trim(&1) != ""))

    cond do
      Regex.match?(@re_git_log, head) ->
        "git_log"

      Regex.match?(@re_git_diff, head) or Regex.match?(@re_git_diff_hunk, head) ->
        "git_diff"

      Regex.match?(@re_git_status, head) ->
        "git_status"

      Regex.match?(@re_build_output, head) ->
        "build_output"

      non_empty != [] and porcelain_ratio(non_empty) >= 0.7 ->
        "git_status"

      non_empty |> Enum.take(5) |> Enum.any?(&grep_line?/1) ->
        "grep"

      length(non_empty) >= 3 and Enum.all?(non_empty, &path_like?/1) ->
        "find"

      Regex.match?(@re_tree_glyph, head) ->
        "tree"

      Regex.match?(@re_ls_total, head) or length(Regex.scan(@re_ls_row, head)) >= 3 ->
        "ls"

      length(lines) >= 20 and read_numbered_ratio(lines) >= @read_numbered_min_hit_ratio ->
        "read_numbered"

      length(non_empty) >= 5 ->
        "dedup_log"

      length(lines) >= @smart_truncate_min_lines ->
        "smart_truncate"

      true ->
        nil
    end
  end

  defp porcelain_ratio(non_empty) do
    matches = Enum.count(non_empty, &Regex.match?(@re_porcelain, &1))
    matches / length(non_empty)
  end

  # Python `_is_grep_line`: the segment between the first two colons is a line
  # number (e.g. "app.py:42:def f()").
  defp grep_line?(line) do
    case String.split(line, ":", parts: 3) do
      [_file, middle, _rest] -> middle != "" and String.match?(middle, ~r/^\d+$/)
      _ -> false
    end
  end

  defp path_like?(line), do: not String.contains?(line, ":") and String.contains?(line, "/")

  defp read_numbered_ratio(lines) do
    matches = Enum.count(lines, &Regex.match?(@re_read_numbered, &1))
    matches / length(lines)
  end

  @doc "Filter display names (internal name → upstream family name)."
  @spec filter_names() :: %{String.t() => String.t()}
  def filter_names, do: @filter_names
end
