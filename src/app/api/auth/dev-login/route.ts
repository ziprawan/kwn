import { NextRequest, NextResponse } from "next/server";
import {
  buildSessionCookieOptions,
  checkAdminAccess,
  createSessionToken,
  getEnvAdminEmails,
  isDevMockLoginEnabled,
  normalizeEmail,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isDevMockLoginEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let requestedEmail = "";
  try {
    const body = (await request.json()) as { email?: string };
    requestedEmail = normalizeEmail(body.email || "");
  } catch {
    requestedEmail = "";
  }

  const targetEmail = requestedEmail || getEnvAdminEmails()[0] || "";
  if (!targetEmail) {
    return NextResponse.json(
      { error: "ADMIN_EMAILS belum diisi di .env." },
      { status: 400 }
    );
  }

  const access = await checkAdminAccess(targetEmail);
  if (!access.authorized) {
    return NextResponse.json(
      { error: "Email tersebut tidak terdaftar sebagai admin." },
      { status: 403 }
    );
  }

  const token = await createSessionToken({
    email: targetEmail,
    name: "Developer Preview",
  });

  const response = NextResponse.json({ ok: true, email: targetEmail });
  response.cookies.set({
    ...buildSessionCookieOptions(request.url),
    value: token,
  });
  return response;
}
