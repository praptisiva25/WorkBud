import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sendTextMessage } from "../../../../server/messages";

export async function POST(req: Request) {
  const { userId } = await auth();
  const devHeader = (req.headers.get("x-user-id") || "").trim(); // DEV ONLY
  const me = userId || devHeader;

  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const threadId = body?.threadId as string;
  const content = body?.content as string;

  if (!threadId || !content)
    return NextResponse.json({ error: "threadId + content required" }, { status: 400 });

  try {
    const msg = await sendTextMessage({ threadId, senderId: me, content });
    const io = (globalThis as any).__io as import("socket.io").Server | undefined;
    io?.to(`thread:${msg.threadId}`).emit("message:new", msg);
    return NextResponse.json(msg, { status: 201 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "failed" }, { status });
  }
}
