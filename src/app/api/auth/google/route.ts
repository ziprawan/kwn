import { NextRequest, NextResponse } from "next/server";
import {
  buildOAuthStateCookieOptions,
  generateOAuthState,
  generatePkcePair,
  getAdminPortalSlug,
  getAppBaseUrl,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl(request.url);
  const adminSlug = getAdminPortalSlug();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${baseUrl}/${adminSlug}?error=oauth_not_configured`
    );
  }

  const state = generateOAuthState();
  const nonce = generateOAuthState();
  const { codeVerifier, codeChallenge } = generatePkcePair();

  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set({
    ...buildOAuthStateCookieOptions(request.url),
    value: JSON.stringify({ state, codeVerifier, nonce }),
  });

  return response;
}
