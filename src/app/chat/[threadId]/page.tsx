"use client";
import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/ws-client";

type Msg = {
  id: string; threadId: string; senderId: string;
  source: "manual" | "copilot" | "system";
  kind: "text" | "image" | "file";
  content?: string | null;
  fileUrl?: string | null;
  createdAt: string;
};

export default function ChatRoom({ params }: { params: { threadId: string } }) {
  const { threadId } = params;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    const socket = getSocket("user_test123"); // replace with Clerk userId later
    socketRef.current = socket;

    socket.emit("thread:join", { threadId });
    socket.on("thread:joined", () => console.log("joined", threadId));
    socket.on("message:new", (m: Msg) => setMessages((prev) => [...prev, m]));
    socket.on("error", (e) => console.warn("socket error", e));

    return () => {
      socket.off("thread:joined");
      socket.off("message:new");
      socket.off("error");
      // keep socket open for now (global)
    };
  }, [threadId]);

  const send = () => {
    if (!text.trim()) return;
    socketRef.current?.emit("message:send", {
      threadId,
      kind: "text",
      content: text.trim(),
    });
    setText("");
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1>Thread: {threadId}</h1>

      <div style={{
        border: "1px solid #ddd", borderRadius: 8, padding: 12,
        height: 400, overflowY: "auto", marginBottom: 12
      }}>
        {messages.map(m => (
          <div key={m.id} style={{ margin: "8px 0" }}>
            <div style={{ fontSize: 12, color: "#666" }}>
              {m.senderId} · {new Date(m.createdAt).toLocaleTimeString()}
            </div>
            {m.kind === "text" ? (
              <div style={{ fontSize: 15 }}>{m.content}</div>
            ) : (
              <a href={m.fileUrl!} target="_blank">Attachment</a>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button onClick={send} style={{ padding: "8px 14px" }}>Send</button>
      </div>
    </div>
  );
}
