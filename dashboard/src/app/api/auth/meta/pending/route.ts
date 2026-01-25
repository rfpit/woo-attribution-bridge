/**
 * Meta Ads Pending Token Route
 *
 * GET: Fetch pending OAuth token data for account selection
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { pendingOAuthTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/auth/meta/pending?id=xxx
 *
 * Fetches pending OAuth token data including available accounts
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pendingTokenId = request.nextUrl.searchParams.get("id");

  if (!pendingTokenId) {
    return NextResponse.json(
      { error: "Pending token ID is required" },
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
        eq(pendingOAuthTokens.platform, "meta_ads"),
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

  return NextResponse.json({
    accounts: pendingToken.accounts,
    expiresAt: pendingToken.expiresAt.toISOString(),
  });
}
