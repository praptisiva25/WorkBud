# llm_utils.py
from typing import List, Dict

def build_messages_with_history(system_text: str, user_text: str, history: List[Dict], keep_turns: int = 8):
    """
    Build OpenAI-style messages with a system prompt, the last N turns,
    and the current user turn. Truncates long prior messages to avoid token blowups.
    """
    msgs = [{"role": "system", "content": system_text}]
    if history:
        tail = history[-(2 * keep_turns):]  # last N user+assistant pairs
        for m in tail:
            role = m.get("role")
            content = (m.get("content") or "")[:2000]  # hard cap per msg
            if role in ("user", "assistant") and content:
                msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": user_text})
    return msgs
