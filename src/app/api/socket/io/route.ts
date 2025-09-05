import { NextResponse } from "next/server";
import { getIO } from "@/server/socket";

export const dynamic = "force-dynamic"; // ensure it runs on the Node runtime

export async function GET() {
  // @ts-ignore private API to access Node HTTP server in dev/prod Node runtime
  const server = (globalThis as any).__server || (globalThis as any).server;
  getIO(server); // init singleton if not already
  return NextResponse.json({ ok: true });
}
