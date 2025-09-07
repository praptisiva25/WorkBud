// src/app/api/copilot/chat/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { signForCopilot } from "@/server/jwt";
import { getOrCreateCopilotSession, insertUserMsg, insertAssistantMsg } from "@/server/copilot";
import { db } from "@/server/db";
import * as s from "@/drizzle/schema";
import { sql } from "drizzle-orm";

// Validate Copilot payload
const CopilotReminder = z.object({
  title: z.string().min(1).optional(),
  body: z.string().nullable().optional(),
  dueAtUtc: z.string().min(1),              // ISO string
  sourceTz: z.string().min(1).default("UTC"),
  recurrenceRrule: z.string().nullable().optional(),
  channelPrefs: z.record(z.string(), z.any()).nullable().optional(),
});

export async function POST(req: Request) {
  // Allow dev testing without a Clerk session
  const devUserHeader = req.headers.get("x-user-id")?.trim() || null;
  const { userId: clerkUser } = await auth();
  const userId = clerkUser || devUserHeader;

  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));
  const text: string | undefined = body?.text;

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    // 1) Ensure a personal Copilot session (separate from human↔human threads)
    const session = await getOrCreateCopilotSession(userId);

    // 2) Store the user's message into copilot_messages
    const userMsg = await insertUserMsg(userId, session.id, text.trim());

    // 3) Call Copilot with a Next-signed EdDSA JWT
    const token = await signForCopilot({ sub: userId, sessionId: session.id, scope: "reminders:create" });
    const copilotUrl = process.env.COPILOT_SERVICE_URL || "http://localhost:8000";

    const copilotRes = await fetch(`${copilotUrl}/act`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        sessionId: session.id,
        text: text.trim(),
        sourceTz: body?.sourceTz || "Asia/Kolkata",
      }),
    });

    const raw = await copilotRes.text();
    let json: any;
    try { json = JSON.parse(raw); } catch { json = { raw }; }

    if (!copilotRes.ok) {
      // Surface copilot’s error for quicker debugging
      return NextResponse.json(
        { error: "copilot failed", status: copilotRes.status, detail: json },
        { status: 502 },
      );
    }

    // 4) Validate & normalize the Copilot response
    const structured = CopilotReminder.parse(json);

    // Parse and ensure Date is valid
    const due = new Date(structured.dueAtUtc);
    if (Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: "invalid dueAtUtc from copilot" }, { status: 502 });
    }

    // 5) Insert reminder
    const [rem] = await db
      .insert(s.reminders)
      .values({
        id: sql`gen_random_uuid()`,
        userId,
        title: structured.title ?? "Reminder",
        body: structured.body ?? null,
        dueAtUtc: due,
        sourceTz: structured.sourceTz ?? "UTC",
        status: "scheduled",
        recurrenceRrule: structured.recurrenceRrule ?? null,
        channelPrefs: structured.channelPrefs ?? null,
        sourceMessageId: userMsg.id,
      })
      .returning();

    // 6) Store assistant confirmation in copilot_messages
    const humanTime = new Date(rem.dueAtUtc as unknown as string).toLocaleString("en-IN", {
      timeZone: structured.sourceTz ?? "Asia/Kolkata",
    });

    const reply = `✅ Reminder set: ${rem.title} — ${humanTime} (${structured.sourceTz ?? "UTC"})`;
    const assistantMsg = await insertAssistantMsg(userId, session.id, reply, { reminderId: rem.id });

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      reminder: rem,
      assistantMsg,
    });
  } catch (e: any) {
    // Log server-side for diagnosis; keep response tidy
    console.error("[/api/copilot/chat] error:", e);
    return NextResponse.json({ error: e?.message || "server error" }, { status: 500 });
  }
}
