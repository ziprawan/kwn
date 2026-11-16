import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import {
  AdminSource,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  evaluateAdminAccess,
  normalizeEmail,
  verifySessionToken,
} from "@/lib/auth-core";

export * from "@/lib/auth-core";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

export interface VerifiedAdminSession {
  email: string;
  name: string | null;
  source: AdminSource;
}

export function getAppBaseUrl(fallbackRequestUrl?: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (fallbackRequestUrl) {
    return new URL(fallbackRequestUrl).origin;
  }
  return "http://localhost:3000";
}

export function shouldUseSecureCookie(requestUrl?: string): boolean {
  return getAppBaseUrl(requestUrl).startsWith("https://");
}

export async function checkAdminAccess(email: string) {
  return evaluateAdminAccess(email, (normalized) =>
    prisma.admin.findUnique({
      where: { email: normalized },
      select: { id: true },
    })
  );
}

export async function getVerifiedAdminSession(): Promise<VerifiedAdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const parsed = await verifySessionToken(token);
  if (!parsed) {
    return null;
  }

  const access = await checkAdminAccess(parsed.email);
  if (!access.authorized || !access.source) {
    return null;
  }

  return {
    email: parsed.email,
    name: parsed.name,
    source: access.source,
  };
}

export async function verifyGoogleIdToken(
  idToken: string,
  expectedNonce?: string
): Promise<{ email: string; name: string | null }> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID belum dikonfigurasi.");
  }

  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });

  if (expectedNonce && payload.nonce !== expectedNonce) {
    throw new Error("Nonce Google ID token tidak valid.");
  }

  if (payload.email_verified !== true || typeof payload.email !== "string") {
    throw new Error("Email Google belum terverifikasi.");
  }

  return {
    email: normalizeEmail(payload.email),
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

export function buildSessionCookieOptions(requestUrl?: string) {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookie(requestUrl),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function buildOAuthStateCookieOptions(requestUrl?: string) {
  return {
    name: OAUTH_STATE_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookie(requestUrl),
    path: "/",
    maxAge: 60 * 10, // 10 menit
  };
}
