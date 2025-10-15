// app/api/threads/get-or-create/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import * as schema from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";

// helper to generate consistent dmKey
function makeDmKey(a: string, b: string) {
  return `dm:${[a, b].sort().join(":")}`;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  const body = await req.json();
  const otherId: string = body.userId;

  if (!userId || !otherId)
    return NextResponse.json({ error: "unauthorized or missing userId" }, { status: 400 });

  const dmKey = makeDmKey(userId, otherId);

  
  const existing = await db
    .select()
    .from(schema.threads)
    .where(and(eq(schema.threads.type, "user_chat"), eq(schema.threads.dmKey, dmKey)))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ thread: existing[0] });
  }

  
  const [thread] = await db
    .insert(schema.threads)
    .values({
      type: "user_chat",
      dmKey,
      title: null,
      isArchived: false,
    })
    .returning();

  await db.insert(schema.threadParticipants).values([
    { threadId: thread.id, userId, role: "owner" },
    { threadId: thread.id, userId: otherId, role: "member" },
  ]);

  return NextResponse.json({ thread });
}
