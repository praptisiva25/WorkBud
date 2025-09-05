// src/server/socket.ts
import { Server as IOServer } from "socket.io";
import type { Server as HTTPServer } from "http";

type IOSingleton = {
  io: IOServer | null;
};
const g = globalThis as any as { __io?: IOSingleton };

if (!g.__io) g.__io = { io: null };

export function getIO(server?: HTTPServer) {
  if (!g.__io!.io && server) {
    g.__io!.io = new IOServer(server, {
      cors: { origin: process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000" },
    });

    // basic auth + room join
    g.__io!.io.on("connection", (socket) => {
      const userId = socket.handshake.auth?.userId as string | undefined;
      if (!userId) {
        socket.disconnect(true);
        return;
      }

      socket.on("thread:join", ({ threadId }: { threadId: string }) => {
        socket.join(`thread:${threadId}`);
        socket.emit("thread:joined", { threadId });
      });
    });
  }
  return g.__io!.io;
}
