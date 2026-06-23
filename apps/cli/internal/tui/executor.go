package tui

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"runtime"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/raizora/radas/v4/internal/ai"
)

type LocalIntentResultMsg struct {
	Content string
}

var globalTodos []string

func extractTodoTask(input string) string {
	words := strings.Fields(input)
	if len(words) > 2 {
		return strings.Join(words[2:], " ")
	}
	return "Tugas Baru"
}

func extractCity(input string) string {
	words := strings.Fields(strings.ToLower(input))
	for _, w := range words {
		switch w {
		case "cek", "cuaca", "di", "dong", "hari", "ini", "prakiraan", "ramalan", "tolong", "gimana", "sekarang", "pantau", "lihat", "info", "beritahu", "infokan", "informasikan", "ya", "sih":
			continue
		default:
			if len(w) > 0 {
				return strings.ToUpper(w[:1]) + w[1:]
			}
		}
	}
	return "Jakarta"
}

func executeLocalIntent(intent, input string) tea.Cmd {
	return func() tea.Msg {
		var result string
		switch intent {
		case "generate_code", "generate_test":
			// Memanggil Generator Service
			res, err := ai.GenerateCode(input, intent)
			if err != nil {
				return LocalIntentResultMsg{Content: fmt.Sprintf("Gagal memproses kode: %v", err)}
			}
			return LocalIntentResultMsg{Content: fmt.Sprintf("Berikut draft kodenya:\n\n%s\n\nApakah Anda ingin saya menyimpannya ke file?", res)}
		case "activity_monitor":
			if runtime.GOOS == "darwin" {
				out, _ := exec.Command("top", "-l", "1", "-n", "10").Output()
				result = "Top 10 Processes:\n\n" + string(out)
			} else {
				out, _ := exec.Command("top", "-b", "-n", "10").Output()
				result = "Activity Monitor:\n\n" + string(out)
			}
		case "cek_memory":
			if runtime.GOOS == "darwin" {
				out, _ := exec.Command("vm_stat").Output()
				result = "Memory Usage:\n\n" + string(out)
			} else {
				out, _ := exec.Command("free", "-h").Output()
				result = "Memory Usage:\n\n" + string(out)
			}
		case "cek_cuaca":
			city := extractCity(input)
			resp, err := http.Get("https://wttr.in/" + city + "?format=4")
			if err == nil {
				defer resp.Body.Close()
				body, _ := io.ReadAll(resp.Body)
				result = "Prakiraan Cuaca " + city + ":\n\n" + string(body)
			} else {
				result = "Gagal mengambil data cuaca."
			}
		case "baca_berita":
			// Fetch from open Indonesian News API
			resp, err := http.Get("https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.antaranews.com%2Frss%2Fterkini.xml")
			if err == nil {
				defer resp.Body.Close()
				var data struct {
					Items []struct {
						Title string `json:"title"`
						Link  string `json:"link"`
					} `json:"items"`
				}
				if json.NewDecoder(resp.Body).Decode(&data) == nil {
					var b strings.Builder
					b.WriteString("Berita Terbaru (Antara News):\n\n")
					for i, post := range data.Items {
						if i >= 5 {
							break
						}
						b.WriteString(fmt.Sprintf("- [%s](%s)\n", post.Title, post.Link))
					}
					result = b.String()
				} else {
					result = "Gagal membaca format berita."
				}
			} else {
				result = "Gagal mengambil berita."
			}
		case "kirim_whatsapp":
			result = "Membuka WhatsApp Web untuk mengirim pesan...\n(Mock: ✅ Pesan WA disiapkan untuk dikirim)"
		case "kirim_email":
			result = "Membuka Gmail untuk mengirim email...\n(Mock: ✅ Draft email berhasil dibuat)"
		case "setup_calendar":
			result = "Menambahkan acara ke Google Calendar...\n(Mock: ✅ Acara berhasil dijadwalkan)"
		case "baca_hn":
			resp, err := http.Get("https://hacker-news.firebaseio.com/v0/topstories.json")
			if err == nil {
				defer resp.Body.Close()
				var ids []int
				if json.NewDecoder(resp.Body).Decode(&ids) == nil {
					var b strings.Builder
					b.WriteString("HackerNews Top 5 Stories:\n\n")
					for i := 0; i < 5 && i < len(ids); i++ {
						url := fmt.Sprintf("https://hacker-news.firebaseio.com/v0/item/%d.json", ids[i])
						r, _ := http.Get(url)
						var item struct{ Title, Url string }
						json.NewDecoder(r.Body).Decode(&item)
						r.Body.Close()
						b.WriteString(fmt.Sprintf("- [%s](%s)\n", item.Title, item.Url))
					}
					result = b.String()
				} else {
					result = "Gagal membaca HackerNews."
				}
			} else {
				result = "Gagal menghubungi HackerNews."
			}
		case "tambah_todo":
			task := extractTodoTask(input)
			globalTodos = append(globalTodos, task)
			result = fmt.Sprintf("✅ Berhasil menambahkan Todo: %s\nTotal Todo: %d", task, len(globalTodos))
		case "selesai_todo":
			if len(globalTodos) > 0 {
				task := globalTodos[0]
				globalTodos = globalTodos[1:]
				result = fmt.Sprintf("✅ Menyelesaikan Todo: %s\nSisa Todo: %d", task, len(globalTodos))
			} else {
				result = "Semua pekerjaan sudah selesai! 🎉"
			}
		default:
			result = "Aksi lokal dijalankan: " + intent
		}

		return LocalIntentResultMsg{Content: result}
	}
}
