import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVerifiedAdminSession } from "@/lib/auth";

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
  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json(
      { error: "Admin tidak ditemukan." },
      { status: 404 }
    );
  }

  if (target.email === session.email) {
    return NextResponse.json(
      { error: "Anda tidak dapat menghapus akun admin Anda sendiri." },
      { status: 400 }
    );
  }

  await prisma.admin.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
