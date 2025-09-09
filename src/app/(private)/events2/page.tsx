"use client";

import React, {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
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
import { io as socketIO, Socket } from "socket.io-client";

/* =========================
   Types (backend-compatible)
   ========================= */
type Thread = {
  id: string;
  type: "user_chat" | "group_chat" | "copilot";
  title: string | null;
  dmKey: string | null;
  updatedAt: string;
};

type Msg = {
  id: string;
  threadId: string;
  senderId: string;
  source: "manual" | "copilot" | "system";
  kind: "text" | "image" | "file";
  content: string | null;
  createdAt: string;
};

/* Keep exactly one socket per tab */
let socket: Socket | null = null;

/* ============================================================
   PAGE: Sidebar (user/group threads) + User Chat + Copilot UX
   ============================================================ */
export default function ChatPage() {
  /* ---------- Sidebar: fetch threads (user/group only) ---------- */
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const loadThreads = async () => {
    setLoadingThreads(true);
    const r = await fetch("/api/threads/list");
    const j = await r.json();
    const items: Thread[] = j.items || [];
    const userChats = items.filter((t) => t.type !== "copilot"); // left = user/group only
    setThreads(userChats);
    setLoadingThreads(false);
    if (!activeThreadId && userChats.length) setActiveThreadId(userChats[0].id);
  };
  useEffect(() => {
    loadThreads();
  }, []);

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const name =
        t.title ??
        (t.dmKey ?? "").replace(/^dm:/, "").replace(/:/g, " · ");
      return name.toLowerCase().includes(q);
    });
  }, [query, threads]);

  /* ---------- Copilot (overlay) state ---------- */
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPinned, setCopilotPinned] = useState(false);
  const copilotCloseTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const openCopilot = useCallback(() => {
    if (copilotCloseTimeout.current)
      clearTimeout(copilotCloseTimeout.current);
    setCopilotOpen(true);
  }, []);
  const maybeCloseCopilot = useCallback(() => {
    if (copilotPinned) return;
    if (copilotCloseTimeout.current)
      clearTimeout(copilotCloseTimeout.current);
    copilotCloseTimeout.current = setTimeout(
      () => setCopilotOpen(false),
      120
    );
  }, [copilotPinned]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCopilotPinned(false);
        setCopilotOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.24),rgba(15,23,42,0.2)_70%,rgba(15,23,42,1))]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[url('/noise.png')]" />
        <div className="absolute -top-24 -left-24 h-[32rem] w-[32rem] rounded-full blur-3xl bg-cyan-400/20" />
        <div className="absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl bg-violet-500/20" />
      </div>

      {/* ============ LEFT: USER/GROUP THREADS (no copilot) ============ */}
      <aside className="w-80 h-screen flex flex-col border-r border-white/10 bg-slate-900/50 backdrop-blur">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 p-4">
          <div className="flex items-center gap-2 select-none">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg">
              <CalendarCheck2 className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              WorkBud
            </span>
          </div>
          <button
            onClick={loadThreads}
            className="px-3 py-1.5 text-sm bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 hover:from-violet-600 hover:to-cyan-500 rounded-lg font-medium transition-all duration-200"
            title="Refresh"
          >
            <Plus className="h-4 w-4 rotate-45" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              className="w-full pl-10 pr-4 py-2 border border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-400 focus:border-violet-500/40 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          </div>
        </div>

        {/* Threads list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loadingThreads && (
            <div className="mt-6 text-center text-sm text-slate-400">
              loading…
            </div>
          )}
          {!loadingThreads && filteredThreads.length === 0 && (
            <div className="mt-6 text-center text-sm text-slate-400">
              No conversations yet
            </div>
          )}
          {filteredThreads.map((t) => {
            const name =
              t.title ??
              (t.dmKey ?? "")
                .replace(/^dm:/, "")
                .replace(/:/g, " · ");
            const active = t.id === activeThreadId;
            return (
              <button
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={`group mb-2 w-full rounded-xl border p-3 text-left transition-all duration-200 ${
                  active
                    ? "border-violet-500/30 bg-gradient-to-r from-violet-500/15 to-cyan-400/10 text-slate-100 shadow-lg"
                    : "border-white/5 bg-white/5 hover:bg-white/10 text-slate-300 hover:border-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-medium text-sm">{name}</div>
                  <div className="shrink-0 text-xs text-slate-400">
                    {new Date(t.updatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="mt-1 truncate text-xs text-slate-400">
                  {t.type === "group_chat" ? "Group chat" : "Direct message"}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ============ CENTER: USER↔USER THREAD UI ============ */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-slate-400" />
            <span className="font-medium text-slate-200">
              {threads.find((t) => t.id === activeThreadId)?.title ??
                threads
                  .find((t) => t.id === activeThreadId)
                  ?.dmKey?.replace(/^dm:/, "")
                  .replace(/:/g, " · ") ??
                "Chat"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              <Sparkles className="h-3.5 w-3.5" />
              Need the bot? Use “Open Copilot” below
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
          </div>
        </header>

        {/* User thread client (real-time) */}
        <div className="flex-1">
          {activeThreadId ? (
            <ThreadClientStyled threadId={activeThreadId} />
          ) : (
            <div className="h-full grid place-items-center text-slate-400">
              Select a chat on the left
            </div>
          )}
        </div>

        {/* Bottom bar with a single Copilot trigger */}
        <div className="border-t border-white/10 bg-slate-950/60 backdrop-blur p-5">
          <div className="mx-auto flex max-w-4xl justify-center">
            <button
              onClick={openCopilot}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
              title="Open Copilot"
            >
              <Sparkles className="h-4 w-4" /> Open Copilot
            </button>
          </div>
        </div>
      </div>

      {/* ============ CENTERED OPAQUE/BLUR COPILOT OVERLAY ============ */}
      {copilotOpen && (
        <CopilotOverlay
          onClose={() => {
            setCopilotPinned(false);
            setCopilotOpen(false);
          }}
          onEnter={openCopilot}
          onLeave={maybeCloseCopilot}
          pinned={copilotPinned}
          setPinned={setCopilotPinned}
        />
      )}
    </div>
  );
}

/* ======================================================
   ThreadClientStyled: your real-time thread UI, themed
   ====================================================== */
function ThreadClientStyled({ threadId }: { threadId: string }) {
  const [items, setItems] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const myIdRef = useRef<string>("dev-user"); // DEV default; in prod pass Clerk userId via socket auth

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

  // Init socket once per tab & subscribe to this thread
  useEffect(() => {
    // make sure server mounts
    fetch("/api/socket").catch(() => {});

    if (!socket) {
      const userId = "dev-user"; // replace with Clerk token in prod
      socket = socketIO(
        process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
        {
          transports: ["websocket"],
          path: "/api/socket.io",
          auth: { userId }, // pass userId to socket auth
        }
      );
      myIdRef.current = userId;

      socket.on("connect_error", (err) => {
        console.warn("socket connect_error:", err.message);
      });
    }

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
      socket?.off("message:new", onNew);
    };
  }, [threadId]);

  useEffect(() => {
    load();
  }, [threadId]);

  return (
    <div className="flex h-[calc(100vh-148px)] flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading && (
          <div className="text-sm text-slate-400">loading…</div>
        )}
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
              className={`flex w-full ${
                isMe ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[75%] rounded-2xl p-4 text-sm ${
                  isMe
                    ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow-lg"
                    : "border border-white/10 bg-white/5 text-slate-100 backdrop-blur"
                }`}
              >
                {/* Sender & time */}
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

function CopilotOverlay({
  onClose,
  onEnter,
  onLeave,
  pinned,
  setPinned,
}: {
  onClose: () => void;
  onEnter: () => void;
  onLeave: () => void;
  pinned: boolean;
  setPinned: (b: boolean) => void;
}) {
  
  type Local = { id: string; role: "user" | "assistant" | "system"; text: string; time: string };
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [items, setItems] = useState<Local[]>([
    { id: "s1", role: "system", text: "Welcome to WorkBud.", time: timeStr() },
    {
      id: "a1",
      role: "assistant",
      text: "What should I include in the standup note?",
      time: timeStr(),
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [items.length]);

  const send = () => {
    const content = input.trim();
    if (!content || isGenerating) return;
    setInput("");
    const now = timeStr();
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: content, time: now },
    ]);
    setIsGenerating(true);
    setTimeout(() => {
      setItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "On it! I'll handle that.",
          time: timeStr(),
        },
      ]);
      setIsGenerating(false);
    }, 900);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div
        className="pointer-events-auto w-[min(56rem,96vw)] h-[min(72vh,760px)] rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-2xl shadow-2xl ring-1 ring-white/10 flex flex-col"
        onWheel={(e) => e.stopPropagation()}
      >
        
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-white/10 bg-slate-900/70 backdrop-blur-2xl rounded-t-2xl">
          <div className="text-sm font-medium text-slate-100">
            Standup notes • <span className="text-slate-300">Welcome to WorkBud</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPinned(!pinned)}
              className="p-1.5 rounded-md hover:bg-white/10"
              title={pinned ? "Unpin" : "Pin"}
            >
              {pinned ? (
                <PinOff className="h-4 w-4 text-slate-300" />
              ) : (
                <Pin className="h-4 w-4 text-slate-300" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-white/10"
              title="Close"
            >
              <X className="h-4 w-4 text-slate-300" />
            </button>
          </div>
        </div>

        
        <div ref={listRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.map((m) => {
            if (m.role === "system") {
              return (
                <div
                  key={m.id}
                  className="mx-auto max-w-4xl text-center text-xs text-slate-400 py-1"
                >
                  {m.text}
                </div>
              );
            }
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={`flex w-full ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl p-4 text-sm ${
                    isUser
                      ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow-lg"
                      : "border border-white/10 bg-white/5 text-slate-100 backdrop-blur"
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {m.text}
                  </div>
                  <div
                    className={`mt-2 text-[10px] ${
                      isUser ? "text-slate-900/60" : "text-slate-400"
                    }`}
                  >
                    {m.time}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        
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
  );
}


function timeStr() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
