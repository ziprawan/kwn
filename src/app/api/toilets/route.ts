import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVerifiedAdminSession } from "@/lib/auth";
import { isWithinItbPinBounds } from "@/lib/geo";
import { deleteUploadByUrl, saveUploadedImage } from "@/lib/uploads";

export async function GET() {
  try {
    const toilets = await prisma.toilet.findMany({
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        imagePath: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ toilets });
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

  let savedImagePath: string | null = null;

  try {
    const formData = await request.formData();
    const rawName = String(formData.get("name") ?? "").trim();
    const rawLat = Number(formData.get("latitude"));
    const rawLng = Number(formData.get("longitude"));
    const imageEntry = formData.get("image");

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

    if (imageEntry instanceof File && imageEntry.size > 0) {
      try {
        savedImagePath = await saveUploadedImage(imageEntry);
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

    const toilet = await prisma.toilet.create({
      data: {
        name: rawName,
        latitude: rawLat,
        longitude: rawLng,
        imagePath: savedImagePath,
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

    return NextResponse.json({ toilet }, { status: 201 });
  } catch (err) {
    if (savedImagePath) {
      await deleteUploadByUrl(savedImagePath).catch(() => {});
    }
    console.error("POST /api/toilets failed:", err);
    return NextResponse.json(
      { error: "Gagal menyimpan titik toilet baru." },
      { status: 500 }
    );
  }
}
