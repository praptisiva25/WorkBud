import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureDmThread } from "@/server/thread";

export async function POST(req: Request) {
  const { userId } = await auth();
  const devHeader = (req.headers.get("x-user-id") || "").trim(); // DEV ONLY
  const me = userId || devHeader; // allow header when no Clerk session

  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { otherUserId } = await req.json();
  if (!otherUserId) return NextResponse.json({ error: "missing otherUserId" }, { status: 400 });
  if (otherUserId === me) return NextResponse.json({ error: "cannot DM yourself" }, { status: 400 });

  const threadId = await ensureDmThread(me, otherUserId);
  return NextResponse.json({ threadId });
}
