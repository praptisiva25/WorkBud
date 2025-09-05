// src/server/messages.ts
import { db } from "./db";
import * as schema from "@/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";

/** Ensure caller belongs to the thread */
async function assertParticipant(threadId: string, userId: string) {
  const rows = await db
    .select({ threadId: schema.threadParticipants.threadId })
    .from(schema.threadParticipants)
    .where(
      and(
        eq(schema.threadParticipants.threadId, threadId),
        eq(schema.threadParticipants.userId, userId)
      )
    )
    .limit(1);
  if (rows.length === 0) throw Object.assign(new Error("not a participant"), { status: 403 });
}

/** Insert a text message */
export async function sendTextMessage(opts: {
  threadId: string;
  senderId: string;          // Clerk user id
  content: string;
}) {
  const { threadId, senderId, content } = opts;
  if (!content?.trim()) throw Object.assign(new Error("empty content"), { status: 400 });

  await assertParticipant(threadId, senderId);

  const [msg] = await db
    .insert(schema.chatMessages)
    .values({
      threadId,
      senderId,
      source: "manual", // or "copilot" later
      kind: "text",
      content: content.trim(),
    })
    .returning({
      id: schema.chatMessages.id,
      threadId: schema.chatMessages.threadId,
      senderId: schema.chatMessages.senderId,
      source: schema.chatMessages.source,
      kind: schema.chatMessages.kind,
      content: schema.chatMessages.content,
      createdAt: schema.chatMessages.createdAt,
    });

  // bump thread updatedAt
  await db
    .update(schema.threads)
    .set({ updatedAt: new Date() })
    .where(eq(schema.threads.id, threadId));

  return msg;
}

/** List recent messages in a thread */
export async function listMessages(opts: {
  threadId: string;
  userId: string;
  limit?: number;
}) {
  const { threadId, userId, limit = 50 } = opts;
  await assertParticipant(threadId, userId);

  const rows = await db
    .select({
      id: schema.chatMessages.id,
      threadId: schema.chatMessages.threadId,
      senderId: schema.chatMessages.senderId,
      source: schema.chatMessages.source,
      kind: schema.chatMessages.kind,
      content: schema.chatMessages.content,
      fileUrl: schema.chatMessages.fileUrl,
      fileName: schema.chatMessages.fileName,
      fileSize: schema.chatMessages.fileSize,
      createdAt: schema.chatMessages.createdAt,
    })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.threadId, threadId))
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(limit);

  return rows.reverse(); // newest-last for UI
}
