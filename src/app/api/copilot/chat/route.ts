// src/app/api/copilot/chat/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "../../../../server/db";
import * as s from "../../../../drizzle/schema";
import { getOrCreateCopilotSession } from "../../../../server/copilot";
import { signForCopilot } from "../../../../server/jwt";
import { eq, inArray, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function POST(req: Request) {
  const { text, sourceTz, nowIso, todayLocal } = await req.json().catch(() => ({ text: "" }));
  const content = (text ?? "").toString().trim();
  if (!content) {
    return new Response("missing text", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  // Clerk (fallback header allowed if you still need it locally)
  const devUserHeader = req.headers.get("x-user-id")?.trim() || null;
  const { userId: clerkUser } = await auth();
  const userId = clerkUser || devUserHeader;
  if (!userId) {
    return new Response("unauthenticated", { status: 401, headers: { "Content-Type": "text/plain" } });
  }

  try {
    // Ensure Copilot session
    const session = await getOrCreateCopilotSession(userId);

    // Save USER message (copilot session log)
    const [userMsg] = await db.insert(s.messages).values({
      userId,
      sessionId: session.id,
      role: "user",
      content,
    }).returning({ id: s.messages.id });

    // Call FastAPI for intent + extraction
    const copilotUrl = process.env.COPILOT_SERVICE_URL || "http://localhost:8000";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const token = await signForCopilot({ sub: userId, sessionId: session.id, scope: "chat:echo" });
      headers.Authorization = `Bearer ${token}`;
    } catch { /* ignore if not configured */ }

    const r = await fetch(`${copilotUrl}/act`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: content,
        source_tz: typeof sourceTz === "string" ? sourceTz : undefined,
        now_iso: typeof nowIso === "string" ? nowIso : undefined,
        today_local: todayLocal,
        user_id: userId, // also pass explicit user id
      }),
    });

    const ok = r.ok;
    const data = await r.json().catch(async () => ({ reply: await r.text() }));
    let reply = (data.reply ?? "").toString();
    let intent: string | null = data.intent ?? null;
    let reminder: any = data.reminder ?? null;

    // === SEND THE MESSAGE HERE ===
    if (intent === "message" && data.receiver && data.content) {
      const receiver = data.receiver.trim();
      const msgContent = data.content.trim();

      console.log("🔎 Extracted receiver:", receiver);
      console.log("💬 Message content:", msgContent);

      // 1) Load this user's threads
      // If you have listMyThreads(userId), use that.
      const myThreads = await db
        .select()
        .from(s.threads)
        .where(eq(s.threads.isArchived, false)); // optional; keep your own filter if needed

      if (!myThreads.length) {
        console.log("❌ No threads for this user.");
      }

      // 2) Get participants for those threads
      const threadIds = myThreads.map((t) => t.id);
      const participants = threadIds.length
        ? await db
            .select({
              threadId: s.threadParticipants.threadId,
              userId: s.threadParticipants.userId,
              displayName: s.users.displayName,
              email: s.users.email,
            })
            .from(s.threadParticipants)
            .leftJoin(s.users, eq(s.users.id, s.threadParticipants.userId))
            .where(inArray(s.threadParticipants.threadId, threadIds))
        : [];

      // 3) Index participants by thread
      const participantsByThread: Record<string, Array<{ userId: string; displayName: string | null; email: string | null }>> = {};
      for (const p of participants) {
        (participantsByThread[p.threadId] ||= []).push({
          userId: p.userId,
          displayName: p.displayName,
          email: p.email,
        });
      }

      // 4) Find a 1:1 DM whose other participant matches the extracted name/email
      const needle = receiver.toLowerCase();
      const matched = myThreads.find((t) => {
        if (t.type !== "user_chat") return false;
        const members = participantsByThread[t.id] || [];
        const others = members.filter((m) => m.userId !== userId);
        if (others.length === 0) return false;
        const other = others[0];
        const labels: string[] = [];
        if (other.displayName) labels.push(other.displayName);
        if (other.email) {
          labels.push(other.email);
          labels.push(other.email.split("@")[0]);
        }
        return labels.some((l) => l.toLowerCase().includes(needle));
      });

      if (!matched) {
        console.log("❌ No thread found for receiver:", receiver);
        reply = `No existing conversation found with "${receiver}".`;
      } else {
        // 5) Safety: ensure the caller is a participant of that thread
        const meInThread = await db
          .select({ userId: s.threadParticipants.userId })
          .from(s.threadParticipants)
          .where(and(eq(s.threadParticipants.threadId, matched.id), eq(s.threadParticipants.userId, userId)))
          .limit(1);

        if (meInThread.length === 0) {
          console.log("🚫 Caller is not a participant on thread:", matched.id);
          reply = "You are not a participant in that conversation.";
        } else {
          // 6) Insert chat message
          const [mrow] = await db
            .insert(s.chatMessages)
            .values({
              threadId: matched.id,
              senderId: userId,
              kind: "text",
              source: "manual",
              content: msgContent,
            })
            .returning({ id: s.chatMessages.id, createdAt: s.chatMessages.createdAt });

          // 7) Bump updatedAt on the thread
          await db.update(s.threads).set({ updatedAt: new Date() }).where(eq(s.threads.id, matched.id));

          const pretty =
            (participantsByThread[matched.id]?.find((p) => p.userId !== userId)?.displayName) || receiver;

          console.log("✅ Sent message", mrow?.id, "to thread", matched.id);
          reply = `✅ Sent to ${pretty}: ${msgContent}`;
        }
      }

      intent = "message";
      reminder = null;
    }


    // === REMINDER: persist to DB if present ===
if (intent === "reminder" && reminder) {
  // Normalize structure names coming from FastAPI
  const structured = reminder.structured ?? reminder;

  const title = (structured.title ?? "Reminder").toString();
  const body  = structured.body ?? null;
  const sourceTzNorm =
    (typeof structured.sourceTz === "string" && structured.sourceTz) ||
    (typeof sourceTz === "string" && sourceTz) ||
    "UTC";

  // Accept multiple possible field names from the extractor
  const dueIso: string | null =
    structured.dueAtUtc ??
    structured.due ??
    structured.whenUtc ??
    structured.when_iso ??
    structured.when ??
    null;

  if (!dueIso) {
    console.warn("⚠️ Reminder missing dueAtUtc/when — skipping insert");
  } else {
    const due = new Date(dueIso);

    const [rem] = await db
      .insert(s.reminders)
      .values({
        id: sql`gen_random_uuid()`,
        userId,
        title,
        body,
        dueAtUtc: due,
        sourceTz: sourceTzNorm,
        status: "scheduled",
        recurrenceRrule: structured.recurrenceRrule ?? null,
        channelPrefs: structured.channelPrefs ?? null,
        sourceMessageId: userMsg?.id ?? null, // link to the user message we just saved
      })
      .returning();

    // Bubble reminder info back to the client
    reminder = {
      id: rem.id,
      title,
      body,
      dueAtUtc: due.toISOString(),
      sourceTz: sourceTzNorm,
      recurrenceRrule: structured.recurrenceRrule ?? null,
      channelPrefs: structured.channelPrefs ?? null,
    };

    // If LLM didn’t return a reply, provide a nice default
    if (!reply) {
      const when = new Date(due).toLocaleString();
      reply = `✅ Reminder scheduled for ${when} (${sourceTzNorm}).`;
    }
  }
}


    // Save ASSISTANT message (copilot session log)
    await db.insert(s.messages).values({
      userId,
      sessionId: session.id,
      role: "assistant",
      content: reply || (ok ? "(empty)" : `Error: ${reply || `HTTP ${r.status}`}`),
      meta: ok ? null : ({ httpStatus: r.status } as any),
    });

    return new Response(JSON.stringify({ reply, intent, reminder }), {
      status: ok ? 200 : 502,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("🚨 Copilot chat error:", e);
    return new Response(JSON.stringify({ reply: e?.message || "server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
