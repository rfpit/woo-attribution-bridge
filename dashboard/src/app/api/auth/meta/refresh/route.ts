/**
 * Meta Ads Token Refresh Route
 *
 * POST: Refresh a long-lived token by exchanging it for a new one
 *
 * Note: Meta tokens work differently from Google - there's no "refresh token".
 * Long-lived tokens can be exchanged for new long-lived tokens, but only
 * if they haven't expired yet. Once expired, user must re-authenticate.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { refreshToken, calculateTokenExpiry } from "@/lib/meta";
import { encrypt, decrypt } from "@/lib/encryption";

/**
 * POST /api/auth/meta/refresh
 *
 * Refreshes the access token for a Meta Ads connection
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

  // Check if token has already expired
  // Meta tokens cannot be refreshed after they expire
  if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
    // Mark connection as needing reauth
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
          "Token has expired. Meta tokens cannot be refreshed after expiry. Please reconnect your Meta Ads account.",
      },
      { status: 400 },
    );
  }

  try {
    // Decrypt the current token
    const decryptedToken = decrypt(connection.accessToken);

    // Exchange for a new long-lived token
    const newTokens = await refreshToken(decryptedToken);

    // Calculate new expiry
    const newExpiry = calculateTokenExpiry(newTokens.expiresIn);

    // Update the connection with new access token
    await db
      .update(adPlatformConnections)
      .set({
        accessToken: encrypt(newTokens.accessToken),
        tokenExpiresAt: newExpiry,
        updatedAt: new Date(),
      })
      .where(eq(adPlatformConnections.id, connectionId));

    return NextResponse.json({
      success: true,
      expiresAt: newExpiry.toISOString(),
    });
  } catch (err) {
    console.error("Meta token refresh error:", err);

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
          "Failed to refresh token. Please reconnect your Meta Ads account.",
        needsReauth: true,
      },
      { status: 401 },
    );
  }
}
