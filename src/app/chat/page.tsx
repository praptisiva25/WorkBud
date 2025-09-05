"use client";
import { useEffect, useState } from "react";

type Thread = {
  id: string;
  type: "user_chat" | "group_chat" | "copilot";
  title: string | null;
  dmKey: string | null;
  updatedAt: string;
};

export default function ChatHome() {
  const [items, setItems] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/threads/list");
    const j = await r.json();
    setItems(j.items || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">Your chats</h1>
      {loading && <div>loading…</div>}
      {!loading && items.length === 0 && <div>No conversations yet</div>}
      <ul className="space-y-2">
        {items.map(t => (
          <li key={t.id} className="flex items-center justify-between rounded border p-3">
            <div className="text-sm">
              <div className="font-medium">
                {t.title ?? (t.dmKey ?? "").replace(/^dm:/, "").replace(/:/g, " · ")}
              </div>
              <div className="opacity-70">{new Date(t.updatedAt).toLocaleString()}</div>
            </div>
            <a
              className="rounded bg-black text-white px-3 py-1"
              href={`/chat/${t.id}`}
            >
              Open
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
