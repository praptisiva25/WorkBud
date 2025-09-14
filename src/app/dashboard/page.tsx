"use client";

import { useEffect, useState } from "react";
import { Sparkles, MessageSquareText, User } from "lucide-react";
import SidebarThreads from "../../components/SidebarThreads";
import ThreadClient from "../../components/ThreadClient";
import CopilotOverlay from "../../components/CopilotOverlay";
import type { Thread } from "../../types/chat";
import { UserButton } from "@clerk/nextjs";

export default function ChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const loadThreads = async () => {
    setLoadingThreads(true);
    const r = await fetch("/api/threads/list");
    const j = await r.json();
    const items: Thread[] = (j.items || []).filter((t: Thread) => t.type !== "copilot"); 
    setThreads(items);
    setLoadingThreads(false);
    if (!activeThreadId && items.length) setActiveThreadId(items[0].id);
  };

  useEffect(() => {
    loadThreads();
  }, []);

  const activeName =
    threads.find((t) => t.id === activeThreadId)?.title ??
    threads
      .find((t) => t.id === activeThreadId)
      ?.dmKey?.replace(/^dm:/, "")
      .replace(/:/g, " · ") ??
    "Chat";

  // Copilot overlay
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPinned, setCopilotPinned] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.24),rgba(15,23,42,0.2)_70%,rgba(15,23,42,1))]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[url('/noise.png')]" />
        <div className="absolute -top-24 -left-24 h-[32rem] w-[32rem] rounded-full blur-3xl bg-cyan-400/20" />
        <div className="absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl bg-violet-500/20" />
      </div>

      {/* Left: user/group threads */}
      <SidebarThreads
        threads={threads}
        loading={loadingThreads}
        activeThreadId={activeThreadId}
        onSelect={setActiveThreadId}
        onRefresh={loadThreads}
      />

      {/* Center: current user thread */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-slate-400" />
            <span className="font-medium text-slate-200">{activeName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              <Sparkles className="h-3.5 w-3.5" />
              Need the bot? Use “Open Copilot” below
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center">
              <UserButton/>
            </div>
          </div>
        </header>

        <div className="flex-1">
          {activeThreadId ? (
            <ThreadClient threadId={activeThreadId} />
          ) : (
            <div className="h-full grid place-items-center text-slate-400">
              Select a chat on the left
            </div>
          )}
        </div>

        {/* Bottom: Copilot trigger */}
        <div className="border-t border-white/10 bg-slate-950/60 backdrop-blur p-5">
          <div className="mx-auto flex max-w-4xl justify-center">
            <button
              onClick={() => setCopilotOpen(true)}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
              title="Open Copilot"
            >
              <Sparkles className="h-4 w-4" /> Open Copilot
            </button>
          </div>
        </div>
      </div>

      {/* Copilot overlay */}
      {copilotOpen && (
        <CopilotOverlay
          pinned={copilotPinned}
          setPinned={setCopilotPinned}
          onClose={() => {
            setCopilotPinned(false);
            setCopilotOpen(false);
          }}
        />
      )}
    </div>
  );
}
