import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { stores, orders, adSpend, adPlatformConnections } from "@/db/schema";
import { eq, sql, and, gte, lte, inArray, or } from "drizzle-orm";

// Helper to create store filter that works around Drizzle UUID array bug
function storeFilter(storeIds: string[]) {
  if (storeIds.length === 1) {
    return eq(orders.storeId, storeIds[0]);
  }
  // For multiple stores, use OR chain instead of inArray
  return or(...storeIds.map((id) => eq(orders.storeId, id)))!;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's stores
    const userStores = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.userId, userId));

    if (userStores.length === 0) {
      return NextResponse.json(
        { error: "No stores connected" },
        { status: 404 },
      );
    }

    const storeIds = userStores.map((s) => s.id);

    // Calculate date ranges (last 30 days vs previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Current period orders
    const currentOrders = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
        count: sql<number>`COUNT(*)`,
        newCustomers: sql<number>`SUM(CASE WHEN ${orders.isNewCustomer} THEN 1 ELSE 0 END)`,
        uniqueCustomers: sql<number>`COUNT(DISTINCT ${orders.customerEmailHash})`,
        tracked: sql<number>`SUM(CASE WHEN ${orders.attribution}::text != 'null' AND ${orders.attribution}::text != '{}' THEN 1 ELSE 0 END)`,
      })
      .from(orders)
      .where(
        and(
          storeFilter(storeIds),
          gte(orders.dateCreated, thirtyDaysAgo),
          lte(orders.dateCreated, now),
        ),
      );

    // Previous period orders
    const previousOrders = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(${orders.total} AS DECIMAL)), 0)`,
        count: sql<number>`COUNT(*)`,
        uniqueCustomers: sql<number>`COUNT(DISTINCT ${orders.customerEmailHash})`,
        tracked: sql<number>`SUM(CASE WHEN ${orders.attribution}::text != 'null' AND ${orders.attribution}::text != '{}' THEN 1 ELSE 0 END)`,
      })
      .from(orders)
      .where(
        and(
          storeFilter(storeIds),
          gte(orders.dateCreated, sixtyDaysAgo),
          lte(orders.dateCreated, thirtyDaysAgo),
        ),
      );

    // Get ad spend data
    const userConnections = await db
      .select({ id: adPlatformConnections.id })
      .from(adPlatformConnections)
      .where(eq(adPlatformConnections.userId, userId));

    const connectionIds = userConnections.map((c) => c.id);

    let currentSpend = { total: 0 };
    let previousSpend = { total: 0 };

    if (connectionIds.length > 0) {
      const [currentSpendResult] = await db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(${adSpend.spend} AS DECIMAL)), 0)`,
        })
        .from(adSpend)
        .where(
          and(
            inArray(adSpend.connectionId, connectionIds),
            gte(adSpend.date, thirtyDaysAgo),
            lte(adSpend.date, now),
          ),
        );
      currentSpend = currentSpendResult || { total: 0 };

      const [previousSpendResult] = await db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(${adSpend.spend} AS DECIMAL)), 0)`,
        })
        .from(adSpend)
        .where(
          and(
            inArray(adSpend.connectionId, connectionIds),
            gte(adSpend.date, sixtyDaysAgo),
            lte(adSpend.date, thirtyDaysAgo),
          ),
        );
      previousSpend = previousSpendResult || { total: 0 };
    }

    // Get top sources from attribution data
    const attributedOrders = await db
      .select({
        attribution: orders.attribution,
        total: orders.total,
      })
      .from(orders)
      .where(
        and(
          storeFilter(storeIds),
          gte(orders.dateCreated, thirtyDaysAgo),
          sql`${orders.attribution}::text != 'null'`,
          sql`${orders.attribution}::text != '{}'`,
        ),
      );

    // Aggregate by source
    const sourceMap = new Map<
      string,
      { revenue: number; orders: number; spend: number }
    >();

    for (const order of attributedOrders) {
      const attr = order.attribution as {
        source?: string;
        gclid?: string;
        fbclid?: string;
        ttclid?: string;
      };

      let source = "Direct";
      if (attr?.gclid) source = "Google Ads";
      else if (attr?.fbclid) source = "Meta Ads";
      else if (attr?.ttclid) source = "TikTok Ads";
      else if (attr?.source) source = attr.source;

      const existing = sourceMap.get(source) || {
        revenue: 0,
        orders: 0,
        spend: 0,
      };
      existing.revenue += parseFloat(order.total);
      existing.orders += 1;
      sourceMap.set(source, existing);
    }

    const topSources = Array.from(sourceMap.entries())
      .map(([source, data]) => ({
        source,
        revenue: data.revenue,
        orders: data.orders,
        roas:
          data.spend > 0
            ? data.revenue / data.spend
            : data.revenue > 0
              ? 99
              : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Calculate changes
    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const current = currentOrders[0] || {
      total: 0,
      count: 0,
      newCustomers: 0,
      uniqueCustomers: 0,
      tracked: 0,
    };
    const previous = previousOrders[0] || {
      total: 0,
      count: 0,
      uniqueCustomers: 0,
      tracked: 0,
    };

    const attributionRate =
      current.count > 0 ? (current.tracked / current.count) * 100 : 0;
    const previousAttributionRate =
      previous.count > 0 ? (previous.tracked / previous.count) * 100 : 0;

    const roas =
      currentSpend.total > 0 ? current.total / currentSpend.total : 0;

    return NextResponse.json({
      revenue: {
        total: Number(current.total),
        change: calcChange(Number(current.total), Number(previous.total)),
      },
      orders: {
        total: Number(current.count),
        change: calcChange(Number(current.count), Number(previous.count)),
      },
      customers: {
        total: Number(current.uniqueCustomers),
        newCustomers: Number(current.newCustomers),
        change: calcChange(
          Number(current.uniqueCustomers),
          Number(previous.uniqueCustomers),
        ),
      },
      attribution: {
        tracked: Number(current.tracked),
        rate: attributionRate,
        change: calcChange(attributionRate, previousAttributionRate),
      },
      adSpend: {
        total: Number(currentSpend.total),
        roas: roas,
        change: calcChange(
          Number(currentSpend.total),
          Number(previousSpend.total),
        ),
      },
      topSources,
    });
  } catch (error) {
    console.error("Dashboard metrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 },
    );
  }
}
