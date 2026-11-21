import { describe, expect, it } from "vitest";
import {
  collectToiletUploadUrls,
  extractUploadedImageFiles,
  getLegacyImageId,
  isLegacyImageId,
  parseDeleteImageIds,
  serializeToilet,
} from "@/lib/toilets";

describe("toilet serialization & form helpers", () => {
  it("serializes toilets with multiple images and preserves cover imagePath", () => {
    const now = new Date("2026-01-10T10:00:00.000Z");
    const earlier = new Date("2026-01-10T09:00:00.000Z");
    const serialized = serializeToilet({
      id: "t-1",
      name: "Toilet Labtek V",
      latitude: -6.8901,
      longitude: 107.6102,
      imagePath: "/api/uploads/old-cover.jpg",
      updatedByEmail: "admin1@gmail.com",
      updatedAt: now,
      images: [
        {
          id: "img-1",
          imagePath: "/api/uploads/11111111-1111-1111-1111-111111111111.jpg",
          uploadedByEmail: "admin1@gmail.com",
          createdAt: earlier,
        },
        {
          id: "img-2",
          imagePath: "/api/uploads/22222222-2222-2222-2222-222222222222.png",
          uploadedByEmail: "admin2@gmail.com",
          createdAt: now,
        },
      ],
    });

    expect(serialized.imagePath).toBe(
      "/api/uploads/11111111-1111-1111-1111-111111111111.jpg"
    );
    expect(serialized.images).toHaveLength(2);
    expect(serialized.images[1]).toEqual({
      id: "img-2",
      imagePath: "/api/uploads/22222222-2222-2222-2222-222222222222.png",
      uploadedByEmail: "admin2@gmail.com",
      createdAt: now.toISOString(),
    });
  });

  it("omits uploader email fields when serializing public records", () => {
    const now = new Date("2026-01-10T10:00:00.000Z");
    const serialized = serializeToilet({
      id: "t-pub",
      name: "Toilet GKU Barat",
      latitude: -6.8905,
      longitude: 107.6095,
      imagePath: "/api/uploads/44444444-4444-4444-4444-444444444444.jpg",
      updatedAt: now,
      images: [
        {
          id: "img-pub-1",
          imagePath: "/api/uploads/44444444-4444-4444-4444-444444444444.jpg",
          createdAt: now,
        },
      ],
    });

    expect(serialized.images[0]).not.toHaveProperty("uploadedByEmail");
  });

  it("falls back to synthetic legacy image entry when ToiletImage rows are absent", () => {
    const now = new Date("2026-01-10T10:00:00.000Z");
    const serialized = serializeToilet({
      id: "t-legacy",
      name: "Toilet CC Barat",
      latitude: -6.891,
      longitude: 107.611,
      imagePath: "/api/uploads/33333333-3333-3333-3333-333333333333.webp",
      updatedByEmail: "owner@gmail.com",
      updatedAt: now,
      images: [],
    });

    expect(serialized.images).toHaveLength(1);
    expect(serialized.images[0].id).toBe(getLegacyImageId("t-legacy"));
    expect(isLegacyImageId(serialized.images[0].id, "t-legacy")).toBe(true);
    expect(isLegacyImageId("legacy", "t-legacy")).toBe(true);
    expect(isLegacyImageId("img-1", "t-legacy")).toBe(false);
  });

  it("collects unique upload URLs from both images relation and legacy imagePath", () => {
    const urls = collectToiletUploadUrls({
      imagePath: "/api/uploads/a.jpg",
      images: [
        { imagePath: "/api/uploads/a.jpg" },
        { imagePath: "/api/uploads/b.png" },
      ],
    });
    expect(urls).toEqual(["/api/uploads/a.jpg", "/api/uploads/b.png"]);
  });

  it("extracts multiple uploaded files and delete IDs from FormData", () => {
    const fd = new FormData();
    fd.append("images", new File(["a"], "one.png", { type: "image/png" }));
    fd.append("images", new File(["b"], "two.jpg", { type: "image/jpeg" }));
    fd.append("image", new File(["c"], "three.webp", { type: "image/webp" }));
    fd.append("images", new File([], "empty.png", { type: "image/png" }));

    const files = extractUploadedImageFiles(fd);
    expect(files.map((f) => f.name)).toEqual(["one.png", "two.jpg", "three.webp"]);

    fd.append("deleteImageIds", JSON.stringify(["img-1", "img-2"]));
    fd.append("deleteImageId", "img-3");
    fd.append("deleteImageId", "img-2");
    expect(parseDeleteImageIds(fd)).toEqual(["img-1", "img-2", "img-3"]);
  });
});
