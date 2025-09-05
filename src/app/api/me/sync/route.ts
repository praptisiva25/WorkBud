// src/app/api/me/sync/route.ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { upsertUser } from "../../../../server/users";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const u = await currentUser();
  await upsertUser({
    id: userId,
    email: u?.primaryEmailAddress?.emailAddress ?? null,
    displayName: u?.fullName || u?.username || null,
    imageUrl: u?.imageUrl || null,
  });

  return NextResponse.json({ ok: true });
}
