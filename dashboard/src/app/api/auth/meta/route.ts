/**
 * Meta Ads OAuth Routes
 *
 * GET: Initiate OAuth flow - redirects to Facebook consent screen
 * DELETE: Disconnect Meta Ads account
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { buildAuthUrl, revokeToken } from "@/lib/meta";
import { generateStateToken, encryptJson, decrypt } from "@/lib/encryption";

const STATE_COOKIE_NAME = "meta_oauth_state";
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface OAuthState {
  state: string;
  userId: string;
  expiresAt: number;
}

/**
 * GET /api/auth/meta
 *
 * Initiates the Meta Ads OAuth flow by:
 * 1. Generating a secure state token
 * 2. Storing it in an encrypted cookie
 * 3. Redirecting to Facebook's consent screen
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Build and redirect to Facebook OAuth URL
  const authUrl = buildAuthUrl(state);

  return NextResponse.redirect(authUrl);
}

/**
 * DELETE /api/auth/meta?connectionId=xxx
 *
 * Disconnects a Meta Ads account by:
 * 1. Revoking the token with Facebook
 * 2. Deleting the connection from the database
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connectionId = request.nextUrl.searchParams.get("connectionId");

  if (!connectionId) {
    return NextResponse.json(
      { error: "connectionId is required" },
      { status: 400 },
    );
  }

  // Find the connection
  const [connection] = await db
    .select()
    .from(adPlatformConnections)
    .where(
      and(
        eq(adPlatformConnections.id, connectionId),
        eq(adPlatformConnections.userId, session.user.id),
        eq(adPlatformConnections.platform, "meta_ads"),
      ),
    )
    .limit(1);

  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 },
    );
  }

  // Try to revoke the token (don't fail if this errors)
  try {
    const decryptedToken = decrypt(connection.accessToken);
    await revokeToken(decryptedToken);
  } catch {
    // Token may already be revoked or invalid - continue with deletion
  }

  // Delete the connection
  await db
    .delete(adPlatformConnections)
    .where(eq(adPlatformConnections.id, connectionId));

  return NextResponse.json({ success: true });
}
