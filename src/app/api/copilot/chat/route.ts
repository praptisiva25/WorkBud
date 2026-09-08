// src/app/api/copilot/chat/route.ts

import { auth } from "@clerk/nextjs/server";
import { db } from "../../../../server/db";
import * as s from "../../../../drizzle/schema";
import { getOrCreateCopilotSession } from "../../../../server/copilot";
import { signForCopilot } from "../../../../server/jwt";
import { eq, inArray, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function POST(req: Request) {
  const { text, sourceTz, nowIso, todayLocal } = await req
    .json()
    .catch(() => ({ text: "" }));

  const content = (text ?? "").toString().trim();

  if (!content) {
    return new Response("missing text", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Clerk authentication
  // Fallback header is allowed for local development
  const devUserHeader = req.headers.get("x-user-id")?.trim() || null;
  const { userId: clerkUser } = await auth();
  const userId = clerkUser || devUserHeader;

  if (!userId) {
    return new Response("unauthenticated", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  try {
    // ============================================================
    // 1. ENSURE COPILOT SESSION
    // ============================================================

    const session = await getOrCreateCopilotSession(userId);

    // ============================================================
    // 2. SAVE USER MESSAGE
    // ============================================================

    const [userMsg] = await db
      .insert(s.messages)
      .values({
        userId,
        sessionId: session.id,
        role: "user",
        content,
      })
      .returning({ id: s.messages.id });

    // ============================================================
    // 3. CALL FASTAPI COPILOT
    // ============================================================

    const copilotUrl =
      process.env.COPILOT_SERVICE_URL || "http://localhost:8000";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    try {
      const token = await signForCopilot({
        sub: userId,
        sessionId: session.id,
        scope: "chat:echo",
      });

      headers.Authorization = `Bearer ${token}`;
    } catch {
      // JWT not configured - continue without it
    }

    const r = await fetch(`${copilotUrl}/act`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: content,
        source_tz:
          typeof sourceTz === "string" ? sourceTz : undefined,
        now_iso:
          typeof nowIso === "string" ? nowIso : undefined,
        today_local: todayLocal,
        user_id: userId,
      }),
    });

    // IMPORTANT:
    // Read the response body exactly once.
    // This prevents "Body is unusable: Body has already been read".
    const ok = r.ok;
    const raw = await r.text();

    let data: any = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {
        reply: raw,
      };
    }

    let reply = (data.reply ?? "").toString();
    let intent: string | null = data.intent ?? null;
    let reminder: any = data.reminder ?? null;

    // ============================================================
    // 4. SEND MESSAGE
    // ============================================================

    if (
      intent === "message" &&
      data.receiver &&
      data.content
    ) {
      const receiver = data.receiver.toString().trim();
      const msgContent = data.content.toString().trim();

      console.log("🔎 Extracted receiver:", receiver);
      console.log("💬 Message content:", msgContent);

      // ----------------------------------------------------------
      // Load all active threads
      // ----------------------------------------------------------

      const myThreads = await db
        .select()
        .from(s.threads)
        .where(eq(s.threads.isArchived, false));

      if (!myThreads.length) {
        console.log("❌ No threads found.");
      }

      // ----------------------------------------------------------
      // Load participants for these threads
      // ----------------------------------------------------------

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
            .leftJoin(
              s.users,
              eq(s.users.id, s.threadParticipants.userId)
            )
            .where(
              inArray(
                s.threadParticipants.threadId,
                threadIds
              )
            )
        : [];

      // ----------------------------------------------------------
      // Index participants by thread
      // ----------------------------------------------------------

      const participantsByThread: Record<
        string,
        Array<{
          userId: string;
          displayName: string | null;
          email: string | null;
        }>
      > = {};

      for (const p of participants) {
        (participantsByThread[p.threadId] ||= []).push({
          userId: p.userId,
          displayName: p.displayName,
          email: p.email,
        });
      }

      // ----------------------------------------------------------
      // IMPORTANT:
      // Only consider threads where CURRENT USER is a participant
      // ----------------------------------------------------------

      const myThreadIds = new Set(
        participants
          .filter((p) => p.userId === userId)
          .map((p) => p.threadId)
      );

      console.log(
        "👤 Current user:",
        userId
      );

      console.log(
        "💬 User's thread count:",
        myThreadIds.size
      );

      // ----------------------------------------------------------
      // Find matching conversation
      // ----------------------------------------------------------

      const needle = receiver.toLowerCase();

      const matched = myThreads.find((t) => {
        // Only direct user-to-user chats
        if (t.type !== "user_chat") {
          return false;
        }

        // IMPORTANT:
        // Ignore threads where current user is not a participant
        if (!myThreadIds.has(t.id)) {
          return false;
        }

        const members =
          participantsByThread[t.id] || [];

        // Find the other person
        const others = members.filter(
          (m) => m.userId !== userId
        );

        if (others.length === 0) {
          return false;
        }

        const other = others[0];

        const labels: string[] = [];

        if (other.displayName) {
          labels.push(other.displayName);
        }

        if (other.email) {
          labels.push(other.email);
          labels.push(
            other.email.split("@")[0]
          );
        }

        return labels.some((label) =>
          label.toLowerCase().includes(needle)
        );
      });

      // ----------------------------------------------------------
      // No matching thread
      // ----------------------------------------------------------

      if (!matched) {
        console.log(
          "❌ No thread found for receiver:",
          receiver
        );

        reply = `No existing conversation found with "${receiver}".`;
      } else {
        // --------------------------------------------------------
        // Safety check:
        // Make absolutely sure caller belongs to thread
        // --------------------------------------------------------

        const meInThread = await db
          .select({
            userId:
              s.threadParticipants.userId,
          })
          .from(s.threadParticipants)
          .where(
            and(
              eq(
                s.threadParticipants.threadId,
                matched.id
              ),
              eq(
                s.threadParticipants.userId,
                userId
              )
            )
          )
          .limit(1);

        if (meInThread.length === 0) {
          console.log(
            "🚫 Caller is not a participant on thread:",
            matched.id
          );

          reply =
            "You are not a participant in that conversation.";
        } else {
          // ------------------------------------------------------
          // Insert chat message
          // ------------------------------------------------------

          const [mrow] = await db
            .insert(s.chatMessages)
            .values({
              threadId: matched.id,
              senderId: userId,
              kind: "text",
              source: "manual",
              content: msgContent,
            })
            .returning({
              id: s.chatMessages.id,
              createdAt:
                s.chatMessages.createdAt,
            });

          // ------------------------------------------------------
          // Update thread timestamp
          // ------------------------------------------------------

          await db
            .update(s.threads)
            .set({
              updatedAt: new Date(),
            })
            .where(
              eq(
                s.threads.id,
                matched.id
              )
            );

          // ------------------------------------------------------
          // Get recipient display name
          // ------------------------------------------------------

          const pretty =
            participantsByThread[matched.id]
              ?.find(
                (p) => p.userId !== userId
              )?.displayName ||
            receiver;

          console.log(
            "✅ Sent message",
            mrow?.id,
            "to thread",
            matched.id
          );

          reply = `Sent to ${pretty}: ${msgContent}`;
        }
      }

      intent = "message";
      reminder = null;
    }

    // ============================================================
    // 5. REMINDER
    // ============================================================

    if (
      intent === "reminder" &&
      reminder
    ) {
      // Normalize structure names coming from FastAPI
      const structured =
        reminder.structured ?? reminder;

      const title = (
        structured.title ?? "Reminder"
      ).toString();

      const body =
        structured.body ?? null;

      const sourceTzNorm =
        (
          typeof structured.sourceTz ===
            "string" &&
          structured.sourceTz
        ) ||
        (
          typeof sourceTz === "string" &&
          sourceTz
        ) ||
        "UTC";

      // Accept multiple possible field names
      const dueIso: string | null =
        structured.dueAtUtc ??
        structured.due ??
        structured.whenUtc ??
        structured.when_iso ??
        structured.when ??
        null;

      if (!dueIso) {
        console.warn(
          "⚠️ Reminder missing dueAtUtc/when — skipping insert"
        );
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
            recurrenceRrule:
              structured.recurrenceRrule ??
              null,
            channelPrefs:
              structured.channelPrefs ??
              null,
            sourceMessageId:
              userMsg?.id ?? null,
          })
          .returning();

        // Bubble reminder information to client
        reminder = {
          id: rem.id,
          title,
          body,
          dueAtUtc: due.toISOString(),
          sourceTz: sourceTzNorm,
          recurrenceRrule:
            structured.recurrenceRrule ??
            null,
          channelPrefs:
            structured.channelPrefs ??
            null,
        };

        // Default reply
        if (!reply) {
          const when =
            new Date(due).toLocaleString();

          reply =
            `Reminder scheduled for ${when} (${sourceTzNorm}).`;
        }
      }
    }

    // ============================================================
    // 6. SAVE ASSISTANT MESSAGE
    // ============================================================

    await db.insert(s.messages).values({
      userId,
      sessionId: session.id,
      role: "assistant",
      content:
        reply ||
        (ok
          ? "(empty)"
          : `Error: ${reply || `HTTP ${r.status}`}`),
      meta: ok
        ? null
        : ({
            httpStatus: r.status,
          } as any),
    });

    // ============================================================
    // 7. RETURN RESPONSE
    // ============================================================

    return new Response(
      JSON.stringify({
        reply,
        intent,
        reminder,
        image_url: data.image_url ?? null,
      }),
      {
        status: ok ? 200 : 502,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e: any) {
    console.error(
      "🚨 Copilot chat error:",
      e
    );

    return new Response(
      JSON.stringify({
        reply:
          e?.message ||
          "server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}