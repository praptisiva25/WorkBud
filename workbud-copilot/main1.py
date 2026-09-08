# main1.py

import os
import re
import json
import asyncio
import requests
from typing import List, Dict

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
HIST_MAX_TURNS = int(os.getenv("HIST_MAX_TURNS", "20"))
rds = redis.from_url(REDIS_URL, decode_responses=True)

def _hist_key(user_id: str) -> str:
    return f"workbud:hist:{user_id}"

async def hist_get(user_id: str) -> List[Dict[str, str]]:
    items = await rds.lrange(_hist_key(user_id), 0, 2 * HIST_MAX_TURNS - 1)
    return [json.loads(x) for x in reversed(items)]

async def hist_push(user_id: str, role: str, content: str) -> None:
    await rds.lpush(
        _hist_key(user_id),
        json.dumps({"role": role, "content": content})
    )
    await rds.ltrim(_hist_key(user_id), 0, 2 * HIST_MAX_TURNS - 1)

async def hist_clear(user_id: str) -> None:
    await rds.delete(_hist_key(user_id))

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

HEADERS = {
    "Authorization": f"Bearer {GROQ_API_KEY}",
    "Content-Type": "application/json",
}

from reminder_agent import reminder_agent
from fileqna import fileqna_agent
from chart_agent import chart_agent
from message_agent import message_agent
from vectorize import router as vectorize_router
from retriever import load_retriever

app = FastAPI(title="WorkBud Copilot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(vectorize_router)

RETRIEVER = load_retriever(path="faiss_index")

@app.get("/health")
async def health():
    try:
        await rds.ping()
        redis_ok = True
    except Exception as e:
        redis_ok = False
        print("Redis ping failed:", e)

    return {
        "ok": True,
        "model": GROQ_MODEL,
        "redis": redis_ok,
    }

async def llm_pick_tool(message: str) -> str:
    prompt = (
        "Choose ONLY one tool:\n"
        "- reminder: reminders, ping, alarm\n"
        "- fileqna: document questions or general questions\n"
        "- chart: charts, plots, graphs\n"
        "- message: sending a message to someone\n"
        "Output ONLY: reminder OR fileqna OR chart OR message.\n\n"
        f"User: {message}"
    )

    body = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0,
        "max_tokens": 50,
    }

    try:
        resp = await asyncio.to_thread(
            requests.post,
            GROQ_URL,
            headers=HEADERS,
            json=body,
            timeout=30,
        )
        resp.raise_for_status()

        choice = (
            resp.json()["choices"][0]["message"]["content"] or ""
        ).strip().lower()

        choice = re.sub(r"[^a-z]", "", choice)

        if choice in ("reminder", "fileqna", "chart", "message"):
            return choice

    except Exception as e:
        print("Tool classifier error:", e)

    t = message.lower()

    if any(k in t for k in ["remind", "notify", "alarm", "ping"]):
        return "reminder"

    if any(k in t for k in ["chart", "plot", "graph", "visual"]):
        return "chart"

    if any(k in t for k in ["send", "message", "text", "dm"]):
        return "message"

    return "fileqna"

@app.post("/act")
async def act(request: Request):
    body = await request.json()

    text = (body.get("text") or "").strip()

    if not text:
        raise HTTPException(status_code=400, detail="Missing text")

    user_id = body.get("user_id") or "anonymous"
    source_tz = body.get("source_tz") or "UTC"
    now_iso = body.get("now_iso") or ""
    today_local = body.get("today_local") or ""

    prior = await hist_get(user_id)

    print(f"/act from {user_id}: {text}")
    await hist_push(user_id, "user", text)

    intent = await llm_pick_tool(text)
    print(f"Detected intent: {intent}")

    try:
        if intent == "reminder":
            out = await reminder_agent(
                message=text,
                user_id=user_id,
                source_tz=source_tz,
                now_iso=now_iso,
                today_local=today_local,
                groq_url=GROQ_URL,
                groq_model=GROQ_MODEL,
                headers=HEADERS,
            )

            reply = out["reply"]
            await hist_push(user_id, "assistant", reply)

            return JSONResponse({
                "reply": reply,
                "intent": "reminder",
                "reminder": out["reminder"],
            })

        if intent == "chart":
            state = {
                "question": text,
                "context": "",
                "answer": "",
                "next": "",
            }

            out = chart_agent(
                state,
                RETRIEVER,
                GROQ_URL,
                GROQ_MODEL,
                HEADERS,
                )

            reply = out["answer"]
            await hist_push(user_id, "assistant", reply)

            image_url = None

            match = re.search(r"/static/[^\s`]+\.png", reply)
            if match:
                image_url = match.group(0)

            return JSONResponse({
                "reply": reply,
                "intent": "chart",
                "image_url": image_url,
                })

        if intent == "message":
            out = await message_agent(
                message=text,
                groq_url=GROQ_URL,
                groq_model=GROQ_MODEL,
                headers=HEADERS,
                history=prior,
            )

            code = 200 if out.get("ok") else 400

            reply = (
                out.get("reply")
                or ("Message sent" if out.get("ok") else "Failed to send")
            )

            await hist_push(user_id, "assistant", reply)

            return JSONResponse(
                {
                    "intent": "message",
                    **out,
                },
                status_code=code,
                headers={"X-Intent": "message"},
            )

        if intent == "fileqna":
            current_retriever = load_retriever(
                path="faiss_index"
            )

            out = await fileqna_agent(
                query=text,
                history=prior,
                retriever=current_retriever,
                groq_url=GROQ_URL,
                groq_model=GROQ_MODEL,
                headers=HEADERS,
            )

            reply = out["reply"]

            await hist_push(
                user_id,
                "assistant",
                reply
            )

            return JSONResponse({
                "reply": reply,
                "intent": "fileqna",
            })

        reply = "I couldn't determine what you want me to do."

        await hist_push(
            user_id,
            "assistant",
            reply
        )

        return JSONResponse({
            "reply": reply,
            "intent": intent,
        })

    except Exception as e:
        print(f"Error in /act: {e}")

        err_reply = f"Error: {str(e)}"

        await hist_push(
            user_id,
            "assistant",
            err_reply
        )

        return JSONResponse(
            {
                "reply": err_reply,
                "intent": intent,
            },
            status_code=500,
        )