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
    const session = await getOrCreateCopilotSession(userId);

    const [userMsg] = await db
      .insert(s.messages)
      .values({
        userId,
        sessionId: session.id,
        role: "user",
        content,
      })
      .returning({ id: s.messages.id });

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
    } catch {}

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

    console.log("REMINDER DATA:", JSON.stringify(reminder, null, 2));

    if (
      intent === "message" &&
      data.receiver &&
      data.content
    ) {
      const receiver = data.receiver.toString().trim();
      const msgContent = data.content.toString().trim();

      const myThreads = await db
        .select()
        .from(s.threads)
        .where(eq(s.threads.isArchived, false));

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

      const myThreadIds = new Set(
        participants
          .filter((p) => p.userId === userId)
          .map((p) => p.threadId)
      );

      const needle = receiver.toLowerCase();

      const matched = myThreads.find((t) => {
        if (t.type !== "user_chat") return false;
        if (!myThreadIds.has(t.id)) return false;

        const members = participantsByThread[t.id] || [];
        const others = members.filter(
          (m) => m.userId !== userId
        );

        if (!others.length) return false;

        const other = others[0];
        const labels: string[] = [];

        if (other.displayName) {
          labels.push(other.displayName);
        }

        if (other.email) {
          labels.push(other.email);
          labels.push(other.email.split("@")[0]);
        }

        return labels.some((label) =>
          label.toLowerCase().includes(needle)
        );
      });

      if (!matched) {
        reply = `No existing conversation found with "${receiver}".`;
      } else {
        const meInThread = await db
          .select({
            userId: s.threadParticipants.userId,
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

        if (!meInThread.length) {
          reply =
            "You are not a participant in that conversation.";
        } else {
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
              createdAt: s.chatMessages.createdAt,
            });

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

          const pretty =
            participantsByThread[matched.id]?.find(
              (p) => p.userId !== userId
            )?.displayName || receiver;

          reply = `Sent to ${pretty}: ${msgContent}`;
        }
      }

      intent = "message";
      reminder = null;
    }

    if (intent === "reminder" && reminder) {
      const structured = reminder.structured ?? reminder;

      const title = (
        structured.title ?? "Reminder"
      ).toString();

      const body = structured.body ?? null;

      const sourceTzNorm =
        (typeof structured.sourceTz === "string" &&
          structured.sourceTz) ||
        (typeof sourceTz === "string" && sourceTz) ||
        "UTC";

      const dueIso =
        structured.dueAtUtc ??
        structured.due ??
        structured.whenUtc ??
        structured.when_iso ??
        structured.when ??
        null;

      if (dueIso) {
        const due = new Date(dueIso);

        if (!Number.isNaN(due.getTime())) {
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
                structured.recurrenceRrule ?? null,
              channelPrefs:
                structured.channelPrefs ?? null,
              sourceMessageId:
                userMsg?.id ?? null,
            })
            .returning();

          reminder = {
            id: rem.id,
            title,
            body,
            dueAtUtc: due.toISOString(),
            sourceTz: sourceTzNorm,
            recurrenceRrule:
              structured.recurrenceRrule ?? null,
            channelPrefs:
              structured.channelPrefs ?? null,
          };

          if (!reply) {
            reply = `Reminder scheduled for ${due.toLocaleString()} (${sourceTzNorm}).`;
          }
        } else {
          console.warn("Invalid reminder dueAtUtc:", dueIso);
        }
      } else {
        console.warn("Reminder missing dueAtUtc/when");
      }
    }

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
    console.error("Copilot chat error:", e);

    return new Response(
      JSON.stringify({
        reply: e?.message || "server error",
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