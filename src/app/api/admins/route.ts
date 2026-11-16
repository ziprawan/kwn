import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getEnvAdminEmails,
  getVerifiedAdminSession,
  isValidEmail,
  normalizeEmail,
} from "@/lib/auth";

export async function GET() {
  const session = await getVerifiedAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "Akses ditolak. Silakan login sebagai admin." },
      { status: 401 }
    );
  }

  const dbAdmins = await prisma.admin.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      addedBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    envAdmins: getEnvAdminEmails(),
    dbAdmins,
    currentAdminEmail: session.email,
  });
}

export async function POST(request: NextRequest) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "Akses ditolak. Silakan login sebagai admin." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as { email?: string; name?: string };
    const email = normalizeEmail(body.email || "");
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Format alamat email Google tidak valid." },
        { status: 400 }
      );
    }

    if (getEnvAdminEmails().includes(email)) {
      return NextResponse.json(
        { error: "Email tersebut sudah terdaftar sebagai super-admin." },
        { status: 409 }
      );
    }

    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email admin tersebut sudah terdaftar." },
        { status: 409 }
      );
    }

    const admin = await prisma.admin.create({
      data: {
        email,
        name: name ? name.slice(0, 80) : null,
        addedBy: session.email,
      },
      select: {
        id: true,
        email: true,
        name: true,
        addedBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ admin }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admins failed:", err);
    return NextResponse.json(
      { error: "Gagal menambahkan admin baru." },
      { status: 500 }
    );
  }
}
