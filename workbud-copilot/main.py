import os, json, re, asyncio, requests
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from jwcrypto import jwk, jwt
from dotenv import load_dotenv

from reminder_agent import reminder_agent
from generic_agent import generic_llm

load_dotenv()

# ---- Groq (single source of truth) ----
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

# ---- LLM router (bulletproof) ----
async def llm_pick_tool(message: str) -> str:
    prompt = (
        "Choose ONLY one tool for the user message:\n"
        "- reminder (set a reminder / ping / alarm / notify later)\n"
        "- generic (anything else)\n"
        "Output ONLY: reminder OR generic.\n\n"
        f"User: {message}"
    )
    body = {"model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}],
            "temperature": 0, "max_tokens": 5}
    try:
        resp = await asyncio.to_thread(requests.post, GROQ_URL, headers=HEADERS, json=body, timeout=10)
        resp.raise_for_status()
        choice = (resp.json()["choices"][0]["message"]["content"] or "").strip().lower()
        choice = re.sub(r"[^a-z]", "", choice)
        if choice in ("reminder", "generic"):
            return choice
    except Exception:
        pass
    t = (message or "").lower()
    if any(k in t for k in ("remind", "reminder", "notify", "alarm", "ping me", "nudge", "alert")):
        return "reminder"
    return "generic"

# ---- FastAPI ----
app = FastAPI(title="WorkBud Copilot")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True, "model": GROQ_MODEL}


@app.post("/act")
async def act(request: Request):
    claims = verify_next_token(request.headers.get("authorization", ""))
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="missing text")

    user_id   = claims.get("sub") or body.get("user_id") or "anonymous"
    source_tz = (body.get("source_tz") or request.headers.get("x-tz") or "UTC").strip()
    now_iso   = (body.get("now_iso") or "").strip()
    today_local = (body.get("today_local") or "").strip()  # "YYYY-MM-DD"

    history   = body.get("history") or []

    # 1) route
    intent = await llm_pick_tool(text)

    if intent == "reminder":
        out = await reminder_agent(
            message=text, user_id=user_id, source_tz=source_tz, now_iso=now_iso, today_local=today_local,
            groq_url=GROQ_URL, groq_model=GROQ_MODEL, headers=HEADERS,
        )

        reply    = (out.get("reply") or "").strip() or "✅ Reminder captured."
        reminder = out.get("reminder") or {}

        # ✅ Send JSON with reply + full reminder object
        return JSONResponse(
            content={
                "reply": reply,
                "intent": "reminder",
                "reminder": reminder,
            },
            headers={"X-Intent": "reminder"}
        )

    # ----- generic branch -----
    reply = await generic_llm(
        text=text, history=history,
        groq_url=GROQ_URL, groq_model=GROQ_MODEL, headers=HEADERS,
    )
    reply = reply.strip() or "OK"
    return JSONResponse(
        content={"reply": reply, "intent": "generic"},
        headers={"X-Intent": "generic"}
    )