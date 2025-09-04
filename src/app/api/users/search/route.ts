import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { searchUsers } from "../../../../server/users";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") ?? "";
  const items = await searchUsers(query, 20);
  return NextResponse.json({ items });
}
