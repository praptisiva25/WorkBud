import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listMyThreads } from "@/server/thread";

export async function GET(req: Request) {
  const { userId } = await auth();
  const devHeader = (req.headers.get("x-user-id") || "").trim(); // dev fallback
  const me = userId || devHeader;
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const items = await listMyThreads(me);
  return NextResponse.json({ items });
}
