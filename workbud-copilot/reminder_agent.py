import json
import requests
import asyncio
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def _parse_iso(dt: str):
    try:
        if dt.endswith("Z"):
            dt = dt[:-1] + "+00:00"
        return datetime.fromisoformat(dt)
    except:
        return None


async def reminder_agent(
    message,
    user_id,
    source_tz,
    now_iso,
    today_local,
    groq_url,
    groq_model,
    headers,
):
    sys = (
        "Extract a reminder from the user's message. "
        "The title must contain only the reminder task, not the words "
        "'reminder', 'set a reminder', or the date/time. "
        f"The local calendar date is {today_local} in timezone {source_tz}. "
        "Convert the requested local date and time to absolute UTC. "
        "Return STRICT JSON ONLY with keys: "
        '{ "title": string, "body": string|null, "dueAtUtc": string, '
        '"sourceTz": string, "recurrenceRrule": string|null }. '
        "dueAtUtc must be an absolute UTC timestamp ending in Z."
    )

    user = (
        f"message: {message}\n"
        f"sourceTz: {source_tz}\n"
        f"nowIso: {now_iso}\n"
        f"todayLocal: {today_local}\n"
    )

    body = {
        "model": groq_model,
        "temperature": 0,
        "max_completion_tokens": 256,
        "reasoning_format": "hidden",
        "reasoning_effort": "low",
        "messages": [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }

    try:
        resp = await asyncio.to_thread(
            requests.post,
            groq_url,
            headers=headers,
            json=body,
            timeout=15,
        )
        resp.raise_for_status()
        content = (
            resp.json()["choices"][0]["message"]["content"] or "{}"
        )
        data = json.loads(content)
    except Exception:
        data = {}

    src_tz = data.get("sourceTz") or source_tz or "UTC"

    title = (
        data.get("title") or "Reminder"
    ).strip()

    body_tx = data.get("body")

    due_s = (
        data.get("dueAtUtc") or ""
    ).strip()

    rrule = data.get("recurrenceRrule")

    if not due_s:
        match = re.search(
            r"(?:at|for)\s+(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)",
            message,
            re.IGNORECASE,
        )

        if match:
            hour = int(match.group(1))
            minute = int(match.group(2))
            period = match.group(3).lower().replace(".", "")

            if period == "pm" and hour != 12:
                hour += 12
            elif period == "am" and hour == 12:
                hour = 0

            local_date = datetime.strptime(
                today_local,
                "%Y-%m-%d",
            ).date()

            local_dt = datetime(
                local_date.year,
                local_date.month,
                local_date.day,
                hour,
                minute,
                tzinfo=ZoneInfo(src_tz),
            )

            due_s = (
                local_dt
                .astimezone(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
            )

    title_match = re.search(
        r"reminder\s+to\s+(.+?)\s+at\s+\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)",
        message,
        re.IGNORECASE,
    )

    if title_match:
        title = title_match.group(1).strip()

    now_dt = _parse_iso(now_iso)
    due_dt = _parse_iso(due_s)

    if (
        now_dt
        and due_dt
        and "today" in message.lower()
        and (now_dt - due_dt) > timedelta(hours=12)
    ):
        due_dt = due_dt + timedelta(days=1)
        due_s = (
            due_dt
            .replace(tzinfo=timezone.utc)
            .isoformat()
            .replace("+00:00", "Z")
        )

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

    reply = f"Reminder: “{title}” at {due_s} ({src_tz})."

    return {
        "intent": "reminder",
        "reply": reply,
        "reminder": reminder,
    }