import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteUploadByUrl,
  detectImageFormat,
  resolveSafeUploadPath,
  saveUploadedImage,
} from "@/lib/uploads";

const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_HEADER = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const WEBP_HEADER = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("upload validation & storage", () => {
  let tmpDir: string;
  const origUploadDir = process.env.UPLOAD_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "peta-toilet-test-"));
    process.env.UPLOAD_DIR = tmpDir;
  });

  afterEach(async () => {
    if (origUploadDir === undefined) {
      delete process.env.UPLOAD_DIR;
    } else {
      process.env.UPLOAD_DIR = origUploadDir;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("detects valid JPEG, PNG, and WebP magic bytes and rejects non-images", () => {
    expect(detectImageFormat(JPEG_HEADER)).toEqual({
      ext: "jpg",
      mime: "image/jpeg",
    });
    expect(detectImageFormat(PNG_HEADER)).toEqual({
      ext: "png",
      mime: "image/png",
    });
    expect(detectImageFormat(WEBP_HEADER)).toEqual({
      ext: "webp",
      mime: "image/webp",
    });

    const textBytes = new TextEncoder().encode("<script>alert(1)</script>");
    expect(detectImageFormat(textBytes)).toBeNull();
  });

  it("blocks path traversal and malformed filenames", () => {
    expect(resolveSafeUploadPath("../secret.txt")).toBeNull();
    expect(resolveSafeUploadPath("foo/bar.png")).toBeNull();
    expect(resolveSafeUploadPath("not-a-uuid.png")).toBeNull();

    const validName = "123e4567-e89b-12d3-a456-426614174000.png";
    const resolved = resolveSafeUploadPath(validName);
    expect(resolved).toBe(path.join(tmpDir, validName));
  });

  it("saves valid uploaded image and cleanly deletes it", async () => {
    const file = new File([PNG_HEADER], "toilet.png", { type: "image/png" });
    const urlPath = await saveUploadedImage(file);
    expect(urlPath).toMatch(/^\/api\/uploads\/[a-f0-9-]+\.png$/);

    const filename = urlPath.replace("/api/uploads/", "");
    const savedPath = path.join(tmpDir, filename);
    const stat = await fs.stat(savedPath);
    expect(stat.size).toBe(PNG_HEADER.length);

    await deleteUploadByUrl(urlPath);
    await expect(fs.stat(savedPath)).rejects.toThrow();
  });

  it("rejects spoofed MIME image files", async () => {
    const fakeFile = new File(["not really a png"], "evil.png", {
      type: "image/png",
    });
    await expect(saveUploadedImage(fakeFile)).rejects.toThrow(
      /JPG, PNG, atau WebP/
    );
  });
});
