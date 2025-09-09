"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Mic, Send, StopCircle, Pin, PinOff, X } from "lucide-react";

type LocalMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  time: string;
};

export default function CopilotOverlay({
  onClose,
  pinned,
  setPinned,
}: {
  onClose: () => void;
  pinned: boolean;
  setPinned: (b: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [items, setItems] = useState<LocalMsg[]>([
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
    setItems((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: content, time: now }]);
    setIsGenerating(true);
    setTimeout(() => {
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: "On it! I'll handle that.", time: timeStr() },
      ]);
      setIsGenerating(false);
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center">
      <div
        className="pointer-events-auto w-[min(56rem,96vw)] h-[min(72vh,760px)] rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-2xl shadow-2xl ring-1 ring-white/10 flex flex-col"
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
              {pinned ? <PinOff className="h-4 w-4 text-slate-300" /> : <Pin className="h-4 w-4 text-slate-300" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10" title="Close">
              <X className="h-4 w-4 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.map((m) => {
            if (m.role === "system") {
              return (
                <div key={m.id} className="mx-auto max-w-4xl text-center text-xs text-slate-400 py-1">
                  {m.text}
                </div>
              );
            }
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl p-4 text-sm ${
                    isUser
                      ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow-lg"
                      : "border border-white/10 bg-white/5 text-slate-100 backdrop-blur"
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                  <div className={`mt-2 text-[10px] ${isUser ? "text-slate-900/60" : "text-slate-400"}`}>{m.time}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Composer */}
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
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
