import json
import requests


def _extract(
    groq_url: str,
    groq_model: str,
    headers: dict,
    message: str,
    history=None,
) -> dict:

    system_prompt = (
        "Extract a direct-message instruction from the user's message. "
        "Identify the person being messaged and the exact message they want to send. "
        "Return only the requested JSON structure."
    )

    messages = [
        {
            "role": "system",
            "content": system_prompt,
        }
    ]

    # Add a small amount of previous history for context
    if history:
        for item in history[-6:]:
            role = item.get("role")
            content = item.get("content")

            if role in ("user", "assistant") and content:
                messages.append({
                    "role": role,
                    "content": content,
                })

    messages.append({
        "role": "user",
        "content": message,
    })

    body = {
        "model": groq_model,
        "messages": messages,
        "temperature": 0,
        "max_completion_tokens": 256,

        # GPT-OSS requires this when using JSON/structured output
        "reasoning_format": "hidden",
        "reasoning_effort": "low",

        # Use Groq strict structured output
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "message_instruction",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "receiver": {
                            "type": "string"
                        },
                        "content": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "receiver",
                        "content"
                    ],
                    "additionalProperties": False
                }
            }
        },
    }

    response = requests.post(
        groq_url,
        headers=headers,
        json=body,
        timeout=30,
    )

    if not response.ok:
        print("========== GROQ MESSAGE AGENT ERROR ==========")
        print("STATUS:", response.status_code)
        print("RESPONSE:", response.text)
        print("===============================================")
        response.raise_for_status()

    result = response.json()

    raw = (
        result
        .get("choices", [{}])[0]
        .get("message", {})
        .get("content")
        or "{}"
    )

    data = json.loads(raw)

    return {
        "receiver": str(data.get("receiver") or "").strip(),
        "content": str(data.get("content") or "").strip(),
    }


async def message_agent(
    message: str,
    groq_url: str,
    groq_model: str,
    headers: dict,
    history=None,
) -> dict:

    try:
        out = _extract(
            groq_url=groq_url,
            groq_model=groq_model,
            headers=headers,
            message=message,
            history=history,
        )

        if not out["receiver"] or not out["content"]:
            return {
                "ok": False,
                "receiver": "",
                "content": "",
                "reply": "Could not determine the recipient or message.",
            }

        return {
            "ok": True,
            "receiver": out["receiver"],
            "content": out["content"],
            "reply": f"Message ready for {out['receiver']}.",
        }

    except Exception as e:
        print("❌ message_agent error:", e)

        return {
            "ok": False,
            "receiver": "",
            "content": "",
            "reply": f"Parser failed: {e}",
        }