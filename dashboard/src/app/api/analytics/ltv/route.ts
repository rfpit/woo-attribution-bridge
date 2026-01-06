import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { stores, orders } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  predictLTV,
  getLTVBySource,
  getSegmentDistribution,
  type CustomerData,
} from "@/lib/analytics";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const predictionMonths = parseInt(
      searchParams.get("predictionMonths") || "12",
    );
    const discountRate = parseFloat(searchParams.get("discountRate") || "0.1");
    const avgLifespanMonths = parseInt(
      searchParams.get("avgLifespanMonths") || "36",
    );
    const limit = parseInt(searchParams.get("limit") || "100");

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

    // Aggregate customer data from orders
    const customerAggregates = await db
      .select({
        customerEmailHash: orders.customerEmailHash,
        orderCount: sql<number>`COUNT(*)::int`,
        totalRevenue: sql<number>`SUM(CAST(${orders.total} AS DECIMAL))`,
        firstOrderDate: sql<Date>`MIN(${orders.dateCreated})`,
        lastOrderDate: sql<Date>`MAX(${orders.dateCreated})`,
        avgOrderValue: sql<number>`AVG(CAST(${orders.total} AS DECIMAL))`,
      })
      .from(orders)
      .where(sql`${orders.storeId} = ANY(${storeIds})`)
      .groupBy(orders.customerEmailHash)
      .limit(limit * 2); // Fetch more to ensure we have enough after filtering

    // Get source attribution for each customer (first order source)
    const customerSources = await db
      .select({
        customerEmailHash: orders.customerEmailHash,
        attribution: orders.attribution,
      })
      .from(orders)
      .where(
        and(sql`${orders.storeId} = ANY(${storeIds})`, orders.isNewCustomer),
      );

    // Build source map
    const sourceMap = new Map<string, string>();
    for (const row of customerSources) {
      const attr = row.attribution as {
        source?: string;
        gclid?: string;
        fbclid?: string;
        ttclid?: string;
      } | null;

      let source = "direct";
      if (attr?.gclid) source = "google";
      else if (attr?.fbclid) source = "meta";
      else if (attr?.ttclid) source = "tiktok";
      else if (attr?.source) source = attr.source;

      sourceMap.set(row.customerEmailHash, source);
    }

    // Build customer data for LTV prediction
    const customers: CustomerData[] = customerAggregates
      .filter((c) => c.orderCount > 0)
      .slice(0, limit)
      .map((c) => ({
        customerId: c.customerEmailHash,
        firstOrderDate: new Date(c.firstOrderDate),
        lastOrderDate: new Date(c.lastOrderDate),
        orderCount: c.orderCount,
        totalRevenue: Number(c.totalRevenue),
        avgOrderValue: Number(c.avgOrderValue),
        source: sourceMap.get(c.customerEmailHash) || "direct",
      }));

    // Predict LTV for all customers
    const predictions = predictLTV(customers, {
      predictionMonths,
      discountRate,
      avgLifespanMonths,
    });

    // Get LTV by source
    const ltvBySource = getLTVBySource(predictions, customers);

    // Get segment distribution
    const segmentDistribution = getSegmentDistribution(predictions);

    // Calculate summary stats
    const totalHistoricalValue = predictions.reduce(
      (sum, p) => sum + p.historicalValue,
      0,
    );
    const totalPredictedValue = predictions.reduce(
      (sum, p) => sum + p.predictedValue,
      0,
    );
    const totalLTV = predictions.reduce((sum, p) => sum + p.totalLTV, 0);

    const avgLTV = predictions.length > 0 ? totalLTV / predictions.length : 0;
    const avgConfidence =
      predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.confidenceScore, 0) /
          predictions.length
        : 0;

    // High value customers (top 20%)
    const sortedByLTV = [...predictions].sort(
      (a, b) => b.totalLTV - a.totalLTV,
    );
    const highValueThreshold =
      sortedByLTV[Math.floor(sortedByLTV.length * 0.2)]?.totalLTV || 0;
    const highValueCount = predictions.filter(
      (p) => p.totalLTV >= highValueThreshold,
    ).length;

    // At risk customers
    const atRiskCount = predictions.filter(
      (p) => p.churnProbability > 0.5,
    ).length;

    return NextResponse.json({
      predictions: predictions.slice(0, limit),
      ltvBySource,
      segmentDistribution,
      summary: {
        totalCustomers: predictions.length,
        totalHistoricalValue: Math.round(totalHistoricalValue * 100) / 100,
        totalPredictedValue: Math.round(totalPredictedValue * 100) / 100,
        totalLTV: Math.round(totalLTV * 100) / 100,
        avgLTV: Math.round(avgLTV * 100) / 100,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        highValueCount,
        highValueThreshold: Math.round(highValueThreshold * 100) / 100,
        atRiskCount,
      },
    });
  } catch (error) {
    console.error("LTV API error:", error);
    return NextResponse.json(
      { error: "Failed to calculate LTV predictions" },
      { status: 500 },
    );
  }
}
