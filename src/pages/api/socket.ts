// src/pages/api/socket.ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as HTTPServer } from "http";
import type { Socket } from "net";
import { Server as IOServer } from "socket.io";

type NextApiResponseServerIO = NextApiResponse & {
  socket: Socket & {
    server: HTTPServer & { io?: IOServer };
  };
};

export const config = { api: { bodyParser: false } };

export default function handler(_req: NextApiRequest, res: NextApiResponseServerIO) {
  // Already set up?
  if (!res.socket.server.io) {
    const io = new IOServer(res.socket.server, {
      // mount socket.io under /api/socket.io to avoid clashing with Next assets
      path: "/api/socket.io",
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
      },
    });

    // Room join & very light auth (dev); replace with Clerk token verification in prod
    io.on("connection", (socket) => {
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

    // expose on Next's HTTP server and also stash globally for App Router routes
    res.socket.server.io = io;
    (globalThis as any).__io = io;
    // eslint-disable-next-line no-console
    console.log("[socket.io] initialized");
  }

  res.end();
}
