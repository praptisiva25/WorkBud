"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Mic, Send } from "lucide-react";
import { getSocket } from "@/lib/socket";
import type { Msg } from "@/types/chat";

export default function ThreadClient({ threadId }: { threadId: string }) {
  const [items, setItems] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const myIdRef = useRef<string>("dev-user"); // replace with Clerk userId in prod

  const scrollToBottom = () =>
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    );

  const load = async () => {
    setLoading(true);
    const r = await fetch(
      `/api/messages/list?threadId=${encodeURIComponent(threadId)}`
    );
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
    await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, content }),
    }).catch(() => setText(content));
  };

  useEffect(() => {
    const socket = getSocket();
    myIdRef.current =
      typeof socket.auth === "object" && socket.auth !== null && "userId" in socket.auth
        ? (socket.auth.userId as string)
        : "dev-user";
    socket.emit("thread:join", { threadId });

    const onNew = (msg: Msg) => {
      if (msg.threadId !== threadId) return;
      if (seenIds.current.has(msg.id)) return;
      seenIds.current.add(msg.id);
      setItems((prev) => [...prev, msg]);
      scrollToBottom();
    };

    socket.on("message:new", onNew);
    return () => {
      socket.off("message:new", onNew);
    };
  }, [threadId]);

  useEffect(() => {
    load();
  }, [threadId]);

  return (
    <div className="flex h-[calc(100vh-148px)] flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading && <div className="text-sm text-slate-400">loading…</div>}
        {!loading && items.length === 0 && (
          <div className="text-sm text-slate-400">No messages yet</div>
        )}
        {items.map((m) => {
          const isMe = m.senderId === myIdRef.current;
          if (m.source === "system") {
            return (
              <div
                key={m.id}
                className="mx-auto max-w-3xl text-center text-xs text-slate-400 py-1"
              >
                {m.content}
              </div>
            );
          }
          return (
            <div
              key={m.id}
              className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl p-4 text-sm ${
                  isMe
                    ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow-lg"
                    : "border border-white/10 bg-white/5 text-slate-100 backdrop-blur"
                }`}
              >
                <div
                  className={`mb-1 text-[10px] ${
                    isMe ? "text-slate-900/70" : "text-slate-400"
                  }`}
                >
                  {m.senderId} •{" "}
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                {m.kind === "text" ? (
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </div>
                ) : (
                  <div>({m.kind})</div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-white/10 bg-slate-950/60 backdrop-blur px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-end gap-3">
          <button className="p-2 border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 rounded-lg">
            <Paperclip className="h-4 w-4" />
          </button>
          <button className="p-2 border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 rounded-lg">
            <Mic className="h-4 w-4" />
          </button>
          <input
            className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-transparent"
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" ? send() : undefined)}
          />
          <button
            onClick={send}
            className="px-4 py-2 bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-medium hover:from-violet-600 hover:to-cyan-500 rounded-lg flex items-center gap-2"
          >
            <Send className="h-4 w-4" /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
