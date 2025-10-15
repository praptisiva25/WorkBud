import os, json, re, asyncio
from pathlib import Path
import requests
from typing import List, Dict, Any
from PIL import Image, ImageDraw
from io import BytesIO


JSON_SCHEMA_HINT = """
Return ONLY a compact JSON object with this shape:
{
  "targets": [
    {
      "index": <int>,
      "reason": "<short why>",
      "value": "<verbatim phrase>",
      "bbox": [x0, y0, x1, y1]
    }
  ]
}
If nothing matches, return {"targets": []}.
"""

SYSTEM_INSTRUCTIONS = (
    "You are a PII masking selector. Given a user instruction (masking criteria) and a list of lines, "
    "each line formatted as: value='TEXT' | mean_conf=FLOAT | bbox=[x0, y0, x1, y1]. "
    "Select ONLY the lines whose TEXT should be redacted. Typical criteria: name, email, phone, application number, register number, address, etc. "
    "Prefer exact or near-exact matches. Usually the data to be masked will be after the header for that data. "
    "Avoid headers like 'Name' unless it includes actual personal data. "
    "Output STRICT JSON following the required schema; do NOT add commentary."
)

def _read_lines(txt_path: str) -> List[str]:
    p = Path(txt_path)
    if not p.exists():
        raise FileNotFoundError(f"OCR TXT not found: {txt_path}")
    with p.open("r", encoding="utf-8") as f:
        lines = [ln.rstrip("\n") for ln in f if ln.strip()]
    return lines

def _index_value_lines(lines: List[str]) -> List[Dict[str, Any]]:
    pat = re.compile(r"^value='(.*)'\s*\|\s*mean_conf=([0-9.]+)\s*\|\s*bbox=\[([0-9,\s]+)\]$")
    value_rows = []
    for i, ln in enumerate(lines):
        m = pat.match(ln)
        if m:
            text = m.group(1)
            mean_conf = float(m.group(2))
            bbox = [int(x.strip()) for x in m.group(3).split(",")]
            value_rows.append({
                "index": i,
                "value": text,
                "mean_conf": mean_conf,
                "bbox": bbox,
                "raw": ln
            })
    return value_rows

async def _groq_call(messages: List[Dict[str, str]], groq_url: str, groq_model: str, headers: Dict[str, str]) -> str:
    body = {
        "model": groq_model,
        "messages": messages,
        "temperature": 0,
        "max_tokens": 512,
        "response_format": {"type": "json_object"},
    }
    resp = await asyncio.to_thread(requests.post, groq_url, headers=headers, json=body, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]

def _build_prompt(user_prompt: str, rows: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    rows_preview = "\n".join(
        [f"{r['index']}: value='{r['value']}' | mean_conf={r['mean_conf']:.3f} | bbox={r['bbox']}" for r in rows]
    )
    user_content = (
        f"Masking criteria from user: \"{user_prompt}\"\n\n"
        f"Lines (with index):\n{rows_preview}\n\n"
        f"{JSON_SCHEMA_HINT}"
    )
    return [
        {"role": "system", "content": SYSTEM_INSTRUCTIONS},
        {"role": "user", "content": user_content},
    ]

def _normalize_targets(raw_json: str, rows_map: Dict[int, Dict[str, Any]]) -> List[Dict[str, Any]]:
    try:
        obj = json.loads(raw_json)
    except Exception:
        return []
    targets = obj.get("targets") or []
    out = []
    for t in targets:
        idx = t.get("index")
        if isinstance(idx, int) and idx in rows_map:
            row = rows_map[idx]
            bbox = t.get("bbox")
            if not (isinstance(bbox, list) and len(bbox) == 4 and all(isinstance(x, (int, float)) for x in bbox)):
                bbox = row["bbox"]
            else:
                bbox = [int(round(x)) for x in bbox]
            out.append({
                "index": idx,
                "value": row["value"],
                "bbox": bbox,
                "reason": t.get("reason", ""),
                "mean_conf": row["mean_conf"],
            })
    return out



def _load_image(image_path: str) -> Image.Image:
    """Supports both local file paths and HTTP URLs."""
    if image_path.startswith("http"):
        print(f"[maskslm_agent] Downloading image from URL: {image_path}")
        r = requests.get(image_path, timeout=30)
        r.raise_for_status()
        return Image.open(BytesIO(r.content)).convert("RGB")
    return Image.open(Path(image_path)).convert("RGB")

def apply_mask_to_image(image_path: str, targets: List[Dict[str, Any]], output_dir: str = "pics") -> str:
    """
    Draws black rectangles over the given bounding boxes and saves the result.
    """
    os.makedirs(output_dir, exist_ok=True)
    img = _load_image(image_path)
    draw = ImageDraw.Draw(img)

    for t in targets:
        bbox = t.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        x0, y0, x1, y1 = map(int, bbox)
        draw.rectangle([x0, y0, x1, y1], fill="black")

    name = Path(image_path).stem + "_masked" + Path(image_path).suffix
    out_path = os.path.join(output_dir, name)
    img.save(out_path)

    print(f"[maskslm_agent] Saved masked image: {out_path}")
    return out_path


async def maskslm_agent(
    user_prompt: str,
    txt_path: str,
    image_path: str,
    groq_url: str,
    groq_model: str,
    headers: Dict[str, str],
) -> Dict[str, Any]:
    """
    Reads slim OCR TXT, asks SLM which lines to mask, then applies
    black rectangles over the detected bounding boxes and saves the result.
    """
    try:
        lines = _read_lines(txt_path)
        value_rows = _index_value_lines(lines)
        if not value_rows:
            return {"ok": False, "reply": "No OCR value lines found in TXT.", "targets": [], "raw": ""}

        rows_map = {r["index"]: r for r in value_rows}
        messages = _build_prompt(user_prompt, value_rows)
        raw = await _groq_call(messages, groq_url, groq_model, headers)
        targets = _normalize_targets(raw, rows_map)

        print("\n[maskslm_agent] User prompt:", user_prompt)
        print(f"[maskslm_agent] TXT: {txt_path}")
        if not targets:
            print("[maskslm_agent] No targets selected.")
        else:
            print("[maskslm_agent] Targets to mask (bboxes):")
            for t in targets:
                print(f" - idx={t['index']} value='{t['value']}' bbox={t['bbox']} reason='{t.get('reason','')}'")

        reply = "Selected 0 items to mask." if not targets else f"Selected {len(targets)} item(s) to mask."

        masked_path = None
        if targets:
            masked_path = apply_mask_to_image(image_path, targets)

        return {"ok": True, "reply": reply, "targets": targets, "masked_path": masked_path, "raw": raw}

    except Exception as e:
        return {"ok": False, "reply": f"Masking SLM error: {e}", "targets": [], "raw": ""}
