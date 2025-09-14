import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import * as s from "@/drizzle/schema";
import { getOrCreateCopilotSession } from "@/server/copilot";
import { signForCopilot } from "@/server/jwt"; // ok if you have it; we fall back if it fails

export async function POST(req: Request) {
  // 0) read input
  const { text } = await req.json().catch(() => ({ text: "" }));
  const content = (text ?? "").toString().trim();
  if (!content) {
    return new Response("missing text", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  // 1) identify user (Clerk or dev header)
  const devUserHeader = req.headers.get("x-user-id")?.trim() || null;
  const { userId: clerkUser } = await auth();
  const userId = clerkUser || devUserHeader;
  if (!userId) {
    return new Response("unauthenticated", { status: 401, headers: { "Content-Type": "text/plain" } });
  }

  try {
    // 2) ensure personal Copilot session
    const session = await getOrCreateCopilotSession(userId);

    // 3) append USER message immediately
    await db.insert(s.messages).values({
      userId,
      sessionId: session.id,
      role: "user",
      content,
      // meta_json left NULL intentionally
    });

    // 4) call workbud_copilot -> plain-text reply (first letter)
    const copilotUrl = process.env.COPILOT_SERVICE_URL || "http://localhost:8000";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // add JWT if your FastAPI expects it (safe to try)
    try {
      const token = await signForCopilot({ sub: userId, sessionId: session.id, scope: "chat:echo" });
      headers.Authorization = `Bearer ${token}`;
    } catch {
      // ok — your FastAPI can run with JWT disabled
    }

    const r = await fetch(`${copilotUrl}/act`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: content }),
    });

    const reply = await r.text(); // FastAPI returns plain text
    const ok = r.ok;

    // 5) append ASSISTANT message (reply or error text)
    await db.insert(s.messages).values({
      userId,
      sessionId: session.id,
      role: "assistant",
      content: reply || (ok ? "(empty)" : `Error: ${reply || `HTTP ${r.status}`}`),
      meta: ok ? null : ({ httpStatus: r.status } as any),
    });

    // 6) return plain text to the UI
    return new Response(reply, {
      status: ok ? 200 : 502,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (e: any) {
    const errText = e?.message || "server error";

    // best effort: also append an assistant error bubble
    try {
      const { userId: clerkUser2 } = await auth();
      const user2 = clerkUser2 || devUserHeader;
      if (user2) {
        const session = await getOrCreateCopilotSession(user2);
        await db.insert(s.messages).values({
          userId: user2,
          sessionId: session.id,
          role: "assistant",
          content: `Error: ${errText}`,
          meta: { error: errText } as any,
        });
      }
    } catch { /* ignore */ }

    return new Response(errText, { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}
