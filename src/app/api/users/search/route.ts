import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { searchUsers } from "@/server/users";

export async function GET(req: Request) {
  const { userId } = await auth();
  const devHeader = (req.headers.get("x-user-id") || "").trim(); // DEV ONLY
  const uid = userId || devHeader; // allow dev header if no Clerk session

  if (!uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") ?? "";
  const items = await searchUsers(query, 20);
  return NextResponse.json({ items });
}
