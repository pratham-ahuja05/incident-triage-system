"""Offline test setup: no database, no embedding model download, no LLM provider calls."""

import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("GROQ_API_KEY", "test-key")
os.environ["SLACK_WEBHOOK_URL"] = ""

# The real module loads a sentence-transformers model at import time; tests never need real vectors.
embeddings = types.ModuleType("embeddings")
embeddings.generate_embedding = lambda text: [0.0] * 384
sys.modules["embeddings"] = embeddings
