"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Card } from "../../../components/ui/card";
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
} from "lucide-react";

/**
 * WorkBud — ChatGPT‑style Layout
 * Left: Thread list (new chat, search, threads)
 * Center: Chat panel with messages + sticky prompt bar
 * Theme: same violet→cyan on dark slate with glass surfaces
 */
export default function EventsPage() {
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Mock threads
  type Thread = { id: string; title: string; last: string; time: string };
  const [threads, setThreads] = useState<Thread[]>([
    { id: "t1", title: "Standup notes", last: "Summarized action items", time: "10:12" },
    { id: "t2", title: "Plan with Sam", last: "Meet tomorrow 4pm", time: "09:05" },
    { id: "t3", title: "Reminder rules", last: "Every Mon 9am", time: "Yesterday" },
  ]);
  const [activeId, setActiveId] = useState<string>(threads[1]?.id ?? "t1");

  // Mock messages per thread in memory
  type Msg = { id: string; role: "user" | "assistant" | "system"; text: string; time: string };
  const [byThread, setByThread] = useState<Record<string, Msg[]>>({
    t1: [
      { id: "m1", role: "system", text: "Welcome to WorkBud.", time: timeStr() },
      { id: "m2", role: "assistant", text: "What should I include in the standup note?", time: timeStr() },
    ],
    t2: [
      { id: "m1", role: "assistant", text: "Try: ‘Meet Sam tomorrow 4pm, Board Room’.", time: timeStr() },
    ],
    t3: [
      { id: "m1", role: "assistant", text: "Set: ‘Remind me every Mon 9am to review PRs’.", time: timeStr() },
    ],
  });

  const messages = byThread[activeId] ?? [];

  // Scroll chat to bottom on new message
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeId]);

  const send = async () => {
    const content = input.trim();
    if (!content || isGenerating) return;
    setInput("");

    const now = timeStr();
    setByThread((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] ?? []), { id: crypto.randomUUID(), role: "user", text: content, time: now }],
    }));

    // Simulate assistant
    setIsGenerating(true);
    setTimeout(() => {
      setByThread((prev) => ({
        ...prev,
        [activeId]: [
          ...(prev[activeId] ?? []),
          { id: crypto.randomUUID(), role: "assistant", text: "On it! I’ll handle that.", time: timeStr() },
        ],
      }));
      setIsGenerating(false);
      // Update thread preview
      setThreads((ts) => ts.map((t) => (t.id === activeId ? { ...t, last: content, time: now } : t)));
    }, 900);
  };

  const newChat = () => {
    const id = crypto.randomUUID();
    const title = "New chat";
    const now = timeStr();
    setThreads((ts) => [{ id, title, last: "", time: now }, ...ts]);
    setByThread((prev) => ({ ...prev, [id]: [{ id: crypto.randomUUID(), role: "system", text: "New thread started.", time: now }] }));
    setActiveId(id);
  };

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q) || t.last.toLowerCase().includes(q));
  }, [query, threads]);

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      {/* Background gradient + texture */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.24),rgba(15,23,42,0.2)_70%,rgba(15,23,42,1))]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[url('/noise.png')]" />
        <div className="absolute -top-24 -left-24 h-[32rem] w-[32rem] rounded-full blur-3xl bg-cyan-400/20" />
        <div className="absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl bg-violet-500/20" />
      </div>

      {/* Header */}
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-2 select-none">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-[0_10px_30px_-10px_rgba(56,189,248,0.45)]">
            <CalendarCheck2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">WorkBud</span>
        </div>

        <div className="relative hidden md:block w-full max-w-xl">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search threads…"
            className="pl-10 border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-400"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-300">
            <Sparkles className="h-3.5 w-3.5" />
            Try: <span className="font-medium text-slate-100">“Remind me Fri 5pm to submit form”</span>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Main grid: Left rail + Chat panel */}
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-[300px,1fr]">
        {/* Left rail — threads */}
        <aside className="sticky top-4 h-[calc(100dvh-120px)] overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 p-3">
            <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
              <MessageSquareText className="h-4 w-4" /> Chats
            </div>
            <Button onClick={newChat} className="h-8 bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-3 pt-2">
            <div className="relative">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="pl-9 border-white/10 bg-white/10 text-slate-100 placeholder:text-slate-400"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            </div>
          </div>

          <div className="h-[calc(100%-104px)] overflow-y-auto p-2">
            {filteredThreads.map((t) => (
              <ThreadItem key={t.id} active={t.id === activeId} title={t.title} last={t.last} time={t.time} onClick={() => setActiveId(t.id)} />)
            )}
            {filteredThreads.length === 0 && (
              <div className="mt-6 text-center text-sm text-slate-400">No threads found</div>
            )}
          </div>
        </aside>

        {/* Center — chat */}
        <main className="relative flex h-[calc(100dvh-120px)] flex-col rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="border-b border-white/10 p-3 text-sm text-slate-300">
            {threads.find((t) => t.id === activeId)?.title ?? "Chat"}
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} text={m.text} time={m.time} />
            ))}
          </div>

          {/* Prompt bar */}
          <div className="sticky bottom-0 w-full border-t border-white/10 bg-slate-950/60 backdrop-blur p-3 md:p-4">
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <Button variant="secondary" className="border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15" size="icon">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button variant="secondary" className="border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15" size="icon">
                <Mic className="h-4 w-4" />
              </Button>
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
                className="min-h-[44px] max-h-40 flex-1 resize-none rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              {isGenerating ? (
                <Button onClick={() => setIsGenerating(false)} className="bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-semibold">
                  <StopCircle className="mr-2 h-4 w-4" /> Stop
                </Button>
              ) : (
                <Button onClick={send} className="bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-semibold">
                  <Send className="mr-2 h-4 w-4" /> Send
                </Button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function ThreadItem({ active, title, last, time, onClick }: { active?: boolean; title: string; last: string; time: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "group mb-1 w-full rounded-xl border p-3 text-left transition " +
        (active
          ? "border-white/15 bg-gradient-to-r from-violet-500/15 to-cyan-400/10 text-slate-100"
          : "border-white/5 bg-white/5 hover:bg-white/10 text-slate-300")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate font-medium">{title}</div>
        <div className="shrink-0 text-xs text-slate-400">{time}</div>
      </div>
      <div className="mt-0.5 truncate text-xs text-slate-400">{last || "Start a conversation…"}</div>
    </button>
  );
}

function MessageBubble({ role, text, time }: { role: "user" | "assistant" | "system"; text: string; time: string }) {
  const isUser = role === "user";
  const isSystem = role === "system";
  if (isSystem) {
    return <div className="mx-auto max-w-3xl text-center text-xs text-slate-400">{text}</div>;
  }
  return (
    <div className={(isUser ? "justify-end" : "justify-start") + " flex w-full"}>
      <div
        className={
          "max-w-[78%] rounded-2xl p-3 text-sm " +
          (isUser
            ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow"
            : "border border-white/10 bg-white/5 text-slate-100 backdrop-blur")
        }
      >
        <div className="whitespace-pre-wrap leading-relaxed">{text}</div>
        <div className={"mt-1 text-[10px] " + (isUser ? "text-slate-900/75" : "text-slate-400")}>{time}</div>
      </div>
    </div>
  );
}

function timeStr() {
  return new Date().toLocaleTimeString();
}
