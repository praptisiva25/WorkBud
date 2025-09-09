"use client";

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  CalendarCheck2,
  Search,
  Sparkles,
  MessageSquareText,
  Plus,
  Paperclip,
  Mic,
  Send,
  StopCircle,
  User,
  X,
  Pin,
  PinOff,
} from "lucide-react";

export default function EventsPage() {
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // --- Overlay (the ONLY chat UI lives here) ---
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPinned, setOverlayPinned] = useState(false);
  const overlayCloseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayListRef = useRef<HTMLDivElement>(null);

  const openOverlay = useCallback(() => {
    if (overlayCloseTimeout.current) clearTimeout(overlayCloseTimeout.current);
    setOverlayOpen(true);
  }, []);
  const maybeCloseOverlay = useCallback(() => {
    if (overlayPinned) return;
    if (overlayCloseTimeout.current) clearTimeout(overlayCloseTimeout.current);
    overlayCloseTimeout.current = setTimeout(() => setOverlayOpen(false), 120);
  }, [overlayPinned]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOverlayPinned(false);
        setOverlayOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- Mock threads/messages ---
  type Thread = { id: string; title: string; last: string; time: string };
  const [threads, setThreads] = useState<Thread[]>([
    { id: "t1", title: "Standup notes", last: "Summarized action items", time: "10:12" },
    { id: "t2", title: "Plan with Sam", last: "Meet tomorrow 4pm", time: "09:05" },
    { id: "t3", title: "Reminder rules", last: "Every Mon 9am", time: "Yesterday" },
  ]);
  const [activeId, setActiveId] = useState<string>(threads[0]?.id ?? "t1");

  type Msg = { id: string; role: "user" | "assistant" | "system"; text: string; time: string };
  const [byThread, setByThread] = useState<Record<string, Msg[]>>({
    t1: [
      { id: "m1", role: "system", text: "Welcome to WorkBud.", time: timeStr() },
      { id: "m2", role: "assistant", text: "What should I include in the standup note?", time: timeStr() },
    ],
    t2: [{ id: "m1", role: "assistant", text: "Try: 'Meet Sam tomorrow 4pm, Board Room'.", time: timeStr() }],
    t3: [{ id: "m1", role: "assistant", text: "Set: 'Remind me every Mon 9am to review PRs'.", time: timeStr() }],
  });

  const messages = byThread[activeId] ?? [];

  // Scroll overlay chat to bottom on new message / thread switch when open
  useEffect(() => {
    if (!overlayOpen) return;
    overlayListRef.current?.scrollTo({ top: overlayListRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeId, overlayOpen]);

  const send = async () => {
    const content = input.trim();
    if (!content || isGenerating) return;
    setInput("");

    const now = timeStr();
    setByThread((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] ?? []), { id: crypto.randomUUID(), role: "user", text: content, time: now }],
    }));

    setIsGenerating(true);
    setTimeout(() => {
      setByThread((prev) => ({
        ...prev,
        [activeId]: [
          ...(prev[activeId] ?? []),
          { id: crypto.randomUUID(), role: "assistant", text: "On it! I'll handle that.", time: timeStr() },
        ],
      }));
      setIsGenerating(false);
      setThreads((ts) => ts.map((t) => (t.id === activeId ? { ...t, last: content, time: now } : t)));
    }, 900);
  };

  const newChat = () => {
    const id = crypto.randomUUID();
    const title = "New chat";
    const now = timeStr();
    setThreads((ts) => [{ id, title, last: "", time: now }, ...ts]);
    setByThread((prev) => ({
      ...prev,
      [id]: [{ id: crypto.randomUUID(), role: "system", text: "New thread started.", time: timeStr() }],
    }));
    setActiveId(id);
    setOverlayOpen(true);
  };

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q) || t.last.toLowerCase().includes(q));
  }, [query, threads]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.24),rgba(15,23,42,0.2)_70%,rgba(15,23,42,1))]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[url('/noise.png')]" />
        <div className="absolute -top-24 -left-24 h-[32rem] w-[32rem] rounded-full blur-3xl bg-cyan-400/20" />
        <div className="absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl bg-violet-500/20" />
      </div>

      {/* Sidebar */}
      <aside className="w-80 h-screen flex flex-col border-r border-white/10 bg-slate-900/50 backdrop-blur">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 p-4">
          <div className="flex items-center gap-2 select-none">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg">
              <CalendarCheck2 className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">WorkBud</span>
          </div>
          <button
            onClick={newChat}
            className="px-3 py-1.5 text-sm bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 hover:from-violet-600 hover:to-cyan-500 rounded-lg font-medium transition-all duration-200"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-10 pr-4 py-2 border border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-400 focus:border-violet-500/40 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredThreads.map((t) => (
            <ThreadItem
              key={t.id}
              active={t.id === activeId}
              title={t.title}
              last={t.last}
              time={t.time}
              onClick={() => {
                setActiveId(t.id);
                setOverlayOpen(true);
              }}
            />
          ))}
          {filteredThreads.length === 0 && <div className="mt-8 text-center text-sm text-slate-400">No chats found</div>}
        </div>
      </aside>

      {/* Main shell */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-slate-400" />
            <span className="font-medium text-slate-200">
              {threads.find((t) => t.id === activeId)?.title ?? "Chat"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              <Sparkles className="h-3.5 w-3.5" />
              Click “Open chat” below
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
          </div>
        </header>

        <div className="flex-1" />

        {/* Single small trigger (no extra prompt box) */}
        <div className="border-t border-white/10 bg-slate-950/60 backdrop-blur p-5">
          <div className="mx-auto flex max-w-4xl justify-center">
            <button
              onClick={openOverlay}
              onMouseEnter={openOverlay}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
              title="Open chat"
            >
              <Sparkles className="h-4 w-4" /> Open chat
            </button>
          </div>
        </div>
      </div>

      {/* === CENTERED OPAQUE/BLUR CHAT OVERLAY === */}
      {overlayOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center"
             onMouseEnter={openOverlay}
             onMouseLeave={maybeCloseOverlay}>
          {/* optional dim: <div className="absolute inset-0 bg-black/20" /> */}
          <div
            className="pointer-events-auto w-[min(56rem,96vw)] h-[min(72vh,760px)] rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-2xl shadow-2xl ring-1 ring-white/10 flex flex-col"
            onWheel={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-white/10 bg-slate-900/70 backdrop-blur-2xl rounded-t-2xl">
              <div className="text-sm font-medium text-slate-100">
                {threads.find((t) => t.id === activeId)?.title ?? "Chat"} • <span className="text-slate-300">Welcome to WorkBud</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setOverlayPinned((p) => !p)}
                  className="p-1.5 rounded-md hover:bg-white/10"
                  title={overlayPinned ? "Unpin" : "Pin"}
                >
                  {overlayPinned ? <PinOff className="h-4 w-4 text-slate-300" /> : <Pin className="h-4 w-4 text-slate-300" />}
                </button>
                <button
                  onClick={() => {
                    setOverlayPinned(false);
                    setOverlayOpen(false);
                  }}
                  className="p-1.5 rounded-md hover:bg-white/10"
                  title="Close"
                >
                  <X className="h-4 w-4 text-slate-300" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={overlayListRef} className="flex-1 overflow-y-auto p-5 space-y-4">
              {(byThread[activeId] ?? []).map((m) => (
                <MessageBubble key={m.id} role={m.role} text={m.text} time={m.time} />
              ))}
            </div>

            {/* Composer (only one) */}
            <div className="border-t border-white/10 bg-slate-900/70 backdrop-blur px-5 py-4 rounded-b-2xl">
              <div className="mx-auto flex items-end gap-3">
                <button className="p-2 border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 rounded-lg">
                  <Paperclip className="h-4 w-4" />
                </button>
                <button className="p-2 border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 rounded-lg">
                  <Mic className="h-4 w-4" />
                </button>
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask to schedule, remind, or summarize…"
                  className="min-h-[44px] max-h-40 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-transparent"
                />
                {isGenerating ? (
                  <button
                    onClick={() => setIsGenerating(false)}
                    className="px-4 py-2 bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-medium hover:from-violet-600 hover:to-cyan-500 rounded-lg flex items-center gap-2"
                  >
                    <StopCircle className="h-4 w-4" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={send}
                    className="px-4 py-2 bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-medium hover:from-violet-600 hover:to-cyan-500 rounded-lg flex items-center gap-2"
                  >
                    <Send className="h-4 w-4" /> Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadItem({
  active,
  title,
  last,
  time,
  onClick,
}: {
  active?: boolean;
  title: string;
  last: string;
  time: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group mb-2 w-full rounded-xl border p-3 text-left transition-all duration-200 ${
        active
          ? "border-violet-500/30 bg-gradient-to-r from-violet-500/15 to-cyan-400/10 text-slate-100 shadow-lg"
          : "border-white/5 bg-white/5 hover:bg-white/10 text-slate-300 hover:border-white/10"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate font-medium text-sm">{title}</div>
        <div className="shrink-0 text-xs text-slate-400">{time}</div>
      </div>
      <div className="mt-1 truncate text-xs text-slate-400">{last || "Start a conversation…"}</div>
    </button>
  );
}

function MessageBubble({
  role,
  text,
  time,
}: {
  role: "user" | "assistant" | "system";
  text: string;
  time: string;
}) {
  const isUser = role === "user";
  const isSystem = role === "system";

  if (isSystem) {
    return <div className="mx-auto max-w-4xl text-center text-xs text-slate-400 py-2">{text}</div>;
  }

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl p-4 text-sm ${
          isUser
            ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow-lg"
            : "border border-white/10 bg-white/5 text-slate-100 backdrop-blur"
        }`}
      >
        <div className="whitespace-pre-wrap leading-relaxed">{text}</div>
        <div className={`mt-2 text-[10px] ${isUser ? "text-slate-900/60" : "text-slate-400"}`}>{time}</div>
      </div>
    </div>
  );
}

function timeStr() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
