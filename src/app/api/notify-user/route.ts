import { enqueue } from "@/server/notifyBus";

export async function POST(req: Request) {
  const secret = req.headers.get("x-runner-secret");
  if (secret !== process.env.RUNNER_NOTIFY_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const { userId, title, body, dueAtUtc } = await req.json().catch(() => ({}));
  if (!userId || !title) return new Response("bad request", { status: 400 });

  enqueue(userId, { title, body: body ?? "", dueAtUtc });
  return Response.json({ ok: true });
}
