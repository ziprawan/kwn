import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  evaluateAdminAccess,
  generateOAuthState,
  generatePkcePair,
  getAdminPortalSlug,
  getEnvAdminEmails,
  verifySessionToken,
} from "@/lib/auth-core";

describe("auth core utilities", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-with-at-least-32-characters-123";
    process.env.ADMIN_EMAILS = "Owner@Gmail.com, co-admin@itb.ac.id";
    process.env.ADMIN_PORTAL_SLUG = "/rahasia-itb/";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("normalizes portal slug and env super-admin emails", () => {
    expect(getAdminPortalSlug()).toBe("rahasia-itb");
    expect(getEnvAdminEmails()).toEqual(["owner@gmail.com", "co-admin@itb.ac.id"]);
  });

  it("creates and verifies signed JWT sessions and rejects tampered tokens", async () => {
    const token = await createSessionToken({
      email: "Owner@Gmail.com",
      name: "Admin ITB",
    });

    const verified = await verifySessionToken(token);
    expect(verified).toEqual({
      email: "owner@gmail.com",
      name: "Admin ITB",
    });

    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(await verifySessionToken(tampered)).toBeNull();
    expect(await verifySessionToken(null)).toBeNull();
  });

  it("evaluates env admins, DB admins, and immediate revocation", async () => {
    const dbStore = new Set(["teman@gmail.com"]);
    const lookup = async (email: string) =>
      dbStore.has(email) ? { id: "adm-1" } : null;

    expect(await evaluateAdminAccess("OWNER@gmail.com", lookup)).toEqual({
      authorized: true,
      source: "env",
    });

    expect(await evaluateAdminAccess("Teman@Gmail.com", lookup)).toEqual({
      authorized: true,
      source: "db",
      adminId: "adm-1",
    });

    // Simulate admin removal in DB -> immediately unauthorized
    dbStore.delete("teman@gmail.com");
    expect(await evaluateAdminAccess("teman@gmail.com", lookup)).toEqual({
      authorized: false,
      source: null,
    });

    expect(await evaluateAdminAccess("orangasing@gmail.com", lookup)).toEqual({
      authorized: false,
      source: null,
    });
  });

  it("generates unique OAuth state and valid S256 PKCE pair", () => {
    const s1 = generateOAuthState();
    const s2 = generateOAuthState();
    expect(s1).not.toBe(s2);
    expect(s1.length).toBeGreaterThanOrEqual(24);

    const pkce = generatePkcePair();
    expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(32);
    expect(pkce.codeChallenge).toBeTruthy();
    expect(pkce.codeChallenge).not.toBe(pkce.codeVerifier);
  });
});
