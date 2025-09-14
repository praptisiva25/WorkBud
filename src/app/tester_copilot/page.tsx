"use client";

import { useState } from "react";

export default function CopilotPage() {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setLog((L) => [...L, `you: ${text}`]);
    setInput("");

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const reply = await res.text(); // <- plain text
      if (!res.ok) throw new Error(reply || `HTTP ${res.status}`);
      setLog((L) => [...L, `copilot: ${reply}`]);
    } catch (e: any) {
      setLog((L) => [...L, `error: ${e?.message || String(e)}`]);
    }
  };

  return (
    <main className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-xl font-semibold">Copilot Echo (first letter)</h1>
      <div className="border rounded p-3 min-h-[180px] bg-black/20">
        {log.map((l, i) => (
          <div key={i} className="text-sm py-0.5">{l}</div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          className="flex-1 rounded border px-3 py-2"
          placeholder="Type: Hi Copilot"
        />
        <button onClick={send} className="rounded px-4 py-2 bg-indigo-600 text-white">
          Send
        </button>
      </div>
    </main>
  );
}
