import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canDeleteToiletImage, getVerifiedAdminSession } from "@/lib/auth";
import { MAX_IMAGES_PER_TOILET } from "@/lib/constants";
import { isWithinItbPinBounds } from "@/lib/geo";
import {
  TOILET_ADMIN_SELECT,
  collectToiletUploadUrls,
  extractUploadedImageFiles,
  getLegacyImageId,
  parseDeleteImageIds,
  serializeToilet,
} from "@/lib/toilets";
import { deleteUploadsByUrls, saveUploadedImages } from "@/lib/uploads";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "Akses ditolak. Silakan login sebagai admin." },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const existing = await prisma.toilet.findUnique({
    where: { id },
    select: TOILET_ADMIN_SELECT,
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Data toilet tidak ditemukan." },
      { status: 404 }
    );
  }

  let newlySavedImagePaths: string[] = [];

  try {
    const formData = await request.formData();
    const hasName = formData.has("name");
    const hasLat = formData.has("latitude");
    const hasLng = formData.has("longitude");
    const removeAllImages = formData.get("removeImage") === "true";
    const deleteIds = new Set(parseDeleteImageIds(formData));
    const uploadedFiles = extractUploadedImageFiles(formData);

    if ((removeAllImages || deleteIds.size > 0) && !canDeleteToiletImage(session)) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin untuk menghapus foto toilet." },
        { status: 403 }
      );
    }

    const nextName = hasName
      ? String(formData.get("name") ?? "").trim()
      : existing.name;
    const nextLat = hasLat
      ? Number(formData.get("latitude"))
      : existing.latitude;
    const nextLng = hasLng
      ? Number(formData.get("longitude"))
      : existing.longitude;

    if (!nextName || nextName.length > 120) {
      return NextResponse.json(
        { error: "Nama lokasi toilet wajib diisi (maksimal 120 karakter)." },
        { status: 400 }
      );
    }

    if (!isWithinItbPinBounds(nextLat, nextLng)) {
      return NextResponse.json(
        {
          error:
            "Koordinat harus berada di sekitar area ITB Kampus Ganesha, Bandung.",
        },
        { status: 400 }
      );
    }

    const hasLegacyOnly =
      existing.images.length === 0 && Boolean(existing.imagePath);
    const deleteLegacy =
      hasLegacyOnly &&
      (removeAllImages ||
        deleteIds.has("legacy") ||
        deleteIds.has(getLegacyImageId(id)));

    const deletedExistingImages = removeAllImages
      ? existing.images
      : existing.images.filter((img) => deleteIds.has(img.id));
    const survivingExistingImages = removeAllImages
      ? []
      : existing.images.filter((img) => !deleteIds.has(img.id));

    const survivingCount =
      survivingExistingImages.length + (hasLegacyOnly && !deleteLegacy ? 1 : 0);

    if (survivingCount + uploadedFiles.length > MAX_IMAGES_PER_TOILET) {
      return NextResponse.json(
        {
          error: `Maksimal ${MAX_IMAGES_PER_TOILET} foto per titik toilet.`,
        },
        { status: 400 }
      );
    }

    if (uploadedFiles.length > 0) {
      try {
        newlySavedImagePaths = await saveUploadedImages(uploadedFiles);
      } catch (uploadError) {
        return NextResponse.json(
          {
            error:
              uploadError instanceof Error
                ? uploadError.message
                : "Gagal memproses foto baru.",
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (deletedExistingImages.length > 0) {
        await tx.toiletImage.deleteMany({
          where: {
            toiletId: id,
            id: { in: deletedExistingImages.map((img) => img.id) },
          },
        });
      }

      const nowMs = Date.now();
      if (hasLegacyOnly && !deleteLegacy && existing.imagePath && newlySavedImagePaths.length > 0) {
        await tx.toiletImage.create({
          data: {
            toiletId: id,
            imagePath: existing.imagePath,
            uploadedByEmail: existing.updatedByEmail,
            createdAt: new Date(nowMs),
          },
        });
      }

      for (const [idx, imagePath] of newlySavedImagePaths.entries()) {
        await tx.toiletImage.create({
          data: {
            toiletId: id,
            imagePath,
            uploadedByEmail: session.email,
            createdAt: new Date(nowMs + 1 + idx),
          },
        });
      }

      const remainingRows = await tx.toiletImage.findMany({
        where: { toiletId: id },
        orderBy: { createdAt: "asc" },
        select: { imagePath: true },
      });

      const nextCoverImagePath =
        remainingRows[0]?.imagePath ??
        (hasLegacyOnly && !deleteLegacy ? existing.imagePath : null) ??
        null;

      return tx.toilet.update({
        where: { id },
        data: {
          name: nextName,
          latitude: nextLat,
          longitude: nextLng,
          imagePath: nextCoverImagePath,
          updatedByEmail: session.email,
        },
        select: TOILET_ADMIN_SELECT,
      });
    });

    const pathsToDelete = [
      ...deletedExistingImages.map((img) => img.imagePath),
      ...(deleteLegacy && existing.imagePath ? [existing.imagePath] : []),
    ];
    if (pathsToDelete.length > 0) {
      await deleteUploadsByUrls(pathsToDelete);
    }

    return NextResponse.json({ toilet: serializeToilet(updated) });
  } catch (err) {
    if (newlySavedImagePaths.length > 0) {
      await deleteUploadsByUrls(newlySavedImagePaths);
    }
    console.error("PATCH /api/toilets/[id] failed:", err);
    return NextResponse.json(
      { error: "Gagal memperbarui data toilet." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "Akses ditolak. Silakan login sebagai admin." },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const existing = await prisma.toilet.findUnique({
    where: { id },
    select: TOILET_ADMIN_SELECT,
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Data toilet tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    const uploadUrls = collectToiletUploadUrls(existing);
    await prisma.toilet.delete({ where: { id } });
    if (uploadUrls.length > 0) {
      await deleteUploadsByUrls(uploadUrls);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/toilets/[id] failed:", err);
    return NextResponse.json(
      { error: "Gagal menghapus titik toilet." },
      { status: 500 }
    );
  }
}
