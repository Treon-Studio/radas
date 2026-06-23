import json
import itertools
import random
import os

# Template components for enrichment
PREFIXES = ["", "tolong", "bisa tolong", "coba", "bantu", "ai", "radas", "halo radas", "tolong dong", "coba dong", "bisakah", "mohon", "hai", "halo", "bro", "min", "tolong bantu", "mohon bantu", "coba bantu", "bisa bantu"]
SUFFIXES = ["", "dong", "ya", "sekarang", "pls", "please", "kalo bisa", "secepatnya", "segera", "hari ini"]

INTENTS = {
    "baca_berita": {
        "verbs": ["baca", "bacakan", "tampilkan", "lihat", "lihatkan", "cari", "carikan", "cek", "cekkan", "buka", "bukakan", "beri tahu", "kasih tahu", "infokan", "informasikan", "update"],
        "nouns": ["berita", "news", "kabar", "informasi berita", "artikel", "berita terbaru", "berita hari ini", "berita terkini", "kabar terbaru", "kabar terkini", "kabar hari ini", "berita viral", "berita tren"]
    },
    "activity_monitor": {
        "verbs": ["buka", "tampilkan", "lihat", "cek", "jalankan", "start", "pantau", "monitor", "awasi", "tunjukkan", "periksa", "hidupkan", "nyalakan"],
        "nouns": ["activity monitor", "task manager", "sistem monitor", "penggunaan sistem", "proses", "process list", "resource monitor", "system monitor", "aktivitas sistem", "monitoring", "cpu monitor"]
    },
    "cek_memory": {
        "verbs": ["cek", "tampilkan", "lihat", "berapa", "hitung", "ukur", "pantau", "periksa", "tunjukkan", "beri tahu", "infokan", "status", "analisa"],
        "nouns": ["usage memory", "penggunaan memory", "memori", "RAM", "usage RAM", "sisa RAM", "pemakaian RAM", "kapasitas RAM", "penggunaan RAM", "memori komputer", "memory usage", "free memory", "kapasitas memory"]
    },
    "cek_cuaca": {
        "verbs": ["cek", "lihat", "tampilkan", "info", "pantau", "beritahu", "beri tahu", "infokan", "informasikan", "gimana"],
        "nouns": ["cuaca", "hujan", "panas", "prakiraan cuaca", "kondisi cuaca", "cuaca hari ini", "ramalan cuaca"]
    },
    "kirim_whatsapp": {
        "verbs": ["kirim", "kirimkan", "send", "chat", "whatsapp", "wa", "hubungi", "pesan"],
        "nouns": ["whatsapp", "wa", "pesan", "chat", "message"]
    },
    "kirim_email": {
        "verbs": ["kirim", "kirimkan", "send", "email", "gmail", "surat", "balas"],
        "nouns": ["email", "gmail", "mail", "pesan", "surat", "inbox"]
    },
    "setup_calendar": {
        "verbs": ["setup", "buat", "tambah", "jadwal", "ingatkan", "set", "atur", "jadwalkan"],
        "nouns": ["kalender", "calendar", "jadwal", "meeting", "acara", "event", "rapat", "agenda"]
    },
    "baca_hn": {
        "verbs": ["baca", "lihat", "cek", "tampilkan", "buka"],
        "nouns": ["hn", "hackernews", "hacker", "news"]
    },
    "tambah_todo": {
        "verbs": ["tambah", "tambahkan", "buat", "catat", "ingat", "bikin"],
        "nouns": ["todo", "tugas", "kerjaan", "pekerjaan", "task", "list", "catatan", "kegiatan"]
    },
    "selesai_todo": {
        "verbs": ["selesai", "selesaikan", "coret", "hapus", "tutup", "beres", "bereskan", "tandai"],
        "nouns": ["todo", "tugas", "kerjaan", "pekerjaan", "task", "list"]
    }
}

def generate_sentences(intent, components):
    sentences = []
    # Cartesian product of Prefix x Verb x Noun x Suffix
    for p, v, n, s in itertools.product(PREFIXES, components["verbs"], components["nouns"], SUFFIXES):
        parts = [x for x in (p, v, n, s) if x]
        sentence = " ".join(parts)
        sentences.append({"text": sentence, "intent": intent})
    return sentences

if __name__ == "__main__":
    print("Generating dataset to enrich possibilities...")
    dataset = []
    for intent, components in INTENTS.items():
        sentences = generate_sentences(intent, components)
        dataset.extend(sentences)
        print(f"Generated {len(sentences):,} variations for '{intent}'")
    
    # Shuffle the dataset
    random.seed(42)
    random.shuffle(dataset)
    
    print(f"\nTotal possibilities generated: {len(dataset):,}")
    
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_file = os.path.join(output_dir, "command_dataset.json")
    
    with open(output_file, "w") as f:
        json.dump(dataset, f, indent=2)
    
    print(f"Saved dataset to {output_file}!")
    
    # Attempt actual vectorization if scikit-learn is available
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        import joblib
        print("\nVectorizing using TF-IDF...")
        vectorizer = TfidfVectorizer(max_features=5000)
        texts = [d["text"] for d in dataset]
        X = vectorizer.fit_transform(texts)
        print(f"Vectorized shape: {X.shape} (samples x features)")
        
        model_file = os.path.join(output_dir, "vectorizer.pkl")
        joblib.dump(vectorizer, model_file)
        print(f"Saved vectorizer model to {model_file}!")
    except ImportError:
        print("\n[INFO] scikit-learn not installed. Skipping ML vectorizer generation.")
        print("If you want actual vector embeddings or TF-IDF models, run:")
        print("  pip install scikit-learn")
        print("and then re-run this script.")
