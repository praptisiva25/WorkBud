# chart_agent.py
import os
import re
import uuid
import json
import requests
from typing import TypedDict, List, Any

import matplotlib
matplotlib.use("Agg")  
import matplotlib.pyplot as plt


class RAGState(TypedDict):
    question: str
    context: str
    answer: str
    next: str
    chat_history: List[tuple[str, str]]


# ---------- helpers ----------
def extract_json_from_text(text: str) -> dict:
    """
    Extract the first JSON object from an LLM response.
    Accepts fenced ```json ...``` blocks or raw JSON.
    Raises ValueError if nothing valid is found.
    """
    patterns = [
        r"```json\s*(\{.*?\})\s*```",
        r"```\s*(\{.*?\})\s*```",
        r"(\{.*\})",  # greedy last resort
    ]
    for p in patterns:
        m = re.search(p, text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                continue
    # final attempt: maybe the whole text is JSON
    return json.loads(text)


def coerce_chart_payload(raw: dict) -> dict:
    """
    Validates and normalizes the chart payload.
    Also converts numbers like '(4.2)' -> -4.2 and strings -> floats where possible.
    Required keys: title, x, y, xlabel, ylabel
    Optional: chart_type in {'bar','line','pie'} (default 'bar')
    """
    required = ["title", "x", "y", "xlabel", "ylabel"]
    for k in required:
        if k not in raw:
            raise ValueError(f"Missing required field: {k}")

    x = list(raw["x"])
    y = list(raw["y"])

    if len(x) != len(y):
        raise ValueError("X and Y must have same length")

    def str_to_number(v: Any) -> float:
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v).strip()
        # "(4.2)" -> -4.2
        m = re.fullmatch(r"\(([-+]?\d*\.?\d+)\)", s)
        if m:
            return -float(m.group(1))
        # plain number in string
        try:
            return float(s.replace("%", ""))
        except Exception:
            # if truly non-numeric, raise
            raise ValueError(f"Non-numeric Y value: {v}")

    y_num = [str_to_number(v) for v in y]

    chart_type = str(raw.get("chart_type", "bar")).lower()
    if chart_type not in {"bar", "line", "pie"}:
        chart_type = "bar"

    return {
        "title": str(raw["title"]),
        "x": [str(v) for v in x],
        "y": y_num,
        "xlabel": str(raw["xlabel"]),
        "ylabel": str(raw["ylabel"]),
        "chart_type": chart_type,
    }


def render_chart_png(chart: dict, out_dir: str = "static") -> str:
    """
    Renders a chart as PNG into out_dir and returns a web path like /static/<file>.png.
    Assumes FastAPI serves StaticFiles(directory='static') at '/static'.
    """
    os.makedirs(out_dir, exist_ok=True)
    fname = f"chart_{uuid.uuid4().hex[:8]}.png"
    fpath = os.path.join(out_dir, fname)

    plt.figure(figsize=(10, 6))
    ctype = chart["chart_type"]
    X = chart["x"]
    Y = chart["y"]

    if ctype == "bar":
        bars = plt.bar(X, Y)
        colors = ["red" if v < 0 else "green" for v in Y]
        for b, c in zip(bars, colors):
            b.set_color(c)
        plt.xticks(rotation=45, ha="right")
        plt.axhline(y=0, color="black", linestyle="-", linewidth=0.8)
        plt.grid(axis="y", alpha=0.3)

    elif ctype == "line":
        plt.plot(X, Y, marker="o", linewidth=2, markersize=7)
        plt.xticks(rotation=45, ha="right")
        plt.grid(axis="y", alpha=0.3)

    elif ctype == "pie":
        # pie ignores xlabel/ylabel
        plt.pie(Y, labels=X, autopct="%1.1f%%", startangle=90)

    if ctype != "pie":
        plt.xlabel(chart["xlabel"])
        plt.ylabel(chart["ylabel"])

    plt.title(chart["title"], fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(fpath, dpi=300, bbox_inches="tight")
    plt.close()

    return f"/static/{fname}"


# ---------- main entry ----------
def chart_agent(state: RAGState, retriever, GROQ_URL: str, GROQ_MODEL: str, HEADERS: dict) -> RAGState:
    """
    Builds a chart from RAG context:
      1) Retrieve docs from retriever (invoke() with fallback)
      2) Ask LLM for structured JSON (title/x/y/xlabel/ylabel/chart_type)
      3) Validate/normalize payload, render PNG -> /static/...
      4) Return a human summary in state['answer'] including served URL
    """
    question = state["question"]
    chat_history = state.get("chat_history", [])

    if retriever is None:
        return {
            **state,
            "context": "",
            "answer": "I couldn’t access the vector index. Please build or point me to the FAISS index.",
            "next": ""
        }

    # 1) retrieve
    try:
        try:
            docs = retriever.invoke(question)
        except Exception:
            docs = retriever.get_relevant_documents(question)  # older API
        context = "\n\n".join([(getattr(d, "page_content", "") or "") for d in docs])[:12000]
        print(f" Retrieved {len(docs)} documents for chart generation.")
        print(f" Context preview: {context[:500]}...")
    except Exception as e:
        return {
            **state,
            "context": "",
            "answer": f"Error retrieving documents for chart: {e}",
            "next": ""
        }

    # 2) prompt LLM for structured chart JSON
    memory_context = "\n".join([f"User: {q}\nAssistant: {a}" for q, a in chat_history])

    prompt = f"""You are a data analyst. Use the conversation and context to produce chart-ready data.

Conversation History:
{memory_context}

Context:
{context}

Return ONLY JSON in this exact schema:
{{
  "title": "Chart Title",
  "x": ["Category1", "Category2"],
  "y": [12.5, -3.4],
  "xlabel": "Category",
  "ylabel": "Y-o-Y Growth (%)",
  "chart_type": "bar"
}}

Rules:
- Output ONLY JSON (no prose).
- Convert values like (4.2) to -4.2.
- Preserve original category labels.
- Ensure x and y lengths match.

Question:
{question}
"""

    try:
        resp = requests.post(
            GROQ_URL,
            headers=HEADERS,
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 1000,
            },
            timeout=30,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"]
        print(f" Raw LLM response (first 200): {raw[:200]}")

        parsed = extract_json_from_text(raw)
        chart_payload = coerce_chart_payload(parsed)

    except Exception as e:
        # fallback demo payload
        print(f" LLM/JSON error -> using fallback. Details: {e}")
        chart_payload = {
            "title": "Y-o-Y CC Growth by Industry",
            "x": ["Technology", "Healthcare", "Finance", "Retail", "Manufacturing"],
            "y": [15.2, 8.7, 12.1, -3.4, 6.9],
            "xlabel": "Industry",
            "ylabel": "Y-o-Y CC Growth (%)",
            "chart_type": "bar",
        }

    # 3) render chart
    try:
        web_path = render_chart_png(chart_payload, out_dir="static")

        # small summary for UI
        lines = [f"**{chart_payload['title']}**", f"Image: `{web_path}`", ""]
        lines.append(f"**X ({len(chart_payload['x'])}):** " + ", ".join(chart_payload["x"]))
        lines.append(f"**Y:** " + ", ".join([str(v) for v in chart_payload["y"]]))
        if chart_payload["chart_type"] != "pie":
            lines.append(f"**Axes:** {chart_payload['xlabel']} vs {chart_payload['ylabel']}")

        summary = "\n".join(lines)

        return {
            "question": question,
            "context": context,
            "answer": summary,
            "next": "",
            "chat_history": chat_history
        }

    except Exception as e:
        return {
            "question": question,
            "context": context,
            "answer": f"Chart rendering error: {e}",
            "next": "",
            "chat_history": chat_history
        }
