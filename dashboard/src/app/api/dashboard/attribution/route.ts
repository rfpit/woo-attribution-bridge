import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import { eq, and, gte, sql, or } from "drizzle-orm";
import { subDays } from "date-fns";

// Helper to create store filter that works around Drizzle UUID array bug
function storeFilter(storeIds: string[]) {
  if (storeIds.length === 1) {
    return eq(orders.storeId, storeIds[0]);
  }
  return or(...storeIds.map((id) => eq(orders.storeId, id)))!;
}

interface AttributionData {
  first_touch?: { source: string; weight: number };
  last_touch?: { source: string; weight: number };
  linear?: Array<{ source: string; weight: number }>;
  position_based?: Array<{ source: string; weight: number }>;
  time_decay?: Array<{ source: string; weight: number }>;
  touchpoint_count?: number;
  touchpoints?: Array<{
    timestamp: string;
    source: string;
    gclid?: string;
    fbclid?: string;
    ttclid?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>;
}

interface SourceBreakdown {
  source: string;
  orders: number;
  revenue: number;
  firstTouch: number;
  lastTouch: number;
  linear: number;
  positionBased: number;
}

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");
    const model = searchParams.get("model") || "all";

    const startDate = subDays(new Date(), days);

    // Get user's stores
    const userStores = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.userId, session.user.id));

    if (userStores.length === 0) {
      return NextResponse.json({
        sources: [],
        models: {
          first_touch: {},
          last_touch: {},
          linear: {},
          position_based: {},
          time_decay: {},
        },
        touchpointDistribution: [],
        averageTouchpoints: 0,
        totalOrdersWithAttribution: 0,
      });
    }

    const storeIds = userStores.map((s) => s.id);

    // Fetch orders with attribution data
    const ordersWithAttribution = await db
      .select({
        id: orders.id,
        total: orders.total,
        attribution: orders.attribution,
        dateCreated: orders.dateCreated,
      })
      .from(orders)
      .where(
        and(
          storeFilter(storeIds),
          gte(orders.dateCreated, startDate),
          sql`${orders.attribution} IS NOT NULL`,
        ),
      );

    // Aggregate attribution data by source and model
    const sourceData: Record<string, SourceBreakdown> = {};
    const touchpointCounts: Record<number, number> = {};
    let totalTouchpoints = 0;
    let ordersWithTouchpoints = 0;

    for (const order of ordersWithAttribution) {
      const attribution = order.attribution as AttributionData | null;
      if (!attribution) continue;

      const orderTotal = parseFloat(order.total);

      // Track touchpoint distribution
      if (attribution.touchpoint_count) {
        const count = attribution.touchpoint_count;
        touchpointCounts[count] = (touchpointCounts[count] || 0) + 1;
        totalTouchpoints += count;
        ordersWithTouchpoints++;
      }

      // First touch attribution
      if (attribution.first_touch) {
        const source = attribution.first_touch.source;
        if (!sourceData[source]) {
          sourceData[source] = {
            source,
            orders: 0,
            revenue: 0,
            firstTouch: 0,
            lastTouch: 0,
            linear: 0,
            positionBased: 0,
          };
        }
        sourceData[source].firstTouch += orderTotal;
        sourceData[source].orders++;
        sourceData[source].revenue += orderTotal;
      }

      // Last touch attribution
      if (attribution.last_touch) {
        const source = attribution.last_touch.source;
        if (!sourceData[source]) {
          sourceData[source] = {
            source,
            orders: 0,
            revenue: 0,
            firstTouch: 0,
            lastTouch: 0,
            linear: 0,
            positionBased: 0,
          };
        }
        sourceData[source].lastTouch += orderTotal;
      }

      // Linear attribution
      if (attribution.linear) {
        for (const item of attribution.linear) {
          const source = item.source;
          if (!sourceData[source]) {
            sourceData[source] = {
              source,
              orders: 0,
              revenue: 0,
              firstTouch: 0,
              lastTouch: 0,
              linear: 0,
              positionBased: 0,
            };
          }
          sourceData[source].linear += orderTotal * item.weight;
        }
      }

      // Position-based attribution
      if (attribution.position_based) {
        for (const item of attribution.position_based) {
          const source = item.source;
          if (!sourceData[source]) {
            sourceData[source] = {
              source,
              orders: 0,
              revenue: 0,
              firstTouch: 0,
              lastTouch: 0,
              linear: 0,
              positionBased: 0,
            };
          }
          sourceData[source].positionBased += orderTotal * item.weight;
        }
      }
    }

    // Convert to arrays and sort
    const sources = Object.values(sourceData).sort(
      (a, b) => b.revenue - a.revenue,
    );

    // Build model-specific aggregates
    const models = {
      first_touch: {} as Record<string, number>,
      last_touch: {} as Record<string, number>,
      linear: {} as Record<string, number>,
      position_based: {} as Record<string, number>,
    };

    for (const source of sources) {
      models.first_touch[source.source] = source.firstTouch;
      models.last_touch[source.source] = source.lastTouch;
      models.linear[source.source] = source.linear;
      models.position_based[source.source] = source.positionBased;
    }

    // Touchpoint distribution
    const touchpointDistribution = Object.entries(touchpointCounts)
      .map(([count, orders]) => ({
        touchpoints: parseInt(count),
        orders,
      }))
      .sort((a, b) => a.touchpoints - b.touchpoints);

    return NextResponse.json({
      sources,
      models,
      touchpointDistribution,
      averageTouchpoints:
        ordersWithTouchpoints > 0
          ? totalTouchpoints / ordersWithTouchpoints
          : 0,
      totalOrdersWithAttribution: ordersWithAttribution.length,
    });
  } catch (error) {
    console.error("Attribution fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch attribution data" },
      { status: 500 },
    );
  }
}
