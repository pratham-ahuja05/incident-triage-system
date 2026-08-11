from sentence_transformers import SentenceTransformer

# Model loads once when this module is imported — not on every function call.
# This matters: loading the model is slow (~seconds), generating an embedding is fast (~ms).
model = SentenceTransformer("all-MiniLM-L6-v2")


def generate_embedding(text: str) -> list[float]:
    embedding = model.encode(text)
    return embedding.tolist()  # numpy array -> plain Python list, so it's JSON/DB friendly


if __name__ == "__main__":
    test_text = "Database connection timeout after 30 seconds"
    vec = generate_embedding(test_text)
    print(f"Embedding length: {len(vec)}")
    print(f"First 5 values: {vec[:5]}")