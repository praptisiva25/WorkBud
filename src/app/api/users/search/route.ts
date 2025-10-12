import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { searchUsers } from "@/server/users"; // adjust path

export async function GET(req: Request) {
  const { userId } = await auth();
  const devHeader = (req.headers.get("x-user-id") || "").trim(); // DEV ONLY
  const uid = userId || devHeader;

  if (!uid) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") || "").trim();
  if (!query) return NextResponse.json({ items: [] });

  // Optional: tiny guard to avoid hammering on 1-char searches
  if (query.length < 2) return NextResponse.json({ items: [] });

  const rows = await searchUsers(query, { limit: 20, excludeUserId: uid });

  // Normalize shape for the client
  const items = rows.map((r: any) => ({
    id: r.id,
    name: r.displayName ?? r.email ?? r.id,
    email: r.email ?? null,
    avatarUrl: r.imageUrl ?? null,
    threadId: r.threadId ?? null, // if a DM already exists
  }));

  return NextResponse.json({ items });
}
