# maskslm_agent.py
import os, json, re, asyncio
from pathlib import Path
import requests
from typing import List, Dict, Any

JSON_SCHEMA_HINT = """
Return ONLY a compact JSON object with this shape:
{
  "targets": [
    {
      "index": <int>,          // index of the chosen line from the provided list
      "reason": "<short why>", // optional but helpful
      "value": "<verbatim phrase>",
      "bbox": [x0, y0, x1, y1] // four integers parsed from the line's bbox
    }
  ]
}
If nothing matches, return {"targets": []}.
"""

SYSTEM_INSTRUCTIONS = (
    "You are a PII masking selector. Given a user instruction (masking criteria) and a list of lines, "
    "each line formatted as: value='TEXT' | mean_conf=FLOAT | bbox=[x0, y0, x1, y1]. "
    "Select ONLY the lines whose TEXT should be redacted. Typical criteria: name, email, phone, application number, register number, address, etc. "
    "Prefer exact or near-exact matches. Avoid headers like 'Name' unless it includes actual personal data. "
    "Output STRICT JSON following the required schema; do NOT add commentary."
)

def _read_lines(txt_path: str) -> List[str]:
    p = Path(txt_path)
    if not p.exists():
        raise FileNotFoundError(f"OCR TXT not found: {txt_path}")
    # Keep as-is (we rely on exact formatting)
    with p.open("r", encoding="utf-8") as f:
        lines = [ln.rstrip("\n") for ln in f if ln.strip()]
    # Keep only the value lines; allow headers to stay for indexing context
    return lines

def _index_value_lines(lines: List[str]) -> List[Dict[str, Any]]:
    """
    Keep only lines that look like: value='...' | mean_conf=... | bbox=[...]
    Preserve the original index so we can map back.
    """
    value_rows = []
    pat = re.compile(r"^value='(.*)'\s*\|\s*mean_conf=([0-9.]+)\s*\|\s*bbox=\[([0-9,\s]+)\]$")
    for i, ln in enumerate(lines):
        m = pat.match(ln)
        if m:
            text = m.group(1)
            mean_conf = float(m.group(2))
            bbox = [int(x.strip()) for x in m.group(3).split(",")]
            value_rows.append({
                "index": i,          # line index in the file
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
        "response_format": {"type": "json_object"},  # ask Groq for structured JSON
    }
    resp = await asyncio.to_thread(requests.post, groq_url, headers=headers, json=body, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]

def _build_prompt(user_prompt: str, rows: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    # Provide a compact, indexed list to the model
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
            # Prefer bbox returned by model if valid; else use the one from row
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

async def maskslm_agent(
    user_prompt: str,
    txt_path: str,
    groq_url: str,
    groq_model: str,
    headers: Dict[str, str],
) -> Dict[str, Any]:
    """
    Reads slim OCR TXT, asks SLM which lines to mask, prints bboxes to console,
    returns a compact payload for the UI or the next masking step.
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

        # Print to server console (like console.log)
        print("\n[maskslm_agent] User prompt:", user_prompt)
        print(f"[maskslm_agent] TXT: {txt_path}")
        if not targets:
            print("[maskslm_agent] No targets selected.")
        else:
            print("[maskslm_agent] Targets to mask (bboxes):")
            for t in targets:
                print(f" - idx={t['index']} value='{t['value']}' bbox={t['bbox']} reason='{t.get('reason','')}'")

        reply = "Selected 0 items to mask." if not targets else f"Selected {len(targets)} item(s) to mask."
        return {"ok": True, "reply": reply, "targets": targets, "raw": raw}
    except Exception as e:
        return {"ok": False, "reply": f"Masking SLM error: {e}", "targets": [], "raw": ""}
