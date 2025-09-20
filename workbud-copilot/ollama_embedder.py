import requests
from langchain_core.embeddings import Embeddings
from typing import List

class OllamaEmbeddings(Embeddings):
    def __init__(self, model="nomic-embed-text", base_url="http://localhost:11434"):
        self.model = model
        self.base_url = base_url

    def embed_query(self, text: str) -> List[float]:
        payload = {"model": self.model, "prompt": text}
        try:
            res = requests.post(f"{self.base_url}/api/embeddings", json=payload, timeout=30)
            res.raise_for_status()
            return res.json()["embedding"]
        except requests.exceptions.RequestException as e:
            raise ValueError(f"Embedding error: {e}")

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self.embed_query(text) for text in texts]