/**
 * TikTok Ads OAuth Routes
 *
 * GET: Initiate OAuth flow - redirects to TikTok consent screen
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/tiktok";
import { generateStateToken, encryptJson } from "@/lib/encryption";

const STATE_COOKIE_NAME = "tiktok_oauth_state";
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface OAuthState {
  state: string;
  userId: string;
  expiresAt: number;
}

/**
 * GET /api/auth/tiktok
 *
 * Initiates the TikTok Ads OAuth flow by:
 * 1. Generating a secure state token
 * 2. Storing it in an encrypted cookie
 * 3. Redirecting to TikTok's consent screen
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    // Redirect to sign-in for unauthenticated users
    return NextResponse.redirect(
      new URL(
        "/auth/signin",
        process.env.NEXTAUTH_URL || "http://localhost:3000",
      ),
    );
  }

  // Generate state token
  const state = generateStateToken();

  // Store state in encrypted cookie
  const stateData: OAuthState = {
    state,
    userId: session.user.id,
    expiresAt: Date.now() + STATE_EXPIRY_MS,
  };

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE_NAME, encryptJson(stateData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  // Build and redirect to TikTok OAuth URL
  const authUrl = buildAuthUrl(state);

  return NextResponse.redirect(authUrl);
}
