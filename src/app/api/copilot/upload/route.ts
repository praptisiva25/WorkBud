import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = Date.now() + "-" + file.name;
    const filepath = join(uploadDir, filename);
    await writeFile(filepath, buffer);

    // ✅ Use absolute URL instead of relative
    const host = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const fileUrl = `${host}/uploads/${filename}`;

    return NextResponse.json({ fileUrl, message: "File saved successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
