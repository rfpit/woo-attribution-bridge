/**
 * TikTok Ads Account Selection Route
 *
 * POST: Creates a connection for the selected TikTok advertiser account
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections, pendingOAuthTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface TikTokAccount {
  accountId: string;
  name: string;
  currency: string;
  timezone: string;
}

/**
 * POST /api/auth/tiktok/select-account
 *
 * Creates a connection for the selected advertiser account from a pending token
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { pendingTokenId?: string; accountId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { pendingTokenId, accountId } = body;

  if (!pendingTokenId) {
    return NextResponse.json(
      { error: "pendingTokenId is required" },
      { status: 400 },
    );
  }

  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required" },
      { status: 400 },
    );
  }

  // Find the pending token
  const [pendingToken] = await db
    .select()
    .from(pendingOAuthTokens)
    .where(
      and(
        eq(pendingOAuthTokens.id, pendingTokenId),
        eq(pendingOAuthTokens.userId, session.user.id),
        eq(pendingOAuthTokens.platform, "tiktok_ads"),
      ),
    )
    .limit(1);

  if (!pendingToken) {
    return NextResponse.json(
      { error: "Pending token not found" },
      { status: 404 },
    );
  }

  // Check if token has expired
  if (pendingToken.expiresAt < new Date()) {
    // Clean up expired token
    await db
      .delete(pendingOAuthTokens)
      .where(eq(pendingOAuthTokens.id, pendingTokenId));

    return NextResponse.json(
      {
        error: "Pending token has expired. Please start the OAuth flow again.",
      },
      { status: 410 },
    );
  }

  // Validate selected account is in the pending token
  const accounts = pendingToken.accounts as TikTokAccount[];
  const selectedAccount = accounts.find((acc) => acc.accountId === accountId);

  if (!selectedAccount) {
    return NextResponse.json(
      { error: "Selected account is not valid" },
      { status: 400 },
    );
  }

  // Check for existing connection
  const [existingConnection] = await db
    .select()
    .from(adPlatformConnections)
    .where(
      and(
        eq(adPlatformConnections.userId, session.user.id),
        eq(adPlatformConnections.platform, "tiktok_ads"),
        eq(adPlatformConnections.accountId, accountId),
      ),
    )
    .limit(1);

  if (existingConnection) {
    // Update existing connection instead of creating new
    await db
      .update(adPlatformConnections)
      .set({
        accessToken: pendingToken.accessToken,
        refreshToken: pendingToken.refreshToken,
        tokenExpiresAt: pendingToken.tokenExpiresAt,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(adPlatformConnections.id, existingConnection.id));
  } else {
    // Note: Tokens are already encrypted in pendingToken
    await db.insert(adPlatformConnections).values({
      userId: session.user.id,
      platform: "tiktok_ads",
      accountId: selectedAccount.accountId,
      accountName: selectedAccount.name,
      accessToken: pendingToken.accessToken,
      refreshToken: pendingToken.refreshToken,
      tokenExpiresAt: pendingToken.tokenExpiresAt,
      status: "active",
    });
  }

  // Delete the pending token
  await db
    .delete(pendingOAuthTokens)
    .where(eq(pendingOAuthTokens.id, pendingTokenId));

  return NextResponse.json({ success: true });
}
