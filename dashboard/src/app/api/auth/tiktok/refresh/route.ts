/**
 * TikTok Ads Token Refresh Route
 *
 * POST: Manually refresh tokens for a specific connection
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/encryption";
import { refreshAccessToken, calculateTokenExpiry } from "@/lib/tiktok";

/**
 * POST /api/auth/tiktok/refresh
 *
 * Refreshes tokens for a TikTok connection.
 * Note: TikTok rotates refresh tokens, so we store the new refresh token.
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
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
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
        eq(adPlatformConnections.platform, "tiktok_ads"),
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
      { error: "No refresh token available" },
      { status: 400 },
    );
  }

  try {
    // Decrypt refresh token
    const refreshToken = decrypt(connection.refreshToken);

    // Refresh tokens with TikTok
    const newTokens = await refreshAccessToken(refreshToken);

    // Update connection with new tokens
    // Note: TikTok rotates refresh tokens, so we store both new tokens
    await db
      .update(adPlatformConnections)
      .set({
        accessToken: encrypt(newTokens.accessToken),
        refreshToken: encrypt(newTokens.refreshToken),
        tokenExpiresAt: calculateTokenExpiry(newTokens.accessTokenExpiresIn),
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(adPlatformConnections.id, connectionId));

    return NextResponse.json({
      success: true,
      tokenExpiresAt: calculateTokenExpiry(
        newTokens.accessTokenExpiresIn,
      ).toISOString(),
    });
  } catch (err) {
    console.error("TikTok token refresh error:", err);

    // Check if refresh token has expired
    const isExpiredError =
      err instanceof Error && err.message.includes("expired");

    if (isExpiredError) {
      // Mark connection as needs reauth
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
            "Refresh token has expired. Please reconnect your TikTok account.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to refresh tokens",
      },
      { status: 500 },
    );
  }
}
