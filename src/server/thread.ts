// src/server/threads.ts
import { db } from "./db";
import * as schema from "../drizzle/schema";
import { desc,eq } from "drizzle-orm";

export async function ensureDmThread(userA: string, userB: string) {
  if (userA === userB) throw new Error("cannot DM yourself");

  // canonical ordering so A-B and B-A map to the same dmKey
  const [u1, u2] = userA < userB ? [userA, userB] : [userB, userA];
  const dmKey = `dm:${u1}:${u2}`;

  return await db.transaction(async (tx) => {
    // Try to create; if unique constraint fires, select the existing thread
    let thread =
      (await tx
        .insert(schema.threads)
        .values({ type: "user_chat", dmKey })
        .onConflictDoNothing()
        .returning({ id: schema.threads.id }))[0];

    if (!thread) {
      thread = (
        await tx
          .select({ id: schema.threads.id })
          .from(schema.threads)
          .where(eq(schema.threads.dmKey, dmKey))
          .limit(1)
      )[0];
    }

    
    await tx
      .insert(schema.threadParticipants)
      .values([
        { threadId: thread.id, userId: u1, role: "owner" },
        { threadId: thread.id, userId: u2, role: "member" },
      ])
      .onConflictDoNothing();

    return thread.id;
  });
}


export async function listMyThreads(userId: string) {
  const rows = await db
    .select({
      id: schema.threads.id,
      type: schema.threads.type,
      title: schema.threads.title,
      dmKey: schema.threads.dmKey,
      updatedAt: schema.threads.updatedAt,
    })
    .from(schema.threadParticipants)
    .innerJoin(
      schema.threads,
      eq(schema.threads.id, schema.threadParticipants.threadId)
    )
    .where(eq(schema.threadParticipants.userId, userId))
    .orderBy(desc(schema.threads.updatedAt));

  if (!rows.length) return rows;

  const participantRows = await db
    .select({
      threadId: schema.threadParticipants.threadId,
      userId: schema.threadParticipants.userId,
      displayName: schema.users.displayName,
    })
    .from(schema.threadParticipants)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.threadParticipants.userId)
    );

  const namesByThread = new Map<string, string>();

  for (const p of participantRows) {
    if (p.userId !== userId && p.displayName) {
      namesByThread.set(p.threadId, p.displayName);
    }
  }

  return rows.map((t) => ({
    ...t,
    title:
      t.type === "user_chat"
        ? namesByThread.get(t.id) || t.title || "Direct message"
        : t.title || "Group chat",
  }));
}
