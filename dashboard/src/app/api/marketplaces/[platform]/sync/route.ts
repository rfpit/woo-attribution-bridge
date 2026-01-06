/**
 * Marketplace Sync Route
 *
 * Triggers order and ad spend sync for a marketplace connection
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { drizzleDb } from "@/db";
import {
  marketplaceConnections,
  marketplaceOrders,
  marketplaceAdSpend,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createAmazonConnector,
  createEbayConnector,
  createEtsyConnector,
  type MarketplaceOrder,
  type MarketplaceAdSpend as AdSpendData,
} from "@/lib/marketplaces";

type Platform = "amazon" | "ebay" | "etsy";

const VALID_PLATFORMS: Platform[] = ["amazon", "ebay", "etsy"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { platform } = await params;

    if (!VALID_PLATFORMS.includes(platform as Platform)) {
      return NextResponse.json(
        { error: `Invalid platform: ${platform}` },
        { status: 400 },
      );
    }

    const body = await request.json();
    const {
      connectionId,
      startDate,
      endDate,
      syncOrders = true,
      syncAdSpend = true,
    } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: "Connection ID required" },
        { status: 400 },
      );
    }

    // Fetch connection and verify ownership
    const connections = await drizzleDb
      .select()
      .from(marketplaceConnections)
      .where(
        and(
          eq(marketplaceConnections.id, connectionId),
          eq(marketplaceConnections.userId, session.user.id),
        ),
      )
      .limit(1);

    if (connections.length === 0) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    const connection = connections[0];

    // Check if token needs refresh
    let accessToken = connection.accessToken;
    if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
      accessToken = await refreshToken(connection);
    }

    // Set date range (default to last 30 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Create connector
    const connector = getConnector(
      platform as Platform,
      connection.marketplace || "US",
    );

    const results = {
      ordersImported: 0,
      adSpendRecords: 0,
      errors: [] as string[],
    };

    // Sync orders
    if (syncOrders) {
      try {
        let nextToken: string | undefined;
        do {
          const { orders, nextToken: next } = await connector.getOrders({
            accessToken,
            startDate: start,
            endDate: end,
            nextToken,
          });

          if (orders.length > 0) {
            await importOrders(connection.id, orders);
            results.ordersImported += orders.length;
          }

          nextToken = next;
        } while (nextToken);
      } catch (error) {
        console.error("Order sync error:", error);
        results.errors.push(
          `Order sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    // Sync ad spend
    if (syncAdSpend) {
      try {
        const adSpendData = await connector.getAdSpend({
          accessToken,
          startDate: start,
          endDate: end,
        });

        if (adSpendData.length > 0) {
          await importAdSpend(connection.id, adSpendData);
          results.adSpendRecords += adSpendData.length;
        }
      } catch (error) {
        console.error("Ad spend sync error:", error);
        results.errors.push(
          `Ad spend sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    // Update last sync time
    await drizzleDb
      .update(marketplaceConnections)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(marketplaceConnections.id, connectionId));

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("Marketplace sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

function getConnector(platform: Platform, marketplace: string) {
  switch (platform) {
    case "amazon":
      return createAmazonConnector(marketplace);
    case "ebay":
      return createEbayConnector(marketplace);
    case "etsy":
      return createEtsyConnector();
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

async function refreshToken(
  connection: typeof marketplaceConnections.$inferSelect,
): Promise<string> {
  if (!connection.refreshToken) {
    throw new Error("No refresh token available");
  }

  const connector = getConnector(
    connection.platform as Platform,
    connection.marketplace || "US",
  );
  const { accessToken, expiresIn } = await connector.refreshAccessToken(
    connection.refreshToken,
  );

  // Update stored token
  await drizzleDb
    .update(marketplaceConnections)
    .set({
      accessToken,
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      updatedAt: new Date(),
    })
    .where(eq(marketplaceConnections.id, connection.id));

  return accessToken;
}

async function importOrders(
  connectionId: string,
  orders: MarketplaceOrder[],
): Promise<void> {
  for (const order of orders) {
    // Check if order already exists
    const existing = await drizzleDb
      .select({ id: marketplaceOrders.id })
      .from(marketplaceOrders)
      .where(
        and(
          eq(marketplaceOrders.connectionId, connectionId),
          eq(marketplaceOrders.externalId, order.externalId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing order
      await drizzleDb
        .update(marketplaceOrders)
        .set({
          status: order.status,
          total: order.total.toString(),
          subtotal: order.subtotal.toString(),
          tax: order.tax.toString(),
          shipping: order.shipping.toString(),
          fees: order.fees.toString(),
          items: order.items,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceOrders.id, existing[0].id));
    } else {
      // Insert new order
      await drizzleDb.insert(marketplaceOrders).values({
        connectionId,
        externalId: order.externalId,
        orderNumber: order.orderNumber,
        platform: order.platform,
        status: order.status,
        total: order.total.toString(),
        subtotal: order.subtotal.toString(),
        tax: order.tax.toString(),
        shipping: order.shipping.toString(),
        fees: order.fees.toString(),
        currency: order.currency,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        items: order.items,
        orderDate: order.createdAt,
      });
    }
  }
}

async function importAdSpend(
  connectionId: string,
  adSpendData: AdSpendData[],
): Promise<void> {
  for (const spend of adSpendData) {
    // Upsert ad spend record
    const existing = await drizzleDb
      .select({ id: marketplaceAdSpend.id })
      .from(marketplaceAdSpend)
      .where(
        and(
          eq(marketplaceAdSpend.connectionId, connectionId),
          eq(marketplaceAdSpend.campaignId, spend.campaignId),
          eq(marketplaceAdSpend.date, spend.date),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await drizzleDb
        .update(marketplaceAdSpend)
        .set({
          spend: spend.spend.toString(),
          impressions: spend.impressions,
          clicks: spend.clicks,
          sales: spend.sales.toString(),
          acos: spend.acos?.toString(),
          roas: spend.roas?.toString(),
        })
        .where(eq(marketplaceAdSpend.id, existing[0].id));
    } else {
      await drizzleDb.insert(marketplaceAdSpend).values({
        connectionId,
        platform: spend.platform,
        campaignId: spend.campaignId,
        campaignName: spend.campaignName,
        date: spend.date,
        spend: spend.spend.toString(),
        impressions: spend.impressions,
        clicks: spend.clicks,
        sales: spend.sales.toString(),
        acos: spend.acos?.toString(),
        roas: spend.roas?.toString(),
        currency: spend.currency,
      });
    }
  }
}
