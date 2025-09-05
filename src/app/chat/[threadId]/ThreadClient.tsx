"use client";

import { useEffect, useRef, useState } from "react";
import { io as socketIO, Socket } from "socket.io-client";

type Msg = {
  id: string;
  threadId: string;
  senderId: string;
  source: "manual" | "copilot" | "system";
  kind: "text" | "image" | "file";
  content: string | null;
  createdAt: string;
};

// keep one socket per tab
let socket: Socket | null = null;

export default function ThreadClient({ threadId }: { threadId: string }) {
  const [items, setItems] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // track ids to prevent duplicates (because we append on event)
  const seenIds = useRef<Set<string>>(new Set());

  const scrollToBottom = () =>
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));

  const load = async () => {
    setLoading(true);
    const r = await fetch(`/api/messages/list?threadId=${encodeURIComponent(threadId)}`);
    const j = await r.json();
    const msgs: Msg[] = j.items ?? [];
    seenIds.current = new Set(msgs.map((m) => m.id));
    setItems(msgs);
    setLoading(false);
    scrollToBottom();
  };

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");

    // server will emit "message:new" back to this client too
    await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, content }),
    }).catch(() => {
      // optional: restore text on failure
      setText(content);
    });
  };

  // Socket: init + join + subscribe
  useEffect(() => {
    // 1) ensure the Socket.IO server is mounted on the Next HTTP server
    fetch("/api/socket").catch(() => {});

    // 2) connect (one socket per tab)
    if (!socket) {
      socket = socketIO(
        process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
        {
          transports: ["websocket"],
          path: "/api/socket.io",        // 👈 must match pages/api/socket.ts
          auth: { userId: "dev-user" },  // DEV ONLY; pass Clerk token in prod
        }
      );

      socket.on("connect_error", (err) => {
        // eslint-disable-next-line no-console
        console.warn("socket connect_error:", err.message);
      });
    }

    // 3) join this thread room
    socket.emit("thread:join", { threadId });

    // 4) handle new messages
    const onNew = (msg: Msg) => {
      if (msg.threadId !== threadId) return;
      if (seenIds.current.has(msg.id)) return; // avoid dup
      seenIds.current.add(msg.id);
      setItems((prev) => [...prev, msg]);
      scrollToBottom();
    };

    socket.on("message:new", onNew);

    return () => {
      socket?.off("message:new", onNew);
      // keep the connection open for this tab
    };
  }, [threadId]);

  useEffect(() => {
    load();
  }, [threadId]);

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col p-4 gap-3">
      <div className="font-medium">Thread: {threadId}</div>

      <div className="flex-1 overflow-y-auto rounded-md border p-3 space-y-2">
        {loading && <div>loading…</div>}
        {!loading && items.length === 0 && <div>No messages yet</div>}
        {items.map((m) => (
          <div key={m.id} className="text-sm">
            <div className="opacity-70">
              {m.senderId} • {new Date(m.createdAt).toLocaleTimeString()}
            </div>
            {m.kind === "text" ? <div>{m.content}</div> : <div>({m.kind})</div>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? send() : undefined)}
        />
        <button className="rounded bg-black text-white px-4 py-2" onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
