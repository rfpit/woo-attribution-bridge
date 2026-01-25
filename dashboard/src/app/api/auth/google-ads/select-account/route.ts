/**
 * Google Ads Account Selection Route
 *
 * POST: Create a connection from a pending OAuth token
 * and a selected account ID
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections, pendingOAuthTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateTokenExpiry } from "@/lib/google-ads";

interface AccountInfo {
  customerId: string;
  name: string | null;
  currency: string;
  timezone: string;
}

/**
 * POST /api/auth/google-ads/select-account
 *
 * Creates a Google Ads connection from a pending OAuth token
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
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
        eq(pendingOAuthTokens.platform, "google_ads"),
      ),
    )
    .limit(1);

  if (!pendingToken) {
    return NextResponse.json(
      { error: "Pending token not found or expired" },
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
      { status: 400 },
    );
  }

  // Find the selected account in the stored accounts
  const accounts = pendingToken.accounts as AccountInfo[] | null;
  const selectedAccount = accounts?.find((acc) => acc.customerId === accountId);

  if (!selectedAccount) {
    return NextResponse.json(
      { error: "Selected account not found in available accounts" },
      { status: 400 },
    );
  }

  // Check if this account is already connected
  const [existingConnection] = await db
    .select()
    .from(adPlatformConnections)
    .where(
      and(
        eq(adPlatformConnections.userId, session.user.id),
        eq(adPlatformConnections.platform, "google_ads"),
        eq(adPlatformConnections.accountId, accountId),
      ),
    )
    .limit(1);

  if (existingConnection) {
    // Clean up pending token
    await db
      .delete(pendingOAuthTokens)
      .where(eq(pendingOAuthTokens.id, pendingTokenId));
    return NextResponse.json(
      { error: "This Google Ads account is already connected" },
      { status: 409 },
    );
  }

  // Create the connection
  const [newConnection] = await db
    .insert(adPlatformConnections)
    .values({
      userId: session.user.id,
      platform: "google_ads",
      accountId: selectedAccount.customerId,
      accountName: selectedAccount.name,
      accessToken: pendingToken.accessToken,
      refreshToken: pendingToken.refreshToken,
      tokenExpiresAt: pendingToken.tokenExpiresAt,
      status: "active",
    })
    .returning({ id: adPlatformConnections.id });

  // Delete the pending token
  await db
    .delete(pendingOAuthTokens)
    .where(eq(pendingOAuthTokens.id, pendingTokenId));

  return NextResponse.json({ connectionId: newConnection.id }, { status: 201 });
}
