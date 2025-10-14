"use client";
import { useEffect } from "react";


export default function ReminderPuller() {
  useEffect(() => {
    let timer: number | null = null;

    async function poll() {
      try {
        const r = await fetch("/api/notify-user/pull", { cache: "no-store" });
        if (!r.ok) return;
        const { notes } = await r.json();
        if (Array.isArray(notes)) {
          for (const n of notes) {
            const when = n.dueAtUtc ? new Date(n.dueAtUtc).toLocaleString() : "";
            // super-light toast (replace with your toast lib if you like)
            const el = document.createElement("div");
            el.className =
              "fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border bg-white shadow p-3 text-sm";
            el.textContent = `🔔 ${n.title}${n.body ? " — " + n.body : ""}${when ? " • " + when : ""}`;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 5000);
          }
        }
      } catch {}
      timer = window.setTimeout(poll, 5000); // poll every 5s
    }

    poll();
    return () => { if (timer) window.clearTimeout(timer); };
  }, []);

  return null;
}
