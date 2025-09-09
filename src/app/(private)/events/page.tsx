"use client";

import { useMemo, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  CalendarCheck2,
  Plus,
  Bell,
  Search,
  ListTodo,
  Clock3,
  MapPin,
  ChevronRight,
  Repeat,
  Filter,
  Sparkles
} from "lucide-react";

export default function EventsPage() {
  const [query, setQuery] = useState("");

  const upcoming = useMemo(
    () => [
      { id: "1", title: "Sprint Planning", time: "Today • 10:00–11:00", where: "Zoom", tag: "Work" },
      { id: "2", title: "Design Review", time: "Today • 14:00–15:00", where: "Board Room", tag: "Work" },
      { id: "3", title: "Gym", time: "Today • 19:00–20:00", where: "FitHub", tag: "Personal" },
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return upcoming;
    return upcoming.filter((e) =>
      e.title.toLowerCase().includes(q) || e.where.toLowerCase().includes(q)
    );
  }, [query, upcoming]);

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
    
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.24),rgba(15,23,42,0.2)_70%,rgba(15,23,42,1))]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[url('/noise.png')]" />
        <div className="absolute -top-24 -left-24 h-[32rem] w-[32rem] rounded-full blur-3xl bg-cyan-400/20" />
        <div className="absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl bg-violet-500/20" />
      </div>

      
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
            placeholder="Search events, places, people…"
            className="pl-10 border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-400"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        </div>

        <div className="flex items-center gap-2">
          <Button className="bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-semibold">
            <Plus className="mr-2 h-4 w-4" /> New
          </Button>
          <Button variant="secondary" className="border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15">
            <Bell className="mr-2 h-4 w-4" /> Remind me
          </Button>
          <div className="ml-1">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-6 pb-8 md:grid-cols-[240px,1fr]">
        
        <aside className="sticky top-4 h-max space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
          <SidebarButton icon={<CalendarCheck2 className="h-4 w-4" />} label="Upcoming" active />
          <SidebarButton icon={<ListTodo className="h-4 w-4" />} label="Tasks" />
          <SidebarButton icon={<Bell className="h-4 w-4" />} label="Reminders" />
          <SidebarButton icon={<Repeat className="h-4 w-4" />} label="Recurring" />
          <SidebarButton icon={<Filter className="h-4 w-4" />} label="Filters" />
        </aside>

        
        <main className="space-y-4">
          
          <Card className="border-white/10 bg-gradient-to-br from-violet-600/20 to-cyan-500/10">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-xl">Welcome back 👋</CardTitle>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-300">
                <Sparkles className="h-3.5 w-3.5" />
                Try: <span className="font-medium text-slate-100">“Meet Sam tomorrow 4pm”</span>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">
              We’ll parse natural language, de‑conflict times, and set reminders.
            </CardContent>
          </Card>

          
          <Tabs defaultValue="upcoming" className="mt-2">
            <TabsList className="border border-white/10 bg-white/5">
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="reminders">Reminders</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4">
              
              <Card className="border-white/10 bg-white/5">
                <CardHeader>
                  <CardTitle className="text-base">Today</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {filtered.map((e) => (
                    <EventRow key={e.id} title={e.title} time={e.time} where={e.where} tag={e.tag} />
                  ))}
                  {filtered.length === 0 && (
                    <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                      No matches. Try a different search.
                    </div>
                  )}
                </CardContent>
              </Card>

              
              <div className="grid gap-4 md:grid-cols-3">
                <ActionCard
                  icon={<CalendarCheck2 className="h-5 w-5" />}
                  title="Create event"
                  desc="Add a time, place, and attendees"
                  cta="Open editor"
                />
                <ActionCard
                  icon={<Bell className="h-5 w-5" />}
                  title="Set reminder"
                  desc={'Ping me in 2h about docs"'}
                  cta="New reminder"
                />
                <ActionCard
                  icon={<ListTodo className="h-5 w-5" />}
                  title="Quick note"
                  desc="Capture thoughts and action items"
                  cta="New note"
                />
              </div>
            </TabsContent>

            <TabsContent value="reminders">
              <EmptyCard title="No reminders yet" hint={'Try: "Remind me every Mon 9am to review PRs"'} />
            </TabsContent>

            <TabsContent value="notes">
              <EmptyCard title="No notes yet" hint="Notes from meetings will appear here automatically" />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

function SidebarButton({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      className={
        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition " +
        (active
          ? "bg-gradient-to-r from-violet-500/20 to-cyan-400/10 text-slate-100 border border-white/10"
          : "hover:bg-white/10 text-slate-300 border border-transparent")
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function EventRow({ title, time, where, tag }: { title: string; time: string; where: string; tag?: string }) {
  return (
    <div className="group flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-slate-300">
          <Clock3 className="h-4 w-4" />
          <span className="truncate text-sm">{time}</span>
          {tag && (
            <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-xs text-slate-300">{tag}</span>
          )}
        </div>
        <div className="mt-1 truncate font-medium text-slate-100">{title}</div>
        <div className="mt-0.5 flex items-center gap-1 text-sm text-slate-400">
          <MapPin className="h-3.5 w-3.5" /> {where}
        </div>
      </div>
      <Button variant="secondary" className="shrink-0 border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15">
        Open <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

function ActionCard({ icon, title, desc, cta }: { icon: React.ReactNode; title: string; desc: string; cta: string }) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader className="pb-2">
        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-slate-950 shadow-[0_10px_30px_-10px_rgba(56,189,248,0.35)]">
          {icon}
        </div>
        <CardTitle className="text-base text-slate-100">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-300">
        <p>{desc}</p>
        <div className="mt-3">
          <Button className="bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-semibold">
            {cta}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return (
    <Card className="border-white/10 bg-white/5 text-slate-300">
      <CardContent className="p-6">
        <div className="text-slate-100 font-medium">{title}</div>
        <div className="mt-1 text-sm">{hint}</div>
      </CardContent>
    </Card>
  );
}
