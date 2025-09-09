"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Button } from "../components/ui/button";
import { ArrowRight, CalendarCheck2, Bell, NotepadText, Sparkles } from "lucide-react";


export default function HomePage() {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && userId) router.push("/events");
  }, [isLoaded, userId, router]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-200">
        <div className="animate-pulse rounded-2xl bg-slate-900/60 p-8 shadow-lg">
          <div className="h-6 w-48 rounded bg-slate-800 mb-3" />
          <div className="h-4 w-80 rounded bg-slate-800 mb-2" />
          <div className="h-4 w-64 rounded bg-slate-800" />
        </div>
      </div>
    );
  }

  
  if (userId) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-200">
        <p className="text-sm text-slate-400">Redirecting to your dashboard…</p>
      </div>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-slate-950">
      
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.25),rgba(15,23,42,0.2)_70%,rgba(15,23,42,1))]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[url('/noise.png')]" />
        <div className="absolute -top-24 -left-24 h-[32rem] w-[32rem] rounded-full blur-3xl bg-cyan-400/20" />
        <div className="absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl bg-violet-500/20" />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 select-none">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-[0_10px_30px_-10px_rgba(56,189,248,0.45)]">
            <CalendarCheck2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-100">WorkBud</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          <a href="#features" className="hover:text-slate-100 transition">Features</a>
          <a href="#how" className="hover:text-slate-100 transition">How it works</a>
          <a href="#pricing" className="hover:text-slate-100 transition">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="text-slate-300 hover:text-slate-100">
            <SignInButton>Sign in</SignInButton>
          </Button>
          <Button asChild className="bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-semibold shadow-lg shadow-violet-500/20 hover:opacity-95">
            <SignUpButton>Sign Up</SignUpButton>
          </Button>
          <div className="ml-1 md:ml-2">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-10 pb-12 md:pt-16 md:pb-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI‑assisted scheduling & notes</span>
          </div>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-100 md:text-6xl">
            Plan smarter. <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-300">Work better.</span>
          </h1>
          <p className="mt-4 text-balance text-slate-300 md:text-lg">
            WorkBud brings your events, reminders, and meeting notes together—so you never miss what matters.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-semibold hover:opacity-95">
              <SignUpButton>Create your free account</SignUpButton>
            </Button>
            <Button size="lg" variant="secondary" className="border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15">
              <a href="#features" className="flex items-center gap-2">See features <ArrowRight className="h-4 w-4" /></a>
            </Button>
          </div>
        </div>

        {/* Quick trust row */}
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: <CalendarCheck2 className="h-4 w-4" />, label: "Unified calendar" },
            { icon: <Bell className="h-4 w-4" />, label: "Natural‑language reminders" },
            { icon: <NotepadText className="h-4 w-4" />, label: "Auto‑organized notes" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-slate-300 backdrop-blur">
              {item.icon}
              <span className="text-sm">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <FeatureCard
            title="Smart scheduling"
            desc='Type "Meet Sam tomorrow 4pm" and we’ll parse, de‑conflict, and add it.'
            icon={<CalendarCheck2 className="h-5 w-5" />}
          />
          <FeatureCard
            title="Reminders that speak human"
            desc={'"Ping me in 2h if docs aren’t done" → you’ll actually get pinged.'}
            icon={<Bell className="h-5 w-5" />}
          />
          <FeatureCard
            title="Notes that file themselves"
            desc="Action items, attendees, and decisions auto‑extracted after meetings."
            icon={<NotepadText className="h-5 w-5" />}
          />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur md:p-10">
          <h2 className="text-2xl font-semibold text-slate-100 md:text-3xl">How it works</h2>
          <ol className="mt-4 grid gap-4 text-slate-300 md:grid-cols-3">
            <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-slate-100">1. Sign up</p>
              <p className="text-sm">Create a free account with Clerk in seconds.</p>
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-slate-100">2. Connect</p>
              <p className="text-sm">Sync your calendars and enable reminders.</p>
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-slate-100">3. Flow</p>
              <p className="text-sm">Use natural language: we handle the rest.</p>
            </li>
          </ol>
          <div className="mt-6">
            <Button asChild className="bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-semibold">
              <SignUpButton>Start now</SignUpButton>
            </Button>
          </div>
        </div>
      </section>

      
      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 text-sm text-slate-400 md:flex-row">
          <p>© {new Date().getFullYear()} WorkBud. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-slate-200">Privacy</a>
            <a href="#" className="hover:text-slate-200">Terms</a>
            <a href="#" className="hover:text-slate-200">Support</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:bg-white/10">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-slate-950 shadow-[0_10px_30px_-10px_rgba(56,189,248,0.35)]">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      <p className="mt-1 text-sm text-slate-300">{desc}</p>
    </div>
  );
}
