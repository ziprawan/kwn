import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canRevokeDbAdmin, getVerifiedAdminSession } from "@/lib/auth";

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

  if (
    !canRevokeDbAdmin({
      actorEmail: session.email,
      actorSource: session.source,
      targetEmail: target.email,
      targetAddedBy: target.addedBy,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "Anda hanya dapat mencabut akses admin yang Anda tambahkan sendiri.",
      },
      { status: 403 }
    );
  }

  await prisma.admin.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
