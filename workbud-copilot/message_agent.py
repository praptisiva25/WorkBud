# message_agent.py
import json, requests

def _extract(groq_url: str, groq_model: str, headers: dict, message: str) -> dict:
    sys = (
        "Extract a direct-message instruction.\n"
        "Return STRICT JSON ONLY: {\"receiver\": string, \"content\": string}\n"
        "If uncertain, return empty strings."
    )
    body = {
        "model": groq_model,
        "temperature": 0,
        "max_tokens": 120,
        "messages": [{"role":"system","content":sys}, {"role":"user","content":message}],
        "response_format": {"type":"json_object"},
    }
    r = requests.post(groq_url, headers=headers, json=body, timeout=15)
    r.raise_for_status()
    raw = r.json()["choices"][0]["message"]["content"] or "{}"
    data = json.loads(raw)
    return {
        "receiver": (data.get("receiver") or "").strip(),
        "content":  (data.get("content")  or "").strip(),
    }

async def message_agent(message: str, groq_url: str, groq_model: str, headers: dict) -> dict:
    try:
        out = _extract(groq_url, groq_model, headers, message)
        if not out["receiver"] or not out["content"]:
            return {"ok": False, "receiver": "", "content": "", "reply": "Could not parse receiver/content."}
        return {"ok": True, **out}
    except Exception as e:
        return {"ok": False, "receiver": "", "content": "", "reply": f"Parser failed: {e}"}
