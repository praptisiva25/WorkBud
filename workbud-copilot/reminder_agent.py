# reminder_agent.py
import json, requests, asyncio
from datetime import datetime, timedelta, timezone

def _parse_iso(dt: str):
    try:
        if dt.endswith("Z"): dt = dt[:-1] + "+00:00"
        return datetime.fromisoformat(dt)
    except: return None

async def reminder_agent(message, user_id, source_tz, now_iso, today_local, groq_url, groq_model, headers):
    sys = (
        "Extract a reminder.\n"
        "Use sourceTz + nowIso to resolve relatives, and treat the word 'today' "
        f"as the calendar date '{today_local}' in sourceTz.\n"
        "Return STRICT JSON ONLY with keys: "
        '{ "title": string, "body": string|null, "dueAtUtc": string, '
        '"sourceTz": string, "recurrenceRrule": string|null } '
        "dueAtUtc must be absolute UTC (end with 'Z'). No extra text."
    )
    user = (
        f"message: {message}\n"
        f"sourceTz: {source_tz}\n"
        f"nowIso: {now_iso}\n"
        f"todayLocal: {today_local} (YYYY-MM-DD)\n"
        "If the text says 'today at 4am', use that exact local date and time, "
        "then convert to UTC."
    )

    body = {
        "model": groq_model,
        "temperature": 0,
        "max_tokens": 200,
        "messages": [{"role":"system","content":sys}, {"role":"user","content":user}],
        "response_format": {"type": "json_object"},
    }

    try:
        resp = await asyncio.to_thread(requests.post, groq_url, headers=headers, json=body, timeout=15)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"] or "{}"
        data = json.loads(content)
    except Exception:
        data = {}

    title   = (data.get("title") or message[:64] or "Reminder").strip()
    body_tx = data.get("body")
    due_s   = (data.get("dueAtUtc") or "").strip()
    src_tz  = (data.get("sourceTz") or source_tz or "UTC")
    rrule   = data.get("recurrenceRrule")

    # OPTIONAL 1-liner guard for off-by-one day: if user said "today" and result is way behind now, bump +1 day.
    now_dt = _parse_iso(now_iso)
    due_dt = _parse_iso(due_s)
    if now_dt and due_dt and "today" in message.lower() and (now_dt - due_dt) > timedelta(hours=12):
        due_dt = due_dt + timedelta(days=1)
        due_s = due_dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

    reminder = {
        "userId": user_id,
        "title": title,
        "body": body_tx,
        "dueAtUtc": due_s,
        "sourceTz": src_tz,
        "status": "scheduled",
        "channelPrefs": None,
        "recurrenceRrule": rrule,
        "sourceMessageId": None,
    }
    reply = f"✅ Reminder: “{title}” at {due_s} ({src_tz})."
    return {"intent": "reminder", "reply": reply, "reminder": reminder}
