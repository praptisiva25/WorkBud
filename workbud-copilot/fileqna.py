import os, asyncio, requests, re
from typing import Any, List
from llm_utils import build_messages_with_history

# expects a LangChain retriever (or None)

async def fileqna_agent(
    *,
    query: str,
    history: list,
    retriever: Any,
    groq_url: str,
    groq_model: str,
    headers: dict
) -> dict:
    if retriever is None:
        return {
            "reply": "I couldn’t access the file index. Please (re)build the FAISS index or check the path.",
            "sources": []
        }

    # 1) retrieve
    try:
        docs = retriever.invoke(query)  # modern LC retrievers
    except Exception:
        docs = retriever.get_relevant_documents(query)  # legacy API

    # 2) pack context
    context_chunks: List[str] = []
    sources: List[dict] = []
    for i, d in enumerate(docs):
        meta = getattr(d, "metadata", {}) or {}
        page = meta.get("page", None)
        src  = meta.get("source", meta.get("file", ""))
        snippet = (getattr(d, "page_content", "") or "")[:1200]
        context_chunks.append(f"[{i+1}] SOURCE={src} PAGE={page}\n{snippet}")
        sources.append({"rank": i + 1, "source": src, "page": page})

    context = "\n\n".join(context_chunks) if context_chunks else "No context found."

    sys = (
        "You are a strict RAG assistant. Answer ONLY using the provided context. "
        "If the answer is not clearly supported, reply: \"I couldn’t find this in the documents.\" "
        "Use plain prose; do not reveal internal indices or metadata."
    )
    user = f"Question:\n{query}\n\nContext:\n{context}"

    # 3) build messages with chat history (last ~8 turns)
    messages = build_messages_with_history(sys, user, history or [], keep_turns=8)

    body = {
        "model": groq_model,
        "temperature": 0.1,
        "max_tokens": 700,
        "messages": messages,
    }

    try:
        resp = await asyncio.to_thread(
            requests.post, groq_url, headers=headers, json=body, timeout=30
        )
        resp.raise_for_status()
        answer = (resp.json()["choices"][0]["message"]["content"] or "").strip()

        # remove any [number] style citations from the model output
        answer = re.sub(r"\s*\[\d+\]\s*", " ", answer).strip()

        return {"reply": answer, "sources": sources}
    except Exception as e:
        return {"reply": f"RAG answer failed: {e}", "sources": sources}
