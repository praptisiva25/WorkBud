# main.py
import os
import re
import json
import asyncio
import requests
from dotenv import load_dotenv

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from reminder_agent import reminder_agent
from fileqna import fileqna_agent
from chart_agent import chart_agent
from message_agent import message_agent
from vectorize import router as vectorize_router
from retriever import load_retriever

# -------------------------------------------------------------------
# Env & Provider setup
# -------------------------------------------------------------------
load_dotenv()

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").lower()  # "ollama" | "groq"

if LLM_PROVIDER == "groq":
    # Groq (OpenAI-compatible)
    LLM_API_KEY = os.getenv("GROQ_API_KEY", "")
    LLM_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    LLM_URL     = os.getenv("GROQ_URL", "https://api.groq.com/openai/v1/chat/completions")
    LLM_HEADERS = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }
else:
    # Default → Ollama (OpenAI-compatible local server)
    LLM_API_KEY = os.getenv("OLLAMA_API_KEY", "ollama")  # dummy; Ollama ignores but header helps libs
    LLM_MODEL   = os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct")  # you pulled this
    base_url    = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    LLM_URL     = f"{base_url}/chat/completions"
    LLM_HEADERS = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }

# -------------------------------------------------------------------
# FastAPI app
# -------------------------------------------------------------------
app = FastAPI(title="WorkBud Copilot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Routers
app.include_router(vectorize_router)

# Retriever (FAISS); your helper returns None if not found
RETRIEVER = load_retriever(path="faiss_index")

# -------------------------------------------------------------------
# Small LLM helper
# -------------------------------------------------------------------
def _post_chat(payload: dict, timeout: int = 60) -> dict:
    """POST to the configured OpenAI-compatible /chat/completions endpoint."""
    r = requests.post(LLM_URL, headers=LLM_HEADERS, json=payload, timeout=timeout)
    # Surface helpful error info
    if r.status_code >= 400:
        try:
            err = r.json()
        except Exception:
            err = {"error": {"message": r.text}}
        raise HTTPException(status_code=r.status_code, detail=err.get("error", {}).get("message", err))
    return r.json()

# -------------------------------------------------------------------
# Health
# -------------------------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True, "provider": LLM_PROVIDER, "model": LLM_MODEL}

# -------------------------------------------------------------------
# Tool classifier (LLM + fallback heuristic)
# -------------------------------------------------------------------
async def llm_pick_tool(message: str) -> str:
    prompt = (
        "Choose ONLY one tool for the user message:\n"
        "- reminder (for reminders / ping / alarm)\n"
        "- fileqna (for answering questions that do not say to message , reminder or make chart )\n"
        "- chart (for charts, plots, or graphs)\n"
        "- message (for sending a message to someone)\n"
        "Output ONLY: reminder OR fileqna OR chart OR message.\n\n"
        f"User: {message}"
    )
    body = {
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 50,
    }

    try:
        resp = await asyncio.to_thread(_post_chat, body, 60)  # cold start may be slow locally
        choice = (resp["choices"][0]["message"]["content"] or "").strip().lower()
        choice = re.sub(r"[^a-z]", "", choice)
        if choice in ("reminder", "fileqna", "chart", "message"):
            return choice
    except Exception:
        # fall through to heuristic
        pass

    t = message.lower()
    if any(k in t for k in ["remind", "notify", "alarm", "ping"]):
        return "reminder"
    if any(k in t for k in ["chart", "plot", "graph", "visual"]):
        return "chart"
    if any(k in t for k in ["send", "message", "text", "dm"]):
        return "message"
    return "fileqna"

# -------------------------------------------------------------------
# Main action route
# -------------------------------------------------------------------
@app.post("/act")
async def act(request: Request):
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")

    user_id      = body.get("user_id") or "anonymous"
    source_tz    = body.get("source_tz") or "UTC"
    now_iso      = body.get("now_iso") or ""
    today_local  = body.get("today_local") or ""
    history      = body.get("history") or []

    print(f"✅ /act request from {user_id}: {text}")

    intent = await llm_pick_tool(text)
    print(f"🔍 Detected intent: {intent}")

    try:
        if intent == "reminder":
            out = await reminder_agent(
                message=text,
                user_id=user_id,
                source_tz=source_tz,
                now_iso=now_iso,
                today_local=today_local,
                groq_url=LLM_URL,          # ← keep param name, pass Ollama URL
                groq_model=LLM_MODEL,      # ← keep param name, pass Qwen model
                headers=LLM_HEADERS,
            )
            return JSONResponse({"reply": out["reply"], "intent": "reminder", "reminder": out["reminder"]})

        elif intent == "chart":
            state = {"question": text, "context": "", "answer": "", "next": ""}
            out = chart_agent(state, RETRIEVER, LLM_URL, LLM_MODEL, LLM_HEADERS)
            return JSONResponse({"reply": out["answer"], "intent": "chart"})

        elif intent == "message":
            out = await message_agent(
                message=text,
                groq_url=LLM_URL,
                groq_model=LLM_MODEL,
                headers=LLM_HEADERS,
            )
            code = 200 if out.get("ok") else 400
            return JSONResponse({"intent": "message", **out}, status_code=code, headers={"X-Intent": "message"})

        # default → File QnA (RAG)
        out = await fileqna_agent(
            query=text,
            history=history,
            retriever=RETRIEVER,
            groq_url=LLM_URL,
            groq_model=LLM_MODEL,
            headers=LLM_HEADERS,
        )
        return JSONResponse({"reply": out["reply"], "intent": "fileqna"})

    except HTTPException as e:
        # Bubble up structured API errors (e.g., model not loaded, bad request)
        print(f"❌ HTTPException in /act: {e.detail}")
        raise
    except Exception as e:
        # Generic error path
        print(f"❌ Error in /act: {e}")
        return JSONResponse({"reply": f"Error: {str(e)}"}, status_code=500)
