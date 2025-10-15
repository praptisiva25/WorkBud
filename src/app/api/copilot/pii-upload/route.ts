// app/api/copilot/pii-upload/route.ts
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

// Point this to your FastAPI base (use .env.local → FASTAPI_BASE)
const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://localhost:8000";

const ALLOWED = new Set([
  "image/png", "image/jpeg", "image/webp", "application/pdf",
  "image/tiff", "image/bmp", "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

    if (file.type && !ALLOWED.has(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 415 });
    }

    // 1) Save locally
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const uploadDir = path.join(process.cwd(), "public", "uploads", "pii");
    await mkdir(uploadDir, { recursive: true });

    const uniq = crypto.randomUUID();
    const safeName = file.name.replace(/[^\w.\-+]/g, "_");
    const filename = `${uniq}__${safeName}`;
    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, buffer);

    // 2) Build a public URL so FastAPI can fetch it
    //    If your Next.js app runs at http://localhost:3000
    const publicUrl = `/uploads/pii/${filename}`;
    const absoluteUrl = `${process.env.NEXT_BASE_URL || "http://localhost:3000"}${publicUrl}`;

    // 3) Call FastAPI masking agent → runs Doctr OCR, prints to its console
    const ocrRes = await fetch(`${FASTAPI_BASE}/api/mask/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_url: absoluteUrl,        // masking_agent will download this
        filename: safeName,
        source: "workbud-pii",
      }),
    });

    const ocrJson = await (async () => {
      try { return await ocrRes.json(); } catch { return { ok: false, detail: await ocrRes.text() }; }
    })();

    if (!ocrRes.ok || !ocrJson?.ok) {
      return NextResponse.json(
        { error: `OCR failed: ${ocrJson?.detail || `HTTP ${ocrRes.status}`}`, fileUrl: publicUrl },
        { status: 500 }
      );
    }

    // 4) Reply short status to UI
    return NextResponse.json({
      ok: true,
      message: "OCR done.",
      fileUrl: publicUrl,
      id: uniq,
      ocr_tokens: ocrJson?.tokens || 0, // optional
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Upload/OCR failed." }, { status: 500 });
  }
}