"use client";

import { io as socketIO, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  // ensure Next’s Socket.IO server is mounted
  fetch("/api/socket").catch(() => { /* no-op */ });

  if (!socket) {
    socket = socketIO(
      process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
      {
        transports: ["websocket"],
        path: "/api/socket.io",
        auth: { userId: "dev-user" }, // TODO: replace with Clerk/JWT in prod
      }
    );

    socket.on("connect_error", (err) => {
      // eslint-disable-next-line no-console
      console.warn("socket connect_error:", err.message);
    });
  }
  return socket;
}
