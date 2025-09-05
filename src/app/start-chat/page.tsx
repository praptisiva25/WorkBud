"use client";
import { useState } from "react";
type User = { id: string; email: string | null; displayName: string | null; imageUrl: string | null };

export default function StartChatPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const search = async () => {
    setErr(null);
    const r = await fetch(`/api/users/search?query=${encodeURIComponent(q)}`);
    const j = await r.json();
    setItems(j.items || []);
  };

  const start = async (otherUserId: string) => {
    try {
      setBusy(true);
      const r = await fetch("/api/threads/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherUserId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "failed");
      location.href = `/chat/${j.threadId}`;
    } catch (e: any) {
      setErr(e.message || "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">Start a DM</h1>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="search by name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? search() : undefined)}
        />
        <button className="rounded bg-black text-white px-4 py-2" onClick={search}>
          Search
        </button>
      </div>

      {err && <div className="text-red-600 text-sm">{err}</div>}

      <ul className="space-y-2">
        {items.map((u) => (
          <li key={u.id} className="flex items-center justify-between rounded border p-2">
            <div className="text-sm">
              <div className="font-medium">{u.displayName ?? u.email ?? u.id}</div>
              <div className="opacity-70">{u.email}</div>
            </div>
            <button
              disabled={busy}
              onClick={() => start(u.id)}
              className="rounded bg-indigo-600 text-white px-3 py-1 disabled:opacity-50"
            >
              Chat
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
