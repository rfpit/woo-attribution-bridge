/**
 * Marketing Connections API
 *
 * CRUD operations for Klaviyo, Postscript, and other marketing platform connections
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  marketingConnections,
  marketingCampaigns,
  marketingSubscribers,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await db.query.marketingConnections.findMany({
      where: eq(marketingConnections.userId, session.user.id),
      orderBy: [desc(marketingConnections.createdAt)],
    });

    // Get campaign and subscriber counts for each connection
    const connectionsWithStats = await Promise.all(
      connections.map(async (connection) => {
        const [campaigns, subscribers] = await Promise.all([
          db
            .select()
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.connectionId, connection.id)),
          db
            .select()
            .from(marketingSubscribers)
            .where(eq(marketingSubscribers.connectionId, connection.id)),
        ]);

        return {
          ...connection,
          // Mask API key for security
          apiKey: connection.apiKey
            ? "••••••••" + connection.apiKey.slice(-4)
            : null,
          stats: {
            campaignCount: campaigns.length,
            subscriberCount: subscribers.length,
          },
        };
      }),
    );

    return NextResponse.json({ connections: connectionsWithStats });
  } catch (error) {
    console.error("Failed to fetch marketing connections:", error);
    return NextResponse.json(
      { error: "Failed to fetch connections" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { platform, name, apiKey, publicApiKey, shopId, settings } = body;

    if (!platform || !apiKey) {
      return NextResponse.json(
        { error: "Platform and API key are required" },
        { status: 400 },
      );
    }

    // Validate platform
    const validPlatforms = ["klaviyo", "postscript", "mailchimp", "attentive"];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    // Test the connection based on platform
    let accountId: string | null = null;
    try {
      if (platform === "klaviyo") {
        accountId = await testKlaviyoConnection(apiKey);
      } else if (platform === "postscript") {
        if (!shopId) {
          return NextResponse.json(
            { error: "Shop ID is required for Postscript" },
            { status: 400 },
          );
        }
        accountId = await testPostscriptConnection(apiKey, shopId);
      }
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to validate ${platform} credentials: ${error}` },
        { status: 400 },
      );
    }

    const [connection] = await db
      .insert(marketingConnections)
      .values({
        userId: session.user.id,
        platform,
        name: name || `${platform} Connection`,
        apiKey,
        publicApiKey,
        shopId,
        accountId,
        settings,
        status: "active",
      })
      .returning();

    return NextResponse.json({
      connection: {
        ...connection,
        apiKey: "••••••••" + connection.apiKey.slice(-4),
      },
    });
  } catch (error) {
    console.error("Failed to create marketing connection:", error);
    return NextResponse.json(
      { error: "Failed to create connection" },
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
        { error: "Connection ID is required" },
        { status: 400 },
      );
    }

    // Verify ownership
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

    await db
      .delete(marketingConnections)
      .where(eq(marketingConnections.id, connectionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete marketing connection:", error);
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 },
    );
  }
}

/**
 * Test Klaviyo API connection
 */
async function testKlaviyoConnection(apiKey: string): Promise<string> {
  const response = await fetch("https://a.klaviyo.com/api/accounts/", {
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: "2024-10-15",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Invalid Klaviyo API key");
  }

  const data = await response.json();
  return data.data?.[0]?.id || "unknown";
}

/**
 * Test Postscript API connection
 */
async function testPostscriptConnection(
  apiKey: string,
  shopId: string,
): Promise<string> {
  const response = await fetch("https://api.postscript.io/api/v2/shops/me", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Postscript-Shop-Id": shopId,
    },
  });

  if (!response.ok) {
    throw new Error("Invalid Postscript credentials");
  }

  const data = await response.json();
  return data.shop?.id || shopId;
}
