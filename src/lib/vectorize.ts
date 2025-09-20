// lib/vectorize.tsx
export async function vectorizeFile(file: File, serverPayload?: any) {
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
    if (!res.ok) {
      throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);
    }

    return { ok: true, detail: data?.message || "Embedded & indexed into FAISS." };
  } catch (err: any) {
    return { ok: false, detail: err?.message || String(err) };
  }
}
