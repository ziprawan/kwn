import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import {
  getMimeFromUploadFilename,
  resolveSafeUploadPath,
} from "@/lib/uploads";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  const safePath = resolveSafeUploadPath(filename);
  if (!safePath) {
    return NextResponse.json(
      { error: "Berkas tidak valid." },
      { status: 400 }
    );
  }

  try {
    const fileBuffer = await fs.readFile(safePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": getMimeFromUploadFilename(filename),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return NextResponse.json(
        { error: "Foto tidak ditemukan." },
        { status: 404 }
      );
    }
    console.error("GET /api/uploads/[filename] failed:", err);
    return NextResponse.json(
      { error: "Gagal membaca foto." },
      { status: 500 }
    );
  }
}
