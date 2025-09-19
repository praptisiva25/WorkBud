import requests, asyncio

async def generic_llm(
    text: str,
    history,
    groq_url: str,
    groq_model: str,
    headers: dict,
) -> str:
    msgs = [{"role": "system", "content": "You are a concise, helpful assistant."}]
    for role, content in (history or []):
        role = role if role in ("user", "assistant", "system") else "user"
        msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": text or ""})

    body = {"model": groq_model, "messages": msgs, "temperature": 0.3, "max_tokens": 600}
    try:
        resp = await asyncio.to_thread(requests.post, groq_url, headers=headers, json=body, timeout=20)
        resp.raise_for_status()
        return (resp.json()["choices"][0]["message"]["content"] or "").strip()
    except Exception:
        return "Sorry—something went wrong."
