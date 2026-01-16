import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { stores, orders, attributions, conversionLogs } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all store IDs for this user
    const userStores = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.userId, session.user.id));

    if (userStores.length === 0) {
      return NextResponse.json({
        message: "No data to reset",
        deleted: { orders: 0, attributions: 0, conversionLogs: 0 },
      });
    }

    const storeIds = userStores.map((s) => s.id);

    // Delete all data for user's stores (keep stores and integrations)
    const [deletedOrders, deletedAttributions, deletedLogs] = await Promise.all(
      [
        db
          .delete(orders)
          .where(inArray(orders.storeId, storeIds))
          .returning({ id: orders.id }),
        db
          .delete(attributions)
          .where(inArray(attributions.storeId, storeIds))
          .returning({ id: attributions.id }),
        db
          .delete(conversionLogs)
          .where(inArray(conversionLogs.storeId, storeIds))
          .returning({ id: conversionLogs.id }),
      ],
    );

    // Reset lastSyncAt on stores to allow fresh sync
    await db
      .update(stores)
      .set({ lastSyncAt: null })
      .where(inArray(stores.id, storeIds));

    return NextResponse.json({
      message: "Project data reset successfully",
      deleted: {
        orders: deletedOrders.length,
        attributions: deletedAttributions.length,
        conversionLogs: deletedLogs.length,
      },
    });
  } catch (error) {
    console.error("Reset project error:", error);
    return NextResponse.json(
      { error: "Failed to reset project data" },
      { status: 500 },
    );
  }
}
