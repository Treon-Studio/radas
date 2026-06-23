import json
import joblib
import numpy as np
import os

# Paths
base_dir = os.path.dirname(os.path.abspath(__file__))
dataset_path = os.path.join(base_dir, "command_dataset.json")
vectorizer_path = os.path.join(base_dir, "vectorizer.pkl")
export_path = os.path.abspath(os.path.join(base_dir, "..", "internal", "ai", "intent_model.json"))

# Load dataset
with open(dataset_path, "r") as f:
    dataset = json.load(f)

# Group by intent
intent_texts = {}
for d in dataset:
    intent = d["intent"]
    intent_texts.setdefault(intent, []).append(d["text"])

# Load vectorizer
vectorizer = joblib.load(vectorizer_path)

# Extract vocab and idf
vocab = {k: int(v) for k, v in vectorizer.vocabulary_.items()}
idf = vectorizer.idf_ if hasattr(vectorizer, "idf_") else vectorizer._tfidf.idf_

# Compute centroid for each intent
centroids = {}
for intent, texts in intent_texts.items():
    X = vectorizer.transform(texts)
    # Average the TF-IDF vectors to find the 'center' of this intent
    centroid = np.asarray(X.mean(axis=0)).flatten()
    centroids[intent] = centroid.tolist()

# Export for Go
model_export = {
    "vocab": vocab,
    "idf": idf.tolist(),
    "centroids": centroids
}

with open(export_path, "w") as f:
    json.dump(model_export, f)

print(f"Successfully exported lightweight intent model to:\n{export_path}")
