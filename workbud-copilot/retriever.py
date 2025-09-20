import os
from langchain_community.vectorstores import FAISS

try:
    from ollama_embedder import OllamaEmbeddings
except Exception:
    OllamaEmbeddings = None

try:
    from langchain_huggingface import HuggingFaceEmbeddings
except Exception:
    HuggingFaceEmbeddings = None


def _get_embedder():
    if OllamaEmbeddings is not None:
        try:
            return OllamaEmbeddings()
        except Exception:
            pass
    if HuggingFaceEmbeddings is not None:
        return HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    raise RuntimeError("No embeddings backend available.")


def load_retriever(path: str = "faiss_index"):
    if not os.path.isdir(path):
        print("ℹ️ FAISS index not found at", path)
        return None
    try:
        emb = _get_embedder()
        db = FAISS.load_local(path, emb, allow_dangerous_deserialization=True)
        return db.as_retriever(search_kwargs={"k": 4})
    except Exception as e:
        print("⚠️ Failed to load FAISS index:", e)
        return None
