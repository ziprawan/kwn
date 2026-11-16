import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVerifiedAdminSession } from "@/lib/auth";
import { isWithinItbPinBounds } from "@/lib/geo";
import { deleteUploadByUrl, saveUploadedImage } from "@/lib/uploads";

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
  const existing = await prisma.toilet.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Data toilet tidak ditemukan." },
      { status: 404 }
    );
  }

  let newlySavedImagePath: string | null = null;

  try {
    const formData = await request.formData();
    const hasName = formData.has("name");
    const hasLat = formData.has("latitude");
    const hasLng = formData.has("longitude");
    const removeImage = formData.get("removeImage") === "true";
    const imageEntry = formData.get("image");

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

    let nextImagePath = existing.imagePath;

    if (imageEntry instanceof File && imageEntry.size > 0) {
      try {
        newlySavedImagePath = await saveUploadedImage(imageEntry);
        nextImagePath = newlySavedImagePath;
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
    } else if (removeImage) {
      nextImagePath = null;
    }

    const updated = await prisma.toilet.update({
      where: { id },
      data: {
        name: nextName,
        latitude: nextLat,
        longitude: nextLng,
        imagePath: nextImagePath,
        updatedByEmail: session.email,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        imagePath: true,
        updatedAt: true,
      },
    });

    if (
      existing.imagePath &&
      (newlySavedImagePath !== null || removeImage) &&
      existing.imagePath !== nextImagePath
    ) {
      await deleteUploadByUrl(existing.imagePath).catch(() => {});
    }

    return NextResponse.json({ toilet: updated });
  } catch (err) {
    if (newlySavedImagePath) {
      await deleteUploadByUrl(newlySavedImagePath).catch(() => {});
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
  const existing = await prisma.toilet.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Data toilet tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    await prisma.toilet.delete({ where: { id } });
    if (existing.imagePath) {
      await deleteUploadByUrl(existing.imagePath).catch(() => {});
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
