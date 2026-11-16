import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MAX_IMAGE_BYTES } from "@/lib/constants";

export { MAX_IMAGE_BYTES };
export const SAFE_UPLOAD_FILENAME_REGEX =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/;

export interface DetectedImageFormat {
  ext: "jpg" | "png" | "webp";
  mime: "image/jpeg" | "image/png" | "image/webp";
}

export function getUploadDir(): string {
  const customDir = process.env.UPLOAD_DIR?.trim();
  if (customDir) {
    return path.resolve(/*turbopackIgnore: true*/ customDir);
  }
  return path.join(process.cwd(), "data", "uploads");
}

export function detectImageFormat(
  bytes: Uint8Array
): DetectedImageFormat | null {
  if (bytes.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ext: "png", mime: "image/png" };
  }

  // WebP: RIFF....WEBP
  const riff =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;
  const webp =
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (riff && webp) {
    return { ext: "webp", mime: "image/webp" };
  }

  return null;
}

export function resolveSafeUploadPath(filename: string): string | null {
  if (!filename || path.basename(filename) !== filename) {
    return null;
  }
  if (!SAFE_UPLOAD_FILENAME_REGEX.test(filename)) {
    return null;
  }
  const uploadDir = getUploadDir();
  const fullPath = path.resolve(/*turbopackIgnore: true*/ uploadDir, filename);
  if (!fullPath.startsWith(uploadDir + path.sep)) {
    return null;
  }
  return fullPath;
}

export function getMimeFromUploadFilename(filename: string): string {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function saveUploadedImage(file: File): Promise<string> {
  if (file.size <= 0) {
    throw new Error("File foto tidak boleh kosong.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Ukuran foto maksimal 5 MB.");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const format = detectImageFormat(buffer);
  if (!format) {
    throw new Error("Format foto harus berupa JPG, PNG, atau WebP yang valid.");
  }

  const filename = `${crypto.randomUUID()}.${format.ext}`;
  const uploadDir = getUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });
  const destination = path.join(/*turbopackIgnore: true*/ uploadDir, filename);
  await fs.writeFile(destination, buffer);

  return `/api/uploads/${filename}`;
}

export async function deleteUploadByUrl(
  imagePath: string | null | undefined
): Promise<void> {
  if (!imagePath) {
    return;
  }
  const prefix = "/api/uploads/";
  if (!imagePath.startsWith(prefix)) {
    return;
  }
  const filename = imagePath.slice(prefix.length);
  const safePath = resolveSafeUploadPath(filename);
  if (!safePath) {
    return;
  }
  try {
    await fs.unlink(safePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      throw err;
    }
  }
}
