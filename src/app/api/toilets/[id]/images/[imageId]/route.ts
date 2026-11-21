import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canDeleteToiletImage, getVerifiedAdminSession } from "@/lib/auth";
import {
  TOILET_ADMIN_SELECT,
  isLegacyImageId,
  serializeToilet,
} from "@/lib/toilets";
import { deleteUploadByUrl } from "@/lib/uploads";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; imageId: string }> }
) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "Akses ditolak. Silakan login sebagai admin." },
      { status: 401 }
    );
  }

  if (!canDeleteToiletImage(session)) {
    return NextResponse.json(
      { error: "Anda tidak memiliki izin untuk menghapus foto ini." },
      { status: 403 }
    );
  }

  const { id, imageId } = await context.params;
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
    if (isLegacyImageId(imageId, id)) {
      if (existing.images.length === 0 && existing.imagePath) {
        const legacyUrl = existing.imagePath;
        const updated = await prisma.toilet.update({
          where: { id },
          data: {
            imagePath: null,
            updatedByEmail: session.email,
          },
          select: TOILET_ADMIN_SELECT,
        });
        await deleteUploadByUrl(legacyUrl).catch(() => {});
        return NextResponse.json({
          ok: true,
          toilet: serializeToilet(updated),
        });
      }

      return NextResponse.json(
        { error: "Foto toilet tidak ditemukan." },
        { status: 404 }
      );
    }

    const targetImage = existing.images.find((img) => img.id === imageId);
    if (!targetImage) {
      return NextResponse.json(
        { error: "Foto toilet tidak ditemukan." },
        { status: 404 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.toiletImage.delete({ where: { id: targetImage.id } });
      const remaining = await tx.toiletImage.findMany({
        where: { toiletId: id },
        orderBy: { createdAt: "asc" },
        select: { imagePath: true },
      });

      return tx.toilet.update({
        where: { id },
        data: {
          imagePath: remaining[0]?.imagePath ?? null,
          updatedByEmail: session.email,
        },
        select: TOILET_ADMIN_SELECT,
      });
    });

    await deleteUploadByUrl(targetImage.imagePath).catch(() => {});

    return NextResponse.json({
      ok: true,
      toilet: serializeToilet(updated),
    });
  } catch (err) {
    console.error("DELETE /api/toilets/[id]/images/[imageId] failed:", err);
    return NextResponse.json(
      { error: "Gagal menghapus foto toilet." },
      { status: 500 }
    );
  }
}
