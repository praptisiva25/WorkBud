import os, json, re, asyncio, requests
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
# --- Environment setup ---
from dotenv import load_dotenv
load_dotenv()

# --- Groq setup ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
HEADERS      = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}

# --- FastAPI setup ---
app = FastAPI(title="WorkBud Copilot")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# Static serving
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(vectorize_router)

@app.get("/health")
def health():
    return {"ok": True, "model": GROQ_MODEL}

RETRIEVER = load_retriever(path="faiss_index")  # returns None if index not found


# --- Simple tool classifier ---
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
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 50,
    }
    try:
        resp = await asyncio.to_thread(requests.post, GROQ_URL, headers=HEADERS, json=body, timeout=10)
        resp.raise_for_status()
        choice = (resp.json()["choices"][0]["message"]["content"] or "").strip().lower()
        choice = re.sub(r"[^a-z]", "", choice)
        if choice in ("reminder", "fileqna", "chart", "message"):
            return choice
    except Exception:
        pass

    # fallback heuristic
    t = message.lower()
    if any(k in t for k in ["remind", "notify", "alarm", "ping"]):
        return "reminder"
    if any(k in t for k in ["chart", "plot", "graph", "visual"]):
        return "chart"
    if any(k in t for k in ["send", "message", "text", "dm"]):
        return "message"
    return "fileqna"

# --- Main /act route ---
@app.post("/act")
async def act(request: Request):
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")

    # ✅ Use explicit user_id or fallback
    user_id = body.get("user_id") or "anonymous"
    source_tz = body.get("source_tz") or "UTC"
    now_iso = body.get("now_iso") or ""
    today_local = body.get("today_local") or ""
    history = body.get("history") or []

    print(f"✅ /act request from {user_id}: {text}")

    # --- Tool selection ---
    intent = await llm_pick_tool(text)
    print(f"🔍 Detected intent: {intent}")

    try:
        # === Reminder ===
        if intent == "reminder":
            out = await reminder_agent(
                message=text, user_id=user_id,
                source_tz=source_tz, now_iso=now_iso,
                today_local=today_local, groq_url=GROQ_URL,
                groq_model=GROQ_MODEL, headers=HEADERS
            )
            return JSONResponse({"reply": out["reply"], "intent": "reminder", "reminder": out["reminder"]})

        # === Chart ===
        elif intent == "chart":
            state = {"question": text, "context": "", "answer": "", "next": ""}
            out = chart_agent(state, RETRIEVER, GROQ_URL, GROQ_MODEL, HEADERS)
            return JSONResponse({"reply": out["answer"], "intent": "chart"})

        # === Message ===
        elif intent == "message":
            out = await message_agent(
                 message=text,
                 groq_url=GROQ_URL,
                 groq_model=GROQ_MODEL,
                 headers=HEADERS,
        )
            code = 200 if out.get("ok") else 400
            return JSONResponse({"intent": "message", **out}, status_code=code, headers={"X-Intent": "message"})
    

        # === Default: File QnA ===
        out = await fileqna_agent(
            query=text, history=history, retriever=RETRIEVER,
            groq_url=GROQ_URL, groq_model=GROQ_MODEL, headers=HEADERS
        )
        return JSONResponse({"reply": out["reply"], "intent": "fileqna"})

    except Exception as e:
        print(f"❌ Error in /act: {e}")
        return JSONResponse({"reply": f"Error: {str(e)}"}, status_code=500)
