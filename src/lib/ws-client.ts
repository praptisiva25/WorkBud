"use client";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(userId: string) {
  if (socket) return socket;
  socket = io(process.env.NEXT_PUBLIC_CHAT_URL!, {
    auth: { userId }, // for now we pass a dev user id
  });
  return socket;
}
