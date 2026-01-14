import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import { eq, desc, or, SQL } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's stores first
    const userStores = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.userId, session.user.id));

    if (userStores.length === 0) {
      return NextResponse.json([]);
    }

    const storeIds = userStores.map((s) => s.id);

    // Helper to create store filter that works around Drizzle UUID array bug
    const storeFilter = (storeIds: string[]): SQL => {
      if (storeIds.length === 1) {
        return eq(orders.storeId, storeIds[0]);
      }
      return or(...storeIds.map((id) => eq(orders.storeId, id)))!;
    };

    // Get orders for user's stores
    const userOrders = await db.query.orders.findMany({
      where: () => storeFilter(storeIds),
      orderBy: [desc(orders.dateCreated)],
      limit: 100,
      with: {
        store: {
          columns: {
            name: true,
          },
        },
      },
    });

    return NextResponse.json(userOrders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 },
    );
  }
}
