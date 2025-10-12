import os, json, re, asyncio, requests
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from vectorize import router as vectorize_router  # your existing vectorize routes

from jwcrypto import jwk, jwt
from dotenv import load_dotenv

from reminder_agent import reminder_agent          # unchanged
from fileqna import fileqna_agent            # NEW
from chart_agent import chart_agent                # your chart agent
from retriever import load_retriever               # tiny helper

load_dotenv()

# ---- Groq ----
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
HEADERS      = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}

# ---- JWT (optional) ----
NEXT_PUBLIC_KEY_PEM = os.environ.get("NEXT_JWT_PUBLIC_KEY", "").replace("\\n", "\n").encode("utf-8")
PUB_KEY = jwk.JWK.from_pem(NEXT_PUBLIC_KEY_PEM) if NEXT_PUBLIC_KEY_PEM else None
JWT_ISSUER_NEXT = os.environ.get("JWT_ISSUER_NEXT", "next-app")
JWT_AUDIENCE_COPILOT = os.environ.get("JWT_AUDIENCE_COPILOT", "copilot-service")

def verify_next_token(bearer: str) -> dict:
    if os.getenv("COPILOT_DISABLE_JWT") == "1":
        return {}
    if not bearer or not bearer.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer")
    token = bearer.split(" ", 1)[1]
    try:
        t = jwt.JWT(jwt=token, key=PUB_KEY, algs=["EdDSA"])
        claims = json.loads(t.claims)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"invalid jwt: {e}")
    if claims.get("iss") != JWT_ISSUER_NEXT:
        raise HTTPException(status_code=401, detail="bad iss")
    aud = claims.get("aud")
    if not (aud == JWT_AUDIENCE_COPILOT or (isinstance(aud, list) and JWT_AUDIENCE_COPILOT in aud)):
        raise HTTPException(status_code=401, detail="bad aud")
    return claims

# ---- Tool router ----
async def llm_pick_tool(message: str) -> str:
    prompt = (
        "Choose ONLY one tool for the user message:\n"
        "- reminder (set a reminder / ping / alarm / notify later)\n"
        "- fileqna (ask/answer using user's files / docs / vector db)\n"
        "- chart (ask for a chart/plot/graph based on docs/KB)\n"
        "Output ONLY: reminder OR fileqna OR chart.\n\n"
        f"User: {message}"
    )
    body = {"model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}],
            "temperature": 0, "max_tokens": 100}
    try:
        resp = await asyncio.to_thread(requests.post, GROQ_URL, headers=HEADERS, json=body, timeout=10)
        resp.raise_for_status()
        choice = (resp.json()["choices"][0]["message"]["content"] or "").strip().lower()
        choice = re.sub(r"[^a-z]", "", choice)
        if choice in ("reminder", "fileqna", "chart"):
            return choice
    except Exception:
        pass

    # Heuristic fallback
    t = (message or "").lower()
    if any(k in t for k in ("remind", "reminder", "notify", "alarm", "ping me", "nudge", "alert")):
        return "reminder"
    if any(k in t for k in ("chart", "plot", "graph", "visualise", "visualize", "bar chart", "line chart", "pie chart")):
        return "chart"
    return "fileqna"  # default to RAG instead of generic chat

# ---- FastAPI ----
app = FastAPI(title="WorkBud Copilot")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# serve generated charts
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# keep your vectorize endpoints
app.include_router(vectorize_router)

@app.get("/health")
def health():
    return {"ok": True, "model": GROQ_MODEL}

# preload FAISS retriever for RAG (non-fatal if missing)
RETRIEVER = load_retriever(path="faiss_index")  # returns None if index not found

@app.post("/act")
async def act(request: Request):
    claims = verify_next_token(request.headers.get("authorization", ""))
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="missing text")

    user_id     = claims.get("sub") or body.get("user_id") or "anonymous"
    source_tz   = (body.get("source_tz") or request.headers.get("x-tz") or "UTC").strip()
    now_iso     = (body.get("now_iso") or "").strip()
    today_local = (body.get("today_local") or "").strip()
    history     = body.get("history") or []  # list of {role, content}

    intent = await llm_pick_tool(text)

    if intent == "reminder":
        out = await reminder_agent(
            message=text, user_id=user_id, source_tz=source_tz, now_iso=now_iso, today_local=today_local,
            groq_url=GROQ_URL, groq_model=GROQ_MODEL, headers=HEADERS,
        )
        reply    = (out.get("reply") or "").strip() or " Reminder captured."
        reminder = out.get("reminder") or {}
        return JSONResponse({"reply": reply, "intent": "reminder", "reminder": reminder},
                            headers={"X-Intent": "reminder"})

    if intent == "chart":
        # minimal state for your chart_agent
        state = {
            "question": text,
            "context": "",
            "answer": "",
            "next": "",
            "chat_history": [(m.get("content",""), "") for m in history if m.get("role") == "user"]
        }
        out_state = chart_agent(state, RETRIEVER, GROQ_URL, GROQ_MODEL, HEADERS)
        return JSONResponse({"reply": out_state["answer"], "intent": "chart"},
                            headers={"X-Intent": "chart"})

    # fileqna (default)
    out = await fileqna_agent(
        query=text, history=history, retriever=RETRIEVER,
        groq_url=GROQ_URL, groq_model=GROQ_MODEL, headers=HEADERS,
    )
    return JSONResponse(
        {"reply": out["reply"], "intent": "fileqna", "sources": out.get("sources", [])},
        headers={"X-Intent": "fileqna"}
    )
