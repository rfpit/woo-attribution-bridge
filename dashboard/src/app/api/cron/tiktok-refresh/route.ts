/**
 * TikTok Token Refresh Cron Job
 *
 * GET: Refreshes all TikTok connections with tokens expiring within 6 hours
 *
 * This cron job should run every 12 hours to ensure tokens are refreshed
 * before they expire (TikTok access tokens expire after 24 hours).
 *
 * Security: Protected by CRON_SECRET header
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adPlatformConnections } from "@/db/schema";
import { eq, and, lt, not } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/encryption";
import { refreshAccessToken, calculateTokenExpiry } from "@/lib/tiktok";

// Refresh tokens that expire within 6 hours
const REFRESH_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/**
 * GET /api/cron/tiktok-refresh
 *
 * Refreshes all TikTok connections with expiring tokens.
 * Protected by CRON_SECRET header.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret for security
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow without secret; in production, require it
  if (process.env.NODE_ENV === "production" && cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const refreshThreshold = new Date(Date.now() + REFRESH_THRESHOLD_MS);

  try {
    // Find all TikTok connections with tokens expiring within threshold
    const expiringConnections = await db
      .select()
      .from(adPlatformConnections)
      .where(
        and(
          eq(adPlatformConnections.platform, "tiktok_ads"),
          eq(adPlatformConnections.status, "active"),
          lt(adPlatformConnections.tokenExpiresAt, refreshThreshold),
          not(eq(adPlatformConnections.refreshToken, "")),
        ),
      );

    let refreshed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process each connection
    for (const connection of expiringConnections) {
      if (!connection.refreshToken) {
        failed++;
        errors.push(`Connection ${connection.id}: No refresh token`);
        continue;
      }

      try {
        // Decrypt refresh token
        const refreshToken = decrypt(connection.refreshToken);

        // Refresh tokens with TikTok
        const newTokens = await refreshAccessToken(refreshToken);

        // Update connection with new tokens
        await db
          .update(adPlatformConnections)
          .set({
            accessToken: encrypt(newTokens.accessToken),
            refreshToken: encrypt(newTokens.refreshToken),
            tokenExpiresAt: calculateTokenExpiry(
              newTokens.accessTokenExpiresIn,
            ),
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(adPlatformConnections.id, connection.id));

        refreshed++;
      } catch (err) {
        failed++;
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        errors.push(`Connection ${connection.id}: ${errorMessage}`);

        // Check if refresh token has expired
        const isExpiredError = errorMessage.includes("expired");

        if (isExpiredError) {
          // Mark connection as needs reauth
          await db
            .update(adPlatformConnections)
            .set({
              status: "needs_reauth",
              updatedAt: new Date(),
            })
            .where(eq(adPlatformConnections.id, connection.id));
        }
      }
    }

    return NextResponse.json({
      success: true,
      total: expiringConnections.length,
      refreshed,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("TikTok cron refresh error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron job failed" },
      { status: 500 },
    );
  }
}
