/**
 * Google Ads Token Refresh Route
 *
 * POST: Refresh an expired access token using the refresh token
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { refreshAccessToken, calculateTokenExpiry } from "@/lib/google-ads";
import { encrypt, decrypt } from "@/lib/encryption";

/**
 * POST /api/auth/google-ads/refresh
 *
 * Refreshes the access token for a Google Ads connection
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { connectionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { connectionId } = body;

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
        eq(adPlatformConnections.platform, "google_ads"),
      ),
    )
    .limit(1);

  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 },
    );
  }

  if (!connection.refreshToken) {
    return NextResponse.json(
      {
        error:
          "No refresh token available. Please reconnect your Google Ads account.",
      },
      { status: 400 },
    );
  }

  try {
    // Decrypt the refresh token
    const decryptedRefreshToken = decrypt(connection.refreshToken);

    // Refresh the access token
    const newTokens = await refreshAccessToken(decryptedRefreshToken);

    // Update the connection with new access token
    await db
      .update(adPlatformConnections)
      .set({
        accessToken: encrypt(newTokens.accessToken),
        tokenExpiresAt: calculateTokenExpiry(newTokens.expiresIn),
        updatedAt: new Date(),
      })
      .where(eq(adPlatformConnections.id, connectionId));

    return NextResponse.json({
      success: true,
      expiresAt: calculateTokenExpiry(newTokens.expiresIn).toISOString(),
    });
  } catch (err) {
    console.error("Token refresh error:", err);

    // If refresh fails, mark connection as needing reauth
    await db
      .update(adPlatformConnections)
      .set({
        status: "needs_reauth",
        updatedAt: new Date(),
      })
      .where(eq(adPlatformConnections.id, connectionId));

    return NextResponse.json(
      {
        error:
          "Failed to refresh token. Please reconnect your Google Ads account.",
        needsReauth: true,
      },
      { status: 401 },
    );
  }
}
