# vectorize.py
import os, io, requests
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse
from langchain_community.vectorstores import FAISS
from PyPDF2 import PdfReader
from ollama_embedder import OllamaEmbeddings

router = APIRouter()
INDEX_PATH = "faiss_index"
embedding = OllamaEmbeddings()

if os.path.exists(INDEX_PATH):
    db = FAISS.load_local(INDEX_PATH, embedding, allow_dangerous_deserialization=True)
else:
    db = FAISS.from_texts(["init"], embedding)
    db.save_local(INDEX_PATH)

@router.post("/api/copilot/vectorize")
async def vectorize(payload: dict = Body(...)):
    try:
        file_url = payload.get("fileUrl")
        filename = payload.get("filename", "uploaded.txt")

        if not file_url:
            raise HTTPException(status_code=400, detail="fileUrl missing.")

        r = requests.get(file_url, timeout=20)
        r.raise_for_status()
        raw = r.content

        text = ""
        if filename.lower().endswith(".pdf"):
            pdf = PdfReader(io.BytesIO(raw))
            text = "\n".join([p.extract_text() or "" for p in pdf.pages])
        else:
            text = raw.decode("utf-8", errors="ignore")

        if not text.strip():
            raise HTTPException(status_code=400, detail="No text extracted.")

        db.add_texts([text], metadatas=[{"filename": filename}])
        db.save_local(INDEX_PATH)

        return JSONResponse({"message": "Vectorization complete"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vectorization failed: {e}")
