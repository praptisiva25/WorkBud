import { db } from "@/server/db";
import * as schema from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function getOrCreateCopilotSession(userId: string) {
  const existing = await db.query.copilotSessions.findFirst({
    where: eq(schema.copilotSessions.userId, userId),
    orderBy: (t) => [desc(t.createdAt)],
  });
  if (existing) return existing;

  const [row] = await db
    .insert(schema.copilotSessions)
    .values({
      id: sql`gen_random_uuid()`,
      userId,
      title: "My Copilot",
    })
    .returning();

  return row;
}



export async function insertUserMsg(userId: string, sessionId: string, text: string) {
  const [row] = await db.insert(schema.messages).values({
    id: sql`gen_random_uuid()`,
    userId,
    sessionId,
    role: "user",
    content: text,
    meta: null,
  }).returning();
  return row;
}

export async function insertAssistantMsg(userId: string, sessionId: string, text: string, meta?: any) {
  const [row] = await db.insert(schema.messages).values({
    id: sql`gen_random_uuid()`,
    userId,
    sessionId,
    role: "assistant",
    content: text,
    meta: meta ?? null,
  }).returning();
  return row;
}
