import os, asyncio, requests
from typing import Any, List

# expects a LangChain retriever (or None)

async def fileqna_agent(
    *, query: str, history: list, retriever: Any, groq_url: str, groq_model: str, headers: dict
) -> dict:
    if retriever is None:
        return {
            "reply": "I couldn’t access the file index. Please (re)build the FAISS index or check the path.",
            "sources": []
        }

    # 1) retrieve
    try:
        # supports modern .invoke API
        docs = retriever.invoke(query)
    except Exception:
        # older retrievers use get_relevant_documents
        docs = retriever.get_relevant_documents(query)

    # 2) pack context
    context_chunks = []
    sources: List[dict] = []
    for i, d in enumerate(docs):
        page = getattr(d, "metadata", {}).get("page", None)
        src  = getattr(d, "metadata", {}).get("source", getattr(d, "metadata", {}).get("file", ""))
        snippet = (getattr(d, "page_content", "") or "")[:1200]
        context_chunks.append(f"[{i+1}] SOURCE={src} PAGE={page}\n{snippet}")
        sources.append({"rank": i+1, "source": src, "page": page})

    context = "\n\n".join(context_chunks) if context_chunks else "No context found."

    sys = (
        "Answer strictly from the provided context. If the answer is not clearly supported, say "
        "'I couldn’t find this in the documents.' Cite sources using [1], [2] indices."
    )
    user = f"Question:\n{query}\n\nContext:\n{context}"

    body = {
        "model": groq_model,
        "temperature": 0.1,
        "max_tokens": 700,
        "messages": [{"role":"system","content": sys},{"role":"user","content": user}],
    }

    try:
        resp = await asyncio.to_thread(requests.post, groq_url, headers=headers, json=body, timeout=25)
        resp.raise_for_status()
        answer = (resp.json()["choices"][0]["message"]["content"] or "").strip()
        return {"reply": answer, "sources": sources}
    except Exception as e:
        return {"reply": f"RAG answer failed: {e}", "sources": sources}
