import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  OAUTH_STATE_COOKIE_NAME,
  buildSessionCookieOptions,
  checkAdminAccess,
  createSessionToken,
  getAdminPortalSlug,
  getAppBaseUrl,
  verifyGoogleIdToken,
} from "@/lib/auth";

interface OAuthStateCookie {
  state: string;
  codeVerifier: string;
  nonce: string;
}

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl(request.url);
  const adminSlug = getAdminPortalSlug();
  const url = new URL(request.url);

  const redirectWithError = (errorCode: string) => {
    const res = NextResponse.redirect(
      `${baseUrl}/${adminSlug}?error=${encodeURIComponent(errorCode)}`
    );
    res.cookies.delete(OAUTH_STATE_COOKIE_NAME);
    return res;
  };

  if (url.searchParams.get("error")) {
    return redirectWithError("cancelled");
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const rawStateCookie = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;

  if (!code || !returnedState || !rawStateCookie) {
    return redirectWithError("invalid_state");
  }

  let parsedState: OAuthStateCookie;
  try {
    parsedState = JSON.parse(rawStateCookie) as OAuthStateCookie;
  } catch {
    return redirectWithError("invalid_state");
  }

  if (
    !parsedState.state ||
    !parsedState.codeVerifier ||
    !parsedState.nonce ||
    parsedState.state !== returnedState
  ) {
    return redirectWithError("invalid_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return redirectWithError("oauth_not_configured");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: parsedState.codeVerifier,
      }),
      cache: "no-store",
    });

    if (!tokenRes.ok) {
      return redirectWithError("oauth_exchange_failed");
    }

    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    if (!tokenJson.id_token) {
      return redirectWithError("oauth_exchange_failed");
    }

    const profile = await verifyGoogleIdToken(
      tokenJson.id_token,
      parsedState.nonce
    );
    const access = await checkAdminAccess(profile.email);

    if (!access.authorized) {
      return redirectWithError("unauthorized");
    }

    if (access.source === "db" && access.adminId && profile.name) {
      await prisma.admin
        .update({
          where: { id: access.adminId },
          data: { name: profile.name },
        })
        .catch(() => {});
    }

    const sessionToken = await createSessionToken({
      email: profile.email,
      name: profile.name,
    });

    const response = NextResponse.redirect(`${baseUrl}/${adminSlug}`);
    response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
    response.cookies.set({
      ...buildSessionCookieOptions(request.url),
      value: sessionToken,
    });
    return response;
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return redirectWithError("oauth_failed");
  }
}
