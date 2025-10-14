import { auth } from "@clerk/nextjs/server";
import { drain } from "@/server/notifyBus";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("unauthorized", { status: 401 });

  // returns and clears any pending notes for this user
  const notes = drain(userId);
  return Response.json({ notes });
}
