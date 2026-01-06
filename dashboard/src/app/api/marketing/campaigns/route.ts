/**
 * Marketing Campaigns API
 *
 * List and sync campaigns from connected marketing platforms
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  marketingConnections,
  marketingCampaigns,
  marketingSyncLogs,
} from "@/db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { KlaviyoClient } from "@/lib/marketing/klaviyo";
import { PostscriptClient } from "@/lib/marketing/postscript";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("connectionId");
    const type = searchParams.get("type"); // email, sms
    const status = searchParams.get("status"); // draft, scheduled, sent
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Get user's marketing connections
    const userConnections = await db.query.marketingConnections.findMany({
      where: eq(marketingConnections.userId, session.user.id),
    });

    if (userConnections.length === 0) {
      return NextResponse.json({ campaigns: [], summary: null });
    }

    const connectionIds = connectionId
      ? [connectionId]
      : userConnections.map((c) => c.id);

    // Build query conditions
    const conditions = [
      sql`${marketingCampaigns.connectionId} IN (${sql.join(
        connectionIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    ];

    if (type) {
      conditions.push(eq(marketingCampaigns.type, type));
    }

    if (status) {
      conditions.push(eq(marketingCampaigns.status, status));
    }

    if (startDate) {
      conditions.push(gte(marketingCampaigns.sentAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(marketingCampaigns.sentAt, new Date(endDate)));
    }

    const campaigns = await db.query.marketingCampaigns.findMany({
      where: and(...conditions),
      orderBy: [desc(marketingCampaigns.sentAt)],
      with: {
        connection: true,
      },
    });

    // Calculate summary metrics
    const sentCampaigns = campaigns.filter((c) => c.status === "sent");
    const summary = {
      totalCampaigns: campaigns.length,
      totalSent: sentCampaigns.reduce((sum, c) => sum + (c.sent || 0), 0),
      totalDelivered: sentCampaigns.reduce(
        (sum, c) => sum + (c.delivered || 0),
        0,
      ),
      totalOpened: sentCampaigns.reduce((sum, c) => sum + (c.opened || 0), 0),
      totalClicked: sentCampaigns.reduce((sum, c) => sum + (c.clicked || 0), 0),
      totalRevenue: sentCampaigns.reduce(
        (sum, c) => sum + Number(c.revenue || 0),
        0,
      ),
      avgOpenRate:
        sentCampaigns.length > 0
          ? sentCampaigns.reduce(
              (sum, c) =>
                sum + (c.delivered ? (c.opened || 0) / c.delivered : 0),
              0,
            ) / sentCampaigns.length
          : 0,
      avgClickRate:
        sentCampaigns.length > 0
          ? sentCampaigns.reduce(
              (sum, c) =>
                sum + (c.delivered ? (c.clicked || 0) / c.delivered : 0),
              0,
            ) / sentCampaigns.length
          : 0,
      byType: {
        email: campaigns.filter((c) => c.type === "email").length,
        sms: campaigns.filter((c) => c.type === "sms").length,
      },
    };

    return NextResponse.json({ campaigns, summary });
  } catch (error) {
    console.error("Failed to fetch marketing campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 },
    );
  }
}

/**
 * Sync campaigns from a marketing platform
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { connectionId } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: "Connection ID is required" },
        { status: 400 },
      );
    }

    // Get connection
    const connection = await db.query.marketingConnections.findFirst({
      where: and(
        eq(marketingConnections.id, connectionId),
        eq(marketingConnections.userId, session.user.id),
      ),
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    // Create sync log
    const [syncLog] = await db
      .insert(marketingSyncLogs)
      .values({
        connectionId,
        syncType: "campaigns",
        status: "running",
        startedAt: new Date(),
      })
      .returning();

    let recordsProcessed = 0;
    let recordsFailed = 0;
    let error: string | null = null;

    try {
      if (connection.platform === "klaviyo") {
        const result = await syncKlaviyoCampaigns(connection);
        recordsProcessed = result.processed;
        recordsFailed = result.failed;
      } else if (connection.platform === "postscript") {
        const result = await syncPostscriptCampaigns(connection);
        recordsProcessed = result.processed;
        recordsFailed = result.failed;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
    }

    // Update sync log
    await db
      .update(marketingSyncLogs)
      .set({
        status: error ? "failed" : "completed",
        recordsProcessed,
        recordsFailed,
        error,
        completedAt: new Date(),
      })
      .where(eq(marketingSyncLogs.id, syncLog.id));

    // Update connection last sync time
    await db
      .update(marketingConnections)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(marketingConnections.id, connectionId));

    return NextResponse.json({
      success: !error,
      recordsProcessed,
      recordsFailed,
      error,
    });
  } catch (error) {
    console.error("Failed to sync marketing campaigns:", error);
    return NextResponse.json(
      { error: "Failed to sync campaigns" },
      { status: 500 },
    );
  }
}

/**
 * Sync campaigns from Klaviyo
 */
async function syncKlaviyoCampaigns(connection: {
  id: string;
  apiKey: string;
  publicApiKey?: string | null;
}): Promise<{ processed: number; failed: number }> {
  const client = new KlaviyoClient({
    apiKey: connection.apiKey,
    publicApiKey: connection.publicApiKey || undefined,
  });

  const campaigns = await client.getCampaigns("sent");
  let processed = 0;
  let failed = 0;

  for (const campaign of campaigns) {
    try {
      // Upsert campaign
      await db
        .insert(marketingCampaigns)
        .values({
          connectionId: connection.id,
          externalId: campaign.id,
          name: campaign.name,
          type: "email",
          status: campaign.status,
          sentAt: campaign.sendTime ? new Date(campaign.sendTime) : null,
          createdAt: new Date(campaign.createdAt),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [marketingCampaigns.externalId],
          set: {
            name: campaign.name,
            status: campaign.status,
            sentAt: campaign.sendTime ? new Date(campaign.sendTime) : null,
            updatedAt: new Date(),
          },
        });

      processed++;
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}

/**
 * Sync campaigns from Postscript
 */
async function syncPostscriptCampaigns(connection: {
  id: string;
  apiKey: string;
  shopId?: string | null;
}): Promise<{ processed: number; failed: number }> {
  if (!connection.shopId) {
    throw new Error("Shop ID is required for Postscript");
  }

  const client = new PostscriptClient({
    apiKey: connection.apiKey,
    shopId: connection.shopId,
  });

  const campaigns = await client.getCampaigns("sent");
  let processed = 0;
  let failed = 0;

  for (const campaign of campaigns) {
    try {
      await db
        .insert(marketingCampaigns)
        .values({
          connectionId: connection.id,
          externalId: campaign.id,
          name: campaign.name,
          type: "sms",
          status: campaign.status,
          messageBody: campaign.messageBody,
          scheduledAt: campaign.scheduledAt
            ? new Date(campaign.scheduledAt)
            : null,
          sentAt: campaign.sentAt ? new Date(campaign.sentAt) : null,
          sent: campaign.statistics?.sent || 0,
          delivered: campaign.statistics?.delivered || 0,
          clicked: campaign.statistics?.clicked || 0,
          revenue: String(campaign.statistics?.revenue || 0),
          unsubscribed: campaign.statistics?.unsubscribed || 0,
          createdAt: new Date(campaign.createdAt),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [marketingCampaigns.externalId],
          set: {
            name: campaign.name,
            status: campaign.status,
            sent: campaign.statistics?.sent || 0,
            delivered: campaign.statistics?.delivered || 0,
            clicked: campaign.statistics?.clicked || 0,
            revenue: String(campaign.statistics?.revenue || 0),
            unsubscribed: campaign.statistics?.unsubscribed || 0,
            updatedAt: new Date(),
          },
        });

      processed++;
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}
