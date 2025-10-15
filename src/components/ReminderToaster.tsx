"use client";
import useSWR from "swr";
import { useEffect, useRef } from "react";

const fetcher = (url: string) => fetch(url).then(r => r.json());

type Reminder = {
  id: string;
  userId: string;
  title: string | null;
  body: string | null;
  dueAtUtc: string;   
  status: "scheduled" | "processing" | "sent";
  sourceTz?: string | null;
};

export default function ReminderToaster() {
  const { data } = useSWR<Reminder[]>("/api/reminders/recent", fetcher, {
    refreshInterval: 8000,  // poll every 8s
  });

  // keep track of which ones we've shown in this session
  const seen = useRef<Set<string>>(new Set<string>());

  useEffect(() => {
    if (!data) return;
    for (const r of data) {
      if (seen.current.has(r.id)) continue;
      seen.current.add(r.id);

      // simple toast — replace with your UI toast lib if you have one
      const when = new Date(r.dueAtUtc).toLocaleString();
      const msg = `${r.title ?? "Reminder"}${r.body ? " — " + r.body : ""}\nDue (UTC): ${when}`;

      // browser notification if permitted, else fallback alert/log
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(r.title ?? "Reminder", { body: `${r.body ?? ""} • ${when}`.trim() });
      } else {
        // quick inline toast (very basic)
        const div = document.createElement("div");
        div.className =
          "fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border bg-white shadow p-3 text-sm";
        div.textContent = msg;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 5000);
        // console.log as well
        console.log("🔔", msg);
      }
    }
  }, [data]);

  // ask permission once
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  return null; // headless component
}
