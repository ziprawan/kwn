import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import {
  type AdminSource,
  canRevokeDbAdmin,
} from "@/lib/admin-permissions";

export { type AdminSource, canRevokeDbAdmin };

export const SESSION_COOKIE_NAME = "itb_toilet_session";
export const OAUTH_STATE_COOKIE_NAME = "itb_toilet_oauth_state";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari

export interface SessionPayload {
  email: string;
  name: string | null;
}

export interface AdminAccessResult {
  authorized: boolean;
  source: AdminSource | null;
  adminId?: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function getAdminPortalSlug(): string {
  const raw = process.env.ADMIN_PORTAL_SLUG?.trim() || "kelola-toilet";
  // Strip leading/trailing slashes so route comparisons are exact
  return raw.replace(/^\/+|\/+$/g, "") || "kelola-toilet";
}

export function getEnvAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => entry.length > 0 && isValidEmail(entry));
}

export function getAuthSecretBytes(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim() || "";
  if (process.env.NODE_ENV === "production" && secret.length < 16) {
    throw new Error("AUTH_SECRET minimal 16 karakter wajib diisi pada mode production.");
  }
  const effective =
    secret.length >= 16
      ? secret
      : "dev-only-insecure-secret-peta-toilet-itb";
  return new TextEncoder().encode(effective);
}

export function isDevMockLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_MOCK_LOGIN === "true"
  );
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const secret = getAuthSecretBytes();
  const normalizedEmail = normalizeEmail(payload.email);

  return new SignJWT({
    email: normalizedEmail,
    name: payload.name ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(normalizedEmail)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }
  try {
    const secret = getAuthSecretBytes();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (typeof payload.email !== "string" || !isValidEmail(payload.email)) {
      return null;
    }
    return {
      email: normalizeEmail(payload.email),
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch {
    return null;
  }
}

export async function evaluateAdminAccess(
  email: string,
  findDbAdminByEmail: (normalizedEmail: string) => Promise<{ id: string } | null>
): Promise<AdminAccessResult> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return { authorized: false, source: null };
  }

  if (getEnvAdminEmails().includes(normalized)) {
    return { authorized: true, source: "env" };
  }

  const dbAdmin = await findDbAdminByEmail(normalized);
  if (dbAdmin) {
    return { authorized: true, source: "db", adminId: dbAdmin.id };
  }

  return { authorized: false, source: null };
}

export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function generatePkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}
