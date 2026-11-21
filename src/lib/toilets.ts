import type { Prisma } from "@prisma/client";
import type { ToiletImageItem, ToiletPoint } from "@/lib/geo";

export const LEGACY_IMAGE_ID_PREFIX = "legacy:";

export const TOILET_PUBLIC_SELECT = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
  imagePath: true,
  updatedAt: true,
  images: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      imagePath: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ToiletSelect;

export const TOILET_ADMIN_SELECT = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
  imagePath: true,
  updatedByEmail: true,
  updatedAt: true,
  images: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      imagePath: true,
      uploadedByEmail: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ToiletSelect;

export type ToiletPublicRecord = Prisma.ToiletGetPayload<{
  select: typeof TOILET_PUBLIC_SELECT;
}>;

export type ToiletAdminRecord = Prisma.ToiletGetPayload<{
  select: typeof TOILET_ADMIN_SELECT;
}>;

export function getLegacyImageId(toiletId: string): string {
  return `${LEGACY_IMAGE_ID_PREFIX}${toiletId}`;
}

export function isLegacyImageId(imageId: string, toiletId: string): boolean {
  return imageId === getLegacyImageId(toiletId) || imageId === "legacy";
}

/**
 * Normalizes a Toilet record into a client-safe ToiletPoint, preserving
 * backward compatibility with rows that only have legacy `Toilet.imagePath`.
 * Public records omit admin email fields.
 */
export function serializeToilet(
  record: ToiletPublicRecord | ToiletAdminRecord
): ToiletPoint {
  const isAdminRecord = "updatedByEmail" in record;
  const images: ToiletImageItem[] =
    record.images.length > 0
      ? record.images.map((img) => ({
          id: img.id,
          imagePath: img.imagePath,
          ...("uploadedByEmail" in img
            ? { uploadedByEmail: img.uploadedByEmail ?? null }
            : {}),
          createdAt: img.createdAt.toISOString(),
        }))
      : record.imagePath
        ? [
            {
              id: getLegacyImageId(record.id),
              imagePath: record.imagePath,
              ...(isAdminRecord
                ? { uploadedByEmail: record.updatedByEmail ?? null }
                : {}),
              createdAt: record.updatedAt.toISOString(),
            },
          ]
        : [];

  return {
    id: record.id,
    name: record.name,
    latitude: record.latitude,
    longitude: record.longitude,
    imagePath: images[0]?.imagePath ?? null,
    images,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Collects all unique upload URLs linked to a toilet (both `images` rows and legacy `imagePath`).
 */
export function collectToiletUploadUrls(record: {
  imagePath: string | null;
  images?: Array<{ imagePath: string }>;
}): string[] {
  const urls = new Set<string>();
  for (const img of record.images ?? []) {
    if (img.imagePath) {
      urls.add(img.imagePath);
    }
  }
  if (record.imagePath) {
    urls.add(record.imagePath);
  }
  return Array.from(urls);
}

export function extractUploadedImageFiles(formData: FormData): File[] {
  const entries = [...formData.getAll("images"), ...formData.getAll("image")];
  return entries.filter(
    (entry): entry is File => entry instanceof File && entry.size > 0
  );
}

export function parseDeleteImageIds(formData: FormData): string[] {
  const ids = new Set<string>();
  const rawEntries = [
    ...formData.getAll("deleteImageIds"),
    ...formData.getAll("deleteImageId"),
  ];

  for (const entry of rawEntries) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "string" && item.trim()) {
              ids.add(item.trim());
            }
          }
          continue;
        }
      } catch {
        // Treat as literal ID if not valid JSON
      }
    }
    ids.add(trimmed);
  }

  return Array.from(ids);
}
