// scripts/runReminders.ts
import "dotenv/config";
import { db } from "../src/server/db";
import * as s from "../src/drizzle/schema";
import { and, eq, lte } from "drizzle-orm";

async function deliver(rem: typeof s.reminders.$inferSelect) {
  
  console.log(
    `🔔 Reminder fired for user=${rem.userId} | ${rem.title} | ${rem.body ?? ""} | due=${rem.dueAtUtc.toISOString()}`
  );
}

async function tick() {
  const now = new Date(); 
  console.log(`[tick] now=${now.toISOString()}`);

  
  const due = await db
    .select()
    .from(s.reminders)
    .where(and(eq(s.reminders.status, "scheduled"), lte(s.reminders.dueAtUtc, now)));

  if (!due.length) {
    console.log("no reminders due");
    return;
  }

  for (const r of due) {
    try {
      
      await deliver(r);

      
      await db
        .update(s.reminders)
        .set({ status: "sent" })
        .where(eq(s.reminders.id, r.id));

      console.log(`✅ marked sent: ${r.title}`);
    } catch (err) {
      console.error(`❌ failed to deliver reminder ${r.id}:`, err);
    }
  }
}

// run immediately + every 30s
console.log("✅ Simple UTC Reminder Runner started...");
tick().catch(console.error);
setInterval(() => tick().catch(console.error), 30_000);
