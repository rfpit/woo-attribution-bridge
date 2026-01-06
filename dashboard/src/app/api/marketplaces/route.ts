/**
 * Marketplace Connections API
 *
 * GET: List all marketplace connections for the current user
 * POST: Create a new marketplace connection (after OAuth)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { drizzleDb } from "@/db";
import { marketplaceConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await drizzleDb
      .select({
        id: marketplaceConnections.id,
        platform: marketplaceConnections.platform,
        sellerId: marketplaceConnections.sellerId,
        sellerName: marketplaceConnections.sellerName,
        marketplace: marketplaceConnections.marketplace,
        status: marketplaceConnections.status,
        lastSyncAt: marketplaceConnections.lastSyncAt,
        createdAt: marketplaceConnections.createdAt,
      })
      .from(marketplaceConnections)
      .where(eq(marketplaceConnections.userId, session.user.id));

    return NextResponse.json({ connections });
  } catch (error) {
    console.error("Error fetching marketplace connections:", error);
    return NextResponse.json(
      { error: "Failed to fetch marketplace connections" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("id");

    if (!connectionId) {
      return NextResponse.json(
        { error: "Connection ID required" },
        { status: 400 },
      );
    }

    // Verify ownership and delete
    const result = await drizzleDb
      .delete(marketplaceConnections)
      .where(eq(marketplaceConnections.id, connectionId))
      .returning({ id: marketplaceConnections.id });

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting marketplace connection:", error);
    return NextResponse.json(
      { error: "Failed to delete marketplace connection" },
      { status: 500 },
    );
  }
}
