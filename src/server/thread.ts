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

    // Ensure both participants exist (your schema already has unique(thread_id, user_id))
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
    .innerJoin(schema.threads, eq(schema.threads.id, schema.threadParticipants.threadId))
    .where(eq(schema.threadParticipants.userId, userId))
    .orderBy(desc(schema.threads.updatedAt));

  return rows; // already flat
}
