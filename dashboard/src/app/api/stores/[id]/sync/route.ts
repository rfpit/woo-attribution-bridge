import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// POST /api/stores/[id]/sync - Test connection and update sync status
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership and get store details
    const [store] = await db
      .select()
      .from(stores)
      .where(and(eq(stores.id, id), eq(stores.userId, session.user.id)));

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Try to reach the store's health endpoint
    let isReachable = false;
    let storeStatus = store.status;

    try {
      // Build the health check URL - the plugin exposes a REST endpoint
      const storeUrl = new URL(store.url);
      const healthUrl = `${storeUrl.origin}/wp-json/wab/v1/health`;

      const response = await fetch(healthUrl, {
        method: "GET",
        headers: {
          "X-WAB-API-Key": store.apiKey || "",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        isReachable = true;
        storeStatus = "active";

        // Update store with info from the plugin
        await db
          .update(stores)
          .set({
            status: "active",
            lastSyncAt: new Date(),
            currency: data.currency || store.currency,
            timezone: data.timezone || store.timezone,
            updatedAt: new Date(),
          })
          .where(eq(stores.id, id));
      } else if (response.status === 401 || response.status === 403) {
        // API key mismatch
        storeStatus = "disconnected";
        await db
          .update(stores)
          .set({
            status: "disconnected",
            updatedAt: new Date(),
          })
          .where(eq(stores.id, id));

        return NextResponse.json({
          success: false,
          status: "disconnected",
          message:
            "API key mismatch. Please verify the API key in your plugin settings.",
        });
      } else {
        // Plugin not configured or other error
        storeStatus = "pending";
      }
    } catch (fetchError) {
      // Store is unreachable or plugin not installed
      console.log("Store health check failed:", fetchError);

      // Don't change status if it's already active (temporary network issue)
      if (store.status === "pending") {
        return NextResponse.json({
          success: false,
          status: "pending",
          message:
            "Could not reach the store. Make sure the plugin is installed and configured.",
        });
      }
    }

    if (isReachable) {
      return NextResponse.json({
        success: true,
        status: storeStatus,
        lastSyncAt: new Date().toISOString(),
        message: "Store connection verified successfully.",
      });
    }

    return NextResponse.json({
      success: false,
      status: storeStatus,
      message:
        "Could not verify store connection. The plugin may not be installed or configured yet.",
    });
  } catch (error) {
    console.error("Sync store error:", error);
    return NextResponse.json(
      { error: "Failed to sync store" },
      { status: 500 },
    );
  }
}
