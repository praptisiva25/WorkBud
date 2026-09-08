"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Mic, Send, StopCircle, Pin, PinOff, X, Shield } from "lucide-react"; // ⬅️ add Shield

type LocalMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  time: string;
  imageUrl?: string | null;
};

// Call FastAPI on localhost:8000
async function vectorizeFile(file: File, serverPayload?: any) {
  try {
    const res = await fetch("http://localhost:8000/api/copilot/vectorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileUrl: serverPayload?.fileUrl,
        filename: file.name,
        uploadId: serverPayload?.id,
        source: "copilot-overlay",
      }),
    });

    const data = await res.json().catch(async () => ({ message: await res.text() }));
    if (!res.ok) throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);

    return { ok: true, detail: data?.message || "Embedded & indexed into FAISS." };
  } catch (err: any) {
    return { ok: false, detail: err?.message || String(err) };
  }
}

export default function CopilotOverlay({
  onClose,
  pinned,
  setPinned,
}: {
  onClose: () => void;
  pinned: boolean;
  setPinned: (b: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [items, setItems] = useState<LocalMsg[]>([
    { id: "s1", role: "system", text: "Welcome to WorkBud Copilot.", time: timeStr() },
    { id: "a1", role: "assistant", text: "Hi! How can I help you today?", time: timeStr() },
  ]);

  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const piiInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [items.length]);

  const openFilePicker = () => fileInputRef.current?.click();
  const openPiiPicker = () => piiInputRef.current?.click(); // NEW

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const now = timeStr();

    
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: `📎 Uploading: ${file.name} (${formatBytes(file.size)})`,
        time: now,
      },
    ]);

    try {
      // 1) Upload to your Next.js /api/copilot/upload (just saves file)
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", "copilot-overlay");

      const res = await fetch("/api/copilot/upload", { method: "POST", body: fd });
      const payload = await (async () => {
        try {
          return await res.json();
        } catch {
          return await res.text();
        }
      })();

      if (!res.ok) throw new Error(typeof payload === "string" ? payload : payload?.error || `HTTP ${res.status}`);

      const fileUrl = typeof payload === "object" ? payload.fileUrl : undefined;
      const serverMsg = typeof payload === "object" ? payload.message || "Upload complete." : String(payload);

      setItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: ` Uploaded **${file.name}**${fileUrl ? `\n\nLink: ${fileUrl}` : ""}\n\n${serverMsg}`,
          time: timeStr(),
        },
      ]);

      
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: ` Vectorizing **${file.name}**…`, time: timeStr() },
      ]);

      const vecResult = await vectorizeFile(file, payload);
      if (vecResult.ok) {
        setItems((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: ` ${vecResult.detail}`,
            time: timeStr(),
          },
        ]);
      } else {
        throw new Error(vecResult.detail);
      }
    } catch (err: any) {
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: ` Upload/Vectorize error: ${err.message}`, time: timeStr() },
      ]);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // NEW: PII masking upload flow
  const handlePiiFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const now = timeStr();

    // show uploading bubble
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: ` Uploading for masking: ${file.name} (${formatBytes(file.size)})`,
        time: now,
      },
    ]);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", "pii-masking");

      const res = await fetch("/api/copilot/pii-upload", { method: "POST", body: fd });
      const payload = await (async () => {
        try {
          return await res.json();
        } catch {
          return await res.text();
        }
      })();

      if (!res.ok) throw new Error(typeof payload === "string" ? payload : payload?.error || `HTTP ${res.status}`);

      const fileUrl = typeof payload === "object" ? payload.fileUrl : undefined;
      const serverMsg = typeof payload === "object" ? payload.message || "PII document saved." : String(payload);

      setItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            `  PII doc **${file.name}** received.${fileUrl ? `\n\nLink: ${fileUrl}` : ""}\n\n${serverMsg}\n\n` +
            `Next: “mask email”, “mask phone”, “mask name”, etc.`,
          time: timeStr(),
        },
      ]);

      // (Optional) kick off an async OCR/index step later if you want
      // await fetch("/api/copilot/pii-init", { method: "POST", body: JSON.stringify({ fileUrl }), headers: { "Content-Type": "application/json" } });
    } catch (err: any) {
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `❌ PII upload error: ${err.message}`, time: timeStr() },
      ]);
    } finally {
      if (piiInputRef.current) piiInputRef.current.value = "";
    }
  };

  const send = async () => {
    const content = input.trim();
    if (!content || isGenerating) return;

    const now = timeStr();
    setInput("");
    setItems((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: content, time: now }]);
    setIsGenerating(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const sourceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const nowIso = new Date().toISOString();
    const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: sourceTz });

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, sourceTz, nowIso, todayLocal }),
      });

      const data = await res.json();
if (!res.ok) throw new Error(data?.reply || `HTTP ${res.status}`);

const reply = data.reply || "(empty)";
const imageUrl = data.image_url || null;

setItems((prev) => [
  ...prev,
  {
    id: crypto.randomUUID(),
    role: "assistant",
    text: reply,
    time: timeStr(),
    imageUrl,
  },
]);

    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "⏹️ Request cancelled." : `Error: ${e?.message || String(e)}`;
      setItems((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: msg, time: timeStr() }]);
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setIsGenerating(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center">
      <div className="pointer-events-auto w-[min(56rem,96vw)] h-[min(72vh,760px)] rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-2xl shadow-2xl ring-1 ring-white/10 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-white/10 bg-slate-900/70 backdrop-blur-2xl rounded-t-2xl">
          <div className="text-sm font-medium text-slate-100">
            Notes • <span className="text-slate-300">Welcome to WorkBud</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPinned(!pinned)} className="p-1.5 rounded-md hover:bg-white/10" title={pinned ? "Unpin" : "Pin"}>
              {pinned ? <PinOff className="h-4 w-4 text-slate-300" /> : <Pin className="h-4 w-4 text-slate-300" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10" title="Close">
              <X className="h-4 w-4 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.map((m) =>
            m.role === "system" ? (
              <div key={m.id} className="mx-auto max-w-4xl text-center text-xs text-slate-400 py-1">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className={`flex w-full ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl p-4 text-sm ${
                    m.role === "user"
                      ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow-lg"
                      : "border border-white/10 bg-white/5 text-slate-100 backdrop-blur"
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                  {m.imageUrl && (
  <img
    src={`http://localhost:8000${m.imageUrl}`}
    alt="Generated chart"
    className="mt-3 max-w-full rounded-lg border border-white/10"
  />
)}

<div className={`mt-2 text-[10px] ${m.role === "user" ? "text-slate-900/60" : "text-slate-400"}`}>
  {m.time}
</div>
                </div>
              </div>
            )
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-white/10 bg-slate-900/70 backdrop-blur px-5 py-4 rounded-b-2xl">
          <div className="mx-auto flex items-end gap-3">
            {/* Existing vector upload */}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <button onClick={openFilePicker} className="p-2 border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 rounded-lg" title="Upload & vectorize">
              <Paperclip className="h-4 w-4" />
            </button>

            {/* NEW: PII masking upload */}
            <input
              ref={piiInputRef}
              type="file"
              className="hidden"
              onChange={handlePiiFileChange}
              accept=".png,.jpg,.jpeg,.webp,.pdf,.tiff,.bmp,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv"
            />
            <button onClick={openPiiPicker} className="p-2 border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 rounded-lg" title="Upload for PII masking">
              <Shield className="h-4 w-4" />
            </button>

            <button className="p-2 border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 rounded-lg">
              <Mic className="h-4 w-4" />
            </button>

            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type a message for Copilot…"
              className="min-h-[44px] max-h-40 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-transparent"
            />
            {isGenerating ? (
              <button
                onClick={stop}
                className="px-4 py-2 bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-medium hover:from-violet-600 hover:to-cyan-500 rounded-lg flex items-center gap-2"
              >
                <StopCircle className="h-4 w-4" /> Stop
              </button>
            ) : (
              <button
                onClick={send}
                className="px-4 py-2 bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 font-medium hover:from-violet-600 hover:to-cyan-500 rounded-lg flex items-center gap-2"
                disabled={!input.trim()}
              >
                <Send className="h-4 w-4" /> Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function timeStr() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
