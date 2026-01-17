import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import { eq, and, gte, sql, or } from "drizzle-orm";
import { subDays } from "date-fns";
import { parseTimestamp } from "@/lib/utils";

// Helper to create store filter that works around Drizzle UUID array bug
function storeFilter(storeIds: string[]) {
  if (storeIds.length === 1) {
    return eq(orders.storeId, storeIds[0]);
  }
  return or(...storeIds.map((id) => eq(orders.storeId, id)))!;
}

interface TouchpointData {
  source?: string;
  weight?: number;
  timestamp?: string | number;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  utm_source?: string;
}

interface MultiTouchData {
  first_touch?: TouchpointData;
  last_touch?: TouchpointData;
  linear?: Array<{ source: string; weight: number }>;
  position_based?: Array<{ source: string; weight: number }>;
  time_decay?: Array<{ source: string; weight: number }>;
  touchpoint_count?: number;
}

interface AttributionData {
  // New nested structure from WordPress plugin
  multi_touch?: MultiTouchData;
  // Legacy flat structure (for backwards compatibility)
  first_touch?: TouchpointData;
  last_touch?: TouchpointData;
  linear?: Array<{ source: string; weight: number }>;
  position_based?: Array<{ source: string; weight: number }>;
  time_decay?: Array<{ source: string; weight: number }>;
  touchpoint_count?: number;
  // Raw click IDs at root level
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  utm?: { utm_source?: string };
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

// Derive source from click IDs when source field is not present
function deriveSource(touchpoint: TouchpointData | undefined): string | null {
  if (!touchpoint) return null;

  // If source is explicitly set, use it
  if (touchpoint.source) return touchpoint.source;

  // Derive from click IDs (priority order)
  if (touchpoint.gclid) return "google_ads";
  if (touchpoint.fbclid) return "meta_ads";
  if (touchpoint.ttclid) return "tiktok_ads";
  if (touchpoint.msclkid) return "microsoft_ads";
  if (touchpoint.utm_source) return touchpoint.utm_source;

  return null;
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
        timeToConversion: {
          average: 0,
          median: 0,
          distribution: [],
          ordersWithData: 0,
        },
        journeyPatterns: {
          singleTouch: { orders: 0, revenue: 0 },
          multiTouch: { orders: 0, revenue: 0 },
          avgTouchpointsMulti: 0,
        },
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

    // Time-to-conversion tracking
    const timeToConversionDays: number[] = [];
    const timeToConversionBuckets = {
      "<1 hour": { orders: 0, revenue: 0 },
      "1-24 hours": { orders: 0, revenue: 0 },
      "1-7 days": { orders: 0, revenue: 0 },
      "7-30 days": { orders: 0, revenue: 0 },
      "30+ days": { orders: 0, revenue: 0 },
    };

    // Journey pattern tracking
    let singleTouchOrders = 0;
    let singleTouchRevenue = 0;
    let multiTouchOrders = 0;
    let multiTouchRevenue = 0;
    let multiTouchTotalTouchpoints = 0;

    for (const order of ordersWithAttribution) {
      const attribution = order.attribution as AttributionData | null;
      if (!attribution) continue;

      const orderTotal = parseFloat(order.total);

      // Get multi-touch data (check nested structure first, then flat)
      const multiTouch = attribution.multi_touch || attribution;

      // Track touchpoint distribution
      const touchpointCount =
        multiTouch.touchpoint_count || attribution.touchpoint_count;
      if (touchpointCount) {
        touchpointCounts[touchpointCount] =
          (touchpointCounts[touchpointCount] || 0) + 1;
        totalTouchpoints += touchpointCount;
        ordersWithTouchpoints++;

        // Track single vs multi-touch journeys
        if (touchpointCount === 1) {
          singleTouchOrders++;
          singleTouchRevenue += orderTotal;
        } else {
          multiTouchOrders++;
          multiTouchRevenue += orderTotal;
          multiTouchTotalTouchpoints += touchpointCount;
        }
      }

      // Calculate time to conversion from first touch timestamp
      const firstTouchData = attribution.first_touch || multiTouch.first_touch;
      const firstTouchTime = parseTimestamp(firstTouchData?.timestamp);
      const orderTime = parseTimestamp(order.dateCreated);

      if (firstTouchTime && orderTime && orderTime > firstTouchTime) {
        const diffMs = orderTime - firstTouchTime;
        const diffHours = diffMs / (1000 * 60 * 60);
        const diffDays = diffHours / 24;

        timeToConversionDays.push(diffDays);

        // Bucket the time to conversion
        if (diffHours < 1) {
          timeToConversionBuckets["<1 hour"].orders++;
          timeToConversionBuckets["<1 hour"].revenue += orderTotal;
        } else if (diffHours < 24) {
          timeToConversionBuckets["1-24 hours"].orders++;
          timeToConversionBuckets["1-24 hours"].revenue += orderTotal;
        } else if (diffDays < 7) {
          timeToConversionBuckets["1-7 days"].orders++;
          timeToConversionBuckets["1-7 days"].revenue += orderTotal;
        } else if (diffDays < 30) {
          timeToConversionBuckets["7-30 days"].orders++;
          timeToConversionBuckets["7-30 days"].revenue += orderTotal;
        } else {
          timeToConversionBuckets["30+ days"].orders++;
          timeToConversionBuckets["30+ days"].revenue += orderTotal;
        }
      }

      // Collect all unique sources for this order to count orders/revenue once per source
      const sourcesInOrder = new Set<string>();

      // First touch attribution
      // Prefer outer attribution.first_touch (from WAB_Cookie) over multi_touch
      // because WAB_Cookie correctly tracks first/last touch while touchpoint tracker may be incomplete
      const firstTouch = attribution.first_touch || multiTouch.first_touch;
      const firstTouchSource = deriveSource(firstTouch);
      if (firstTouchSource) {
        sourcesInOrder.add(firstTouchSource);
        if (!sourceData[firstTouchSource]) {
          sourceData[firstTouchSource] = {
            source: firstTouchSource,
            orders: 0,
            revenue: 0,
            firstTouch: 0,
            lastTouch: 0,
            linear: 0,
            positionBased: 0,
          };
        }
        sourceData[firstTouchSource].firstTouch += orderTotal;
      }

      // Last touch attribution
      // Prefer outer attribution.last_touch (from WAB_Cookie) over multi_touch
      const lastTouch = attribution.last_touch || multiTouch.last_touch;
      const lastTouchSource = deriveSource(lastTouch);
      if (lastTouchSource) {
        sourcesInOrder.add(lastTouchSource);
        if (!sourceData[lastTouchSource]) {
          sourceData[lastTouchSource] = {
            source: lastTouchSource,
            orders: 0,
            revenue: 0,
            firstTouch: 0,
            lastTouch: 0,
            linear: 0,
            positionBased: 0,
          };
        }
        sourceData[lastTouchSource].lastTouch += orderTotal;
      }

      // Linear attribution
      const linear = multiTouch.linear || attribution.linear;
      if (linear) {
        for (const item of linear) {
          if (!item.source) continue;
          const source = item.source;
          sourcesInOrder.add(source);
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
      const positionBased =
        multiTouch.position_based || attribution.position_based;
      if (positionBased) {
        // Handle both array and single object formats
        const items = Array.isArray(positionBased)
          ? positionBased
          : [positionBased];
        for (const item of items) {
          if (!item.source) continue;
          const source = item.source;
          sourcesInOrder.add(source);
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
          sourceData[source].positionBased += orderTotal * (item.weight || 1);
        }
      }

      // Fallback: Generate linear/position_based from first/last touch
      // when multi_touch data is incomplete but we have different sources
      const hasLinearData = linear && linear.length > 1;
      const hasPositionData =
        positionBased &&
        (Array.isArray(positionBased) ? positionBased.length > 1 : false);

      if (
        firstTouchSource &&
        lastTouchSource &&
        firstTouchSource !== lastTouchSource &&
        !hasLinearData
      ) {
        // Two distinct sources - distribute 50/50 for linear
        for (const src of [firstTouchSource, lastTouchSource]) {
          if (!sourceData[src]) {
            sourceData[src] = {
              source: src,
              orders: 0,
              revenue: 0,
              firstTouch: 0,
              lastTouch: 0,
              linear: 0,
              positionBased: 0,
            };
          }
          sourceData[src].linear += orderTotal * 0.5;
        }
      }

      if (
        firstTouchSource &&
        lastTouchSource &&
        firstTouchSource !== lastTouchSource &&
        !hasPositionData
      ) {
        // Two distinct sources - 50/50 for position based (40% each in 2-touch)
        for (const src of [firstTouchSource, lastTouchSource]) {
          if (!sourceData[src]) {
            sourceData[src] = {
              source: src,
              orders: 0,
              revenue: 0,
              firstTouch: 0,
              lastTouch: 0,
              linear: 0,
              positionBased: 0,
            };
          }
          sourceData[src].positionBased += orderTotal * 0.5;
        }
      }

      // Count orders and revenue once per unique source in this order
      for (const source of sourcesInOrder) {
        if (sourceData[source]) {
          sourceData[source].orders++;
          sourceData[source].revenue += orderTotal;
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

    // Calculate time-to-conversion statistics
    const sortedTimes = [...timeToConversionDays].sort((a, b) => a - b);
    const avgTimeToConversion =
      sortedTimes.length > 0
        ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length
        : 0;
    const medianTimeToConversion =
      sortedTimes.length > 0
        ? sortedTimes.length % 2 === 0
          ? (sortedTimes[sortedTimes.length / 2 - 1] +
              sortedTimes[sortedTimes.length / 2]) /
            2
          : sortedTimes[Math.floor(sortedTimes.length / 2)]
        : 0;

    // Convert buckets to array for easier frontend consumption
    const timeToConversionDistribution = Object.entries(
      timeToConversionBuckets,
    ).map(([bucket, data]) => ({
      bucket,
      orders: data.orders,
      revenue: data.revenue,
    }));

    return NextResponse.json({
      sources,
      models,
      touchpointDistribution,
      averageTouchpoints:
        ordersWithTouchpoints > 0
          ? totalTouchpoints / ordersWithTouchpoints
          : 0,
      totalOrdersWithAttribution: ordersWithAttribution.length,
      // New time-to-conversion data
      timeToConversion: {
        average: avgTimeToConversion,
        median: medianTimeToConversion,
        distribution: timeToConversionDistribution,
        ordersWithData: sortedTimes.length,
      },
      // New journey pattern data
      journeyPatterns: {
        singleTouch: {
          orders: singleTouchOrders,
          revenue: singleTouchRevenue,
        },
        multiTouch: {
          orders: multiTouchOrders,
          revenue: multiTouchRevenue,
        },
        avgTouchpointsMulti:
          multiTouchOrders > 0
            ? multiTouchTotalTouchpoints / multiTouchOrders
            : 0,
      },
    });
  } catch (error) {
    console.error("Attribution fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch attribution data" },
      { status: 500 },
    );
  }
}
