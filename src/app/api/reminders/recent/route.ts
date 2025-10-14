import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import * as s from "@/drizzle/schema";
import { and, eq, gte } from "drizzle-orm";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("unauthorized", { status: 401 });

  // look back a few minutes so we catch items fired by the runner
  const LOOKBACK_MS = 5 * 60 * 1000;
  const since = new Date(Date.now() - LOOKBACK_MS); // UTC

  const rows = await db
    .select()
    .from(s.reminders)
    .where(
      and(
        eq(s.reminders.userId, userId),
        eq(s.reminders.status, "sent"),
        gte(s.reminders.dueAtUtc, since) // recently fired
      )
    );

  return Response.json(rows);
}
