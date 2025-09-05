import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listMessages } from "@/server/messages";

export async function GET(req: Request) {
  const { userId } = await auth();
  const devHeader = (req.headers.get("x-user-id") || "").trim(); // DEV ONLY
  const me = userId || devHeader;

  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  const limit = Number(searchParams.get("limit") ?? "50");

  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  try {
    const items = await listMessages({ threadId, userId: me, limit });
    return NextResponse.json({ items });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "failed" }, { status });
  }
}
