import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listMyThreads } from "../../../../server/thread";

export async function GET(req: Request) {
  // 🔹 1. Try Clerk session first
  const { userId: clerkUser } = await auth();

  // 🔹 2. Allow FastAPI or server-to-server calls via custom header
  const devHeader = (req.headers.get("x-user-id") || "").trim();

  // 🔹 3. Pick whichever exists
  const me = clerkUser || devHeader;

  // 🔹 4. Reject if no user id found
  if (!me) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    // 🔹 5. Fetch threads belonging to this user
    const items = await listMyThreads(me);
    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("Error listing threads:", err);
    return NextResponse.json(
      { error: err.message || "internal error" },
      { status: 500 }
    );
  }
}
