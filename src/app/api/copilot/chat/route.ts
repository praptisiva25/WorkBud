import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import * as s from "@/drizzle/schema";
import { getOrCreateCopilotSession } from "@/server/copilot";
import { signForCopilot } from "@/server/jwt";

export async function POST(req: Request) {
  // 0) read input
  const { text,sourceTz, nowIso,todayLocal  } = await req.json().catch(() => ({ text: "" }));
  const content = (text ?? "").toString().trim();
  if (!content) {
    return new Response("missing text", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  // 1) identify user
  const devUserHeader = req.headers.get("x-user-id")?.trim() || null;
  const { userId: clerkUser } = await auth();
  const userId = clerkUser || devUserHeader;
  if (!userId) {
    return new Response("unauthenticated", { status: 401, headers: { "Content-Type": "text/plain" } });
  }

  try {
    // 2) ensure personal Copilot session
    const session = await getOrCreateCopilotSession(userId);

    // 3) append USER message
    await db.insert(s.messages).values({
      userId,
      sessionId: session.id,
      role: "user",
      content,
    });

    // 4) call copilot backend
    const copilotUrl = process.env.COPILOT_SERVICE_URL || "http://localhost:8000";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const token = await signForCopilot({ sub: userId, sessionId: session.id, scope: "chat:echo" });
      headers.Authorization = `Bearer ${token}`;
    } catch { /* safe to ignore */ }

    const r = await fetch(`${copilotUrl}/act`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: content, 
      source_tz: typeof sourceTz === "string" ? sourceTz : undefined,
      now_iso:   typeof nowIso   === "string" ? nowIso   : undefined,
      today_local: todayLocal,
     }),
      
    });

    const ok = r.ok;
    let reply = "";
    let intent: string | null = null;
    let reminder: any = null;

    try {
      const data = await r.json(); // we now return JSON from FastAPI
      reply = (data.reply ?? "").toString();
      intent = data.intent ?? null;
      reminder = data.reminder ?? null;
    } catch {
      // fallback to text if server didn't send JSON
      reply = await r.text();
    }

    // 5) if reminder intent → insert into reminders table
    if (intent === "reminder" && reminder) {
      await db.insert(s.reminders).values({
        id: crypto.randomUUID(),
        userId: reminder.userId,
        title: reminder.title,
        body: reminder.body,
        dueAtUtc: new Date(reminder.dueAtUtc),
        sourceTz: reminder.sourceTz,
        status: reminder.status,
        channelPrefs: reminder.channelPrefs,
        recurrenceRrule: reminder.recurrenceRrule,
        sourceMessageId: null, // link to message if you want
      });
    }

    // 6) append ASSISTANT message
    await db.insert(s.messages).values({
      userId,
      sessionId: session.id,
      role: "assistant",
      content: reply || (ok ? "(empty)" : `Error: ${reply || `HTTP ${r.status}`}`),
      meta: ok ? null : ({ httpStatus: r.status } as any),
    });

    // 7) return JSON back to UI
    return new Response(
      JSON.stringify({ reply, intent, reminder }),
      { status: ok ? 200 : 502, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    const errText = e?.message || "server error";

    try {
      const { userId: clerkUser2 } = await auth();
      const user2 = clerkUser2 || devUserHeader;
      if (user2) {
        const session = await getOrCreateCopilotSession(user2);
        await db.insert(s.messages).values({
          userId: user2,
          sessionId: session.id,
          role: "assistant",
          content: `Error: ${errText}`,
          meta: { error: errText } as any,
        });
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ reply: errText }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
