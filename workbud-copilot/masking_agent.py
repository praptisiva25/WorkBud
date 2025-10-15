# masking_agent.py
import os
import io
import uuid
import numpy as np
import torch
import requests
from pathlib import Path
from PIL import Image
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Tuple

# Doctr
os.environ["USE_TORCH"] = "1"
os.environ["DOCTR_BACKEND"] = "pytorch"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

from doctr.models import ocr_predictor
from doctr.io import DocumentFile  # for pdfs

app = FastAPI(title="WorkBud Masking Agent", version="1.4 (KD phrases → TXT)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("[masking_agent] Loading Doctr OCR model...")
ocr_model = ocr_predictor("db_resnet50", "parseq", pretrained=True)
print("[masking_agent] OCR model ready.")

# Where to save slim SLM text files
OCR_DIR = Path(os.getenv("OCR_DIR", Path.cwd() / "ocr")).resolve()
OCR_DIR.mkdir(parents=True, exist_ok=True)
print(f"[masking_agent] OCR output dir = {OCR_DIR}")

class OCRReq(BaseModel):
    file_url: str
    filename: str | None = None
    source: str | None = None
    # optional tuning knobs
    y_threshold: int | None = 15
    x_threshold: int | None = 20
    min_conf: float | None = 0.0  # e.g., 0.5 to filter low-conf words

# -------------------- KD-style post-processing (threshold version) --------------------

class PostProcessor:
    """
    Lightweight grouping:
      1) add_centers()
      2) group_into_lines(y_threshold)
      3) merge_neighbor_tokens(x_threshold) -> phrases
    tokens format: {"value", "bbox":[x0,y0,x1,y1], "confidence":float, "page": int}
    """
    def __init__(self, tokens: List[Dict[str, Any]]):
        self.tokens = tokens
        self.lines: List[List[Dict[str, Any]]] = []
        self.phrases: List[Dict[str, Any]] = []

    @staticmethod
    def _center(b: List[int]) -> Tuple[float, float]:
        x0, y0, x1, y1 = b
        return ((x0 + x1) / 2.0, (y0 + y1) / 2.0)

    @staticmethod
    def _merge_bbox(items: List[Dict[str, Any]]) -> List[int]:
        x0 = min(t["bbox"][0] for t in items)
        y0 = min(t["bbox"][1] for t in items)
        x1 = max(t["bbox"][2] for t in items)
        y1 = max(t["bbox"][3] for t in items)
        return [x0, y0, x1, y1]

    def add_centers(self):
        for t in self.tokens:
            t["center"] = self._center(t["bbox"])
        return self

    def group_into_lines(self, y_threshold: int = 15):
        sorted_by_y = sorted(self.tokens, key=lambda t: t["center"][1])
        for tok in sorted_by_y:
            placed = False
            for line in self.lines:
                if abs(line[0]["center"][1] - tok["center"][1]) < y_threshold:
                    line.append(tok)
                    placed = True
                    break
            if not placed:
                self.lines.append([tok])
        for line in self.lines:
            line.sort(key=lambda t: t["center"][0])
        return self

    def merge_neighbor_tokens(self, x_threshold: int = 20):
        phrases: List[Dict[str, Any]] = []
        for line in self.lines:
            if not line:
                continue
            current = [line[0]]
            for tok in line[1:]:
                prev = current[-1]
                gap = tok["bbox"][0] - prev["bbox"][2]
                if gap < x_threshold:
                    current.append(tok)
                else:
                    phrases.append({
                        "value": " ".join(t["value"] for t in current),
                        "bbox": self._merge_bbox(current),
                        "mean_conf": float(np.mean([t.get("confidence", 0.0) for t in current])),
                    })
                    current = [tok]
            phrases.append({
                "value": " ".join(t["value"] for t in current),
                "bbox": self._merge_bbox(current),
                "mean_conf": float(np.mean([t.get("confidence", 0.0) for t in current])),
            })
        self.phrases = phrases
        return self

    def result(self) -> Dict[str, Any]:
        return {"lines": self.lines, "phrases": self.phrases}

# -------------------- OCR helpers --------------------

def _download_to_bytes(url: str) -> bytes:
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return r.content

def _ocr_image_array(img: np.ndarray, min_conf: float = 0.0) -> List[Dict[str, Any]]:
    h, w = img.shape[:2]
    with torch.no_grad():
        result = ocr_model([img])
    page = result.pages[0]

    words: List[Dict[str, Any]] = []
    for block in page.blocks:
        for line in block.lines:
            for word in line.words:
                conf = float(word.confidence)
                if conf < min_conf:
                    continue
                poly = word.geometry
                pts = [(int(x * w), int(y * h)) for x, y in poly]
                xs, ys = zip(*pts)
                x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
                words.append({"value": word.value, "bbox": [x0, y0, x1, y1], "confidence": round(conf, 4), "page": 0})
    return words

def _ocr_pdf_bytes(content: bytes, min_conf: float = 0.0) -> List[Dict[str, Any]]:
    doc = DocumentFile.from_pdf(io.BytesIO(content))
    with torch.no_grad():
        result = ocr_model(doc)

    tokens: List[Dict[str, Any]] = []
    for pi, page in enumerate(result.pages):
        w, h = page.dimensions  # (width, height)
        for block in page.blocks:
            for line in block.lines:
                for word in line.words:
                    conf = float(word.confidence)
                    if conf < min_conf:
                        continue
                    poly = word.geometry
                    pts = [(int(x * w), int(y * h)) for x, y in poly]
                    xs, ys = zip(*pts)
                    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
                    tokens.append({"value": word.value, "bbox": [x0, y0, x1, y1], "confidence": round(conf, 4), "page": pi})
    return tokens

# -------------------- API --------------------

@app.post("/api/mask/ocr")
def run_ocr(req: OCRReq):
    """
    Download file_url → Doctr OCR → KD grouping → save slim TXT for SLM
    Returns: { ok, id, txt_path, tokens }
    """
    try:
        content = _download_to_bytes(req.file_url)
        name = (req.filename or f"{uuid.uuid4()}")
        lower = name.lower()

        min_conf = float(req.min_conf or 0.0)
        y_th = int(req.y_threshold or 15)
        x_th = int(req.x_threshold or 20)

        # ---- OCR ----
        if lower.endswith(".pdf"):
            print(f"[masking_agent] OCR on PDF: {name}")
            tokens = _ocr_pdf_bytes(content, min_conf=min_conf)
        else:
            print(f"[masking_agent] OCR on image: {name}")
            img = Image.open(io.BytesIO(content)).convert("RGB")
            np_img = np.array(img)
            tokens = _ocr_image_array(np_img, min_conf=min_conf)

        # ---- KD grouping per page ----
        pages = sorted(set(t["page"] for t in tokens)) if tokens else [0]

        # Prepare TXT lines (also print to console)
        doc_id = str(uuid.uuid4())
        safe_name = "".join(ch if ch.isalnum() or ch in "._-+" else "_" for ch in name)
        out_txt = OCR_DIR / f"{doc_id}__{safe_name}.txt"

        all_lines: List[str] = []
        total_phrases = 0

        for pidx in pages:
            page_tokens = [t for t in tokens if t.get("page", 0) == pidx]
            pp = PostProcessor(page_tokens).add_centers().group_into_lines(y_threshold=y_th).merge_neighbor_tokens(x_threshold=x_th)
            result = pp.result()
            phrases = result["phrases"]
            total_phrases += len(phrases)

            header = f"[masking_agent] KD PHRASES (page {pidx}):"
            print("\n" + header)
            all_lines.append(header)

            for ph in phrases:
                line = f"value='{ph['value']}' | mean_conf={ph['mean_conf']:.3f} | bbox={ph['bbox']}"
                print(line)
                all_lines.append(line)

        # ---- Save TXT (exact format SLM expects) ----
        out_txt.write_text("\n".join(all_lines), encoding="utf-8")
        print(f"\n[masking_agent] Slim TXT saved → {out_txt}")

        return {"ok": True, "tokens": len(tokens), "id": doc_id, "txt_path": str(out_txt), "message": "OCR done (TXT saved)."}
    except Exception as e:
        print(f"[masking_agent] OCR error: {e}")
        return {"ok": False, "detail": str(e)}