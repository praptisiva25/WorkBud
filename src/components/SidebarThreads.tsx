"use client";

import { useMemo, useState } from "react";
import { Search, CalendarCheck2 } from "lucide-react";
import type { Thread } from "@/types/chat";

export default function SidebarThreads({
  threads,
  loading,
  activeThreadId,
  onSelect,
  onRefresh,
}: {
  threads: Thread[];
  loading: boolean;
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const name =
        t.title ?? (t.dmKey ?? "").replace(/^dm:/, "").replace(/:/g, " · ");
      return name.toLowerCase().includes(q);
    });
  }, [query, threads]);

  return (
    <aside className="w-80 h-screen flex flex-col border-r border-white/10 bg-slate-900/50 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 p-4">
        <div className="flex items-center gap-2 select-none">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg">
            <CalendarCheck2 className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">WorkBud</span>
        </div>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 text-sm bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 hover:from-violet-600 hover:to-cyan-500 rounded-lg font-medium transition-all duration-200"
          title="Refresh"
        >
          ↻
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

      {/* Threads */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="mt-6 text-center text-sm text-slate-400">loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="mt-6 text-center text-sm text-slate-400">
            No conversations yet
          </div>
        )}
        {filtered.map((t) => {
          const name =
            t.title ??
            (t.dmKey ?? "").replace(/^dm:/, "").replace(/:/g, " · ");
          const active = t.id === activeThreadId;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
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
  );
}
