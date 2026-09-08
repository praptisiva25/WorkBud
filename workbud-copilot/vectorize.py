# vectorize.py

import os
import io
import requests

from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse

from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

from PyPDF2 import PdfReader


router = APIRouter()

INDEX_PATH = "faiss_index"


# ============================================================
# HUGGING FACE EMBEDDINGS
# ============================================================

embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)


# ============================================================
# LOAD / CREATE FAISS INDEX
# ============================================================

if os.path.exists(INDEX_PATH):
    try:
        db = FAISS.load_local(
            INDEX_PATH,
            embedding,
            allow_dangerous_deserialization=True,
        )

        print("✅ Loaded existing FAISS index")

    except Exception as e:
        print("⚠️ Could not load existing FAISS index:", e)
        print("🔄 Creating new FAISS index...")

        db = FAISS.from_texts(
            ["WorkBud document index initialized."],
            embedding,
        )

        db.save_local(INDEX_PATH)

else:
    print("ℹ️ Creating new FAISS index...")

    db = FAISS.from_texts(
        ["WorkBud document index initialized."],
        embedding,
    )

    db.save_local(INDEX_PATH)


# ============================================================
# VECTORIZE ENDPOINT
# ============================================================

@router.post("/api/copilot/vectorize")
async def vectorize(payload: dict = Body(...)):
    try:
        file_url = payload.get("fileUrl")
        filename = payload.get(
            "filename",
            "uploaded.txt"
        )

        if not file_url:
            raise HTTPException(
                status_code=400,
                detail="fileUrl missing.",
            )

        print("📥 Downloading:", filename)

        # --------------------------------------------------------
        # Download uploaded file
        # --------------------------------------------------------

        r = requests.get(
            file_url,
            timeout=20,
        )

        r.raise_for_status()

        raw = r.content

        # --------------------------------------------------------
        # Extract text
        # --------------------------------------------------------

        text = ""

        if filename.lower().endswith(".pdf"):

            print("📄 Extracting PDF text...")

            pdf = PdfReader(
                io.BytesIO(raw)
            )

            pages = []

            for page in pdf.pages:
                page_text = page.extract_text() or ""

                if page_text.strip():
                    pages.append(page_text)

            text = "\n".join(pages)

        else:

            print("📄 Reading text file...")

            text = raw.decode(
                "utf-8",
                errors="ignore",
            )

        # --------------------------------------------------------
        # Validate extracted text
        # --------------------------------------------------------

        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="No text extracted.",
            )

        print(
            f"📝 Extracted {len(text)} characters"
        )

        # --------------------------------------------------------
        # Add document to FAISS
        # --------------------------------------------------------

        db.add_texts(
            [text],
            metadatas=[
                {
                    "filename": filename
                }
            ],
        )

        # --------------------------------------------------------
        # Save index
        # --------------------------------------------------------

        db.save_local(
            INDEX_PATH
        )

        print(
            "✅ Vectorization complete:",
            filename
        )

        return JSONResponse(
            {
                "message": "Vectorization complete",
                "filename": filename,
                "characters": len(text),
            }
        )

    except HTTPException:
        raise

    except Exception as e:

        print(
            "❌ Vectorization error:",
            e
        )

        raise HTTPException(
            status_code=500,
            detail=f"Vectorization failed: {e}",
        )