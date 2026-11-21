import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVerifiedAdminSession } from "@/lib/auth";
import { MAX_IMAGES_PER_TOILET } from "@/lib/constants";
import { isWithinItbPinBounds } from "@/lib/geo";
import {
  TOILET_ADMIN_SELECT,
  TOILET_PUBLIC_SELECT,
  extractUploadedImageFiles,
  serializeToilet,
} from "@/lib/toilets";
import { deleteUploadsByUrls, saveUploadedImages } from "@/lib/uploads";

export async function GET() {
  try {
    const toilets = await prisma.toilet.findMany({
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      select: TOILET_PUBLIC_SELECT,
    });
    return NextResponse.json({ toilets: toilets.map(serializeToilet) });
  } catch (err) {
    console.error("GET /api/toilets failed:", err);
    return NextResponse.json(
      { error: "Gagal mengambil data toilet." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "Akses ditolak. Silakan login sebagai admin." },
      { status: 401 }
    );
  }

  let savedImagePaths: string[] = [];

  try {
    const formData = await request.formData();
    const rawName = String(formData.get("name") ?? "").trim();
    const rawLat = Number(formData.get("latitude"));
    const rawLng = Number(formData.get("longitude"));
    const uploadedFiles = extractUploadedImageFiles(formData);

    if (!rawName || rawName.length > 120) {
      return NextResponse.json(
        { error: "Nama lokasi toilet wajib diisi (maksimal 120 karakter)." },
        { status: 400 }
      );
    }

    if (!isWithinItbPinBounds(rawLat, rawLng)) {
      return NextResponse.json(
        {
          error:
            "Koordinat harus berada di sekitar area ITB Kampus Ganesha, Bandung.",
        },
        { status: 400 }
      );
    }

    if (uploadedFiles.length > MAX_IMAGES_PER_TOILET) {
      return NextResponse.json(
        {
          error: `Maksimal ${MAX_IMAGES_PER_TOILET} foto per titik toilet.`,
        },
        { status: 400 }
      );
    }

    if (uploadedFiles.length > 0) {
      try {
        savedImagePaths = await saveUploadedImages(uploadedFiles);
      } catch (uploadError) {
        return NextResponse.json(
          {
            error:
              uploadError instanceof Error
                ? uploadError.message
                : "Gagal memproses foto yang diunggah.",
          },
          { status: 400 }
        );
      }
    }

    const nowMs = Date.now();
    const toilet = await prisma.toilet.create({
      data: {
        name: rawName,
        latitude: rawLat,
        longitude: rawLng,
        imagePath: savedImagePaths[0] ?? null,
        updatedByEmail: session.email,
        images:
          savedImagePaths.length > 0
            ? {
                create: savedImagePaths.map((imagePath, idx) => ({
                  imagePath,
                  uploadedByEmail: session.email,
                  createdAt: new Date(nowMs + idx),
                })),
              }
            : undefined,
      },
      select: TOILET_ADMIN_SELECT,
    });

    return NextResponse.json(
      { toilet: serializeToilet(toilet) },
      { status: 201 }
    );
  } catch (err) {
    if (savedImagePaths.length > 0) {
      await deleteUploadsByUrls(savedImagePaths);
    }
    console.error("POST /api/toilets failed:", err);
    return NextResponse.json(
      { error: "Gagal menyimpan titik toilet baru." },
      { status: 500 }
    );
  }
}
