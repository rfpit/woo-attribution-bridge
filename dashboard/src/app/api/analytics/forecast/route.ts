import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { stores, orders, adSpend, adPlatformConnections } from "@/db/schema";
import { and, eq, gte, sql, or, SQL } from "drizzle-orm";

// Helper to create store filter that works around Drizzle UUID array bug
function storeFilter(storeIds: string[]): SQL {
  if (storeIds.length === 1) {
    return eq(orders.storeId, storeIds[0]);
  }
  return or(...storeIds.map((id) => eq(orders.storeId, id)))!;
}

function connectionFilter(connectionIds: string[]): SQL {
  if (connectionIds.length === 1) {
    return eq(adSpend.connectionId, connectionIds[0]);
  }
  return or(...connectionIds.map((id) => eq(adSpend.connectionId, id)))!;
}
import {
  forecastRevenue,
  recommendAdSpend,
  type TimeSeriesPoint,
} from "@/lib/analytics";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const periods = parseInt(searchParams.get("periods") || "12");
    const periodType =
      (searchParams.get("periodType") as "day" | "week" | "month") || "month";
    const confidenceLevel = parseFloat(
      searchParams.get("confidenceLevel") || "0.9",
    );
    const targetROAS = parseFloat(searchParams.get("targetROAS") || "3");

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

    // Calculate historical date range based on period type
    const monthsBack =
      periodType === "day" ? 6 : periodType === "week" ? 12 : 24;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);

    // Fetch historical revenue data
    const revenueData = await db
      .select({
        date: sql<Date>`DATE_TRUNC(${periodType}, ${orders.dateCreated})`,
        total: sql<number>`SUM(CAST(${orders.total} AS DECIMAL))`,
      })
      .from(orders)
      .where(and(storeFilter(storeIds), gte(orders.dateCreated, startDate)))
      .groupBy(sql`DATE_TRUNC(${periodType}, ${orders.dateCreated})`)
      .orderBy(sql`DATE_TRUNC(${periodType}, ${orders.dateCreated})`);

    // Convert to TimeSeriesPoint format
    const historicalRevenue: TimeSeriesPoint[] = revenueData.map((row) => ({
      date: new Date(row.date),
      value: Number(row.total),
    }));

    // Forecast revenue
    const { forecast, summary } = forecastRevenue(historicalRevenue, {
      periods,
      periodType,
      confidenceLevel,
    });

    // Get ad spend data for recommendations
    const userConnections = await db
      .select({ id: adPlatformConnections.id })
      .from(adPlatformConnections)
      .where(eq(adPlatformConnections.userId, userId));

    const connectionIds = userConnections.map((c) => c.id);

    let adSpendRecommendation = null;

    if (connectionIds.length > 0) {
      // Fetch historical ad spend
      const spendData = await db
        .select({
          date: sql<Date>`DATE_TRUNC(${periodType}, ${adSpend.date})`,
          total: sql<number>`SUM(CAST(${adSpend.spend} AS DECIMAL))`,
        })
        .from(adSpend)
        .where(
          and(connectionFilter(connectionIds), gte(adSpend.date, startDate)),
        )
        .groupBy(sql`DATE_TRUNC(${periodType}, ${adSpend.date})`)
        .orderBy(sql`DATE_TRUNC(${periodType}, ${adSpend.date})`);

      const historicalSpend: TimeSeriesPoint[] = spendData.map((row) => ({
        date: new Date(row.date),
        value: Number(row.total),
      }));

      // Get ad spend recommendation
      adSpendRecommendation = recommendAdSpend({
        historicalRevenue,
        historicalSpend,
        targetROAS,
        forecastPeriods: periods,
      });
    }

    // Calculate trend visualization data
    const trendData = [
      ...historicalRevenue.map((point) => ({
        date: point.date.toISOString(),
        value: point.value,
        type: "historical" as const,
      })),
      ...forecast.map((point) => ({
        date: point.date.toISOString(),
        value: point.predicted,
        lowerBound: point.lowerBound,
        upperBound: point.upperBound,
        type: "forecast" as const,
      })),
    ];

    return NextResponse.json({
      forecast,
      summary,
      adSpendRecommendation,
      trendData,
      historicalPeriods: historicalRevenue.length,
      forecastPeriods: forecast.length,
    });
  } catch (error) {
    console.error("Forecast API error:", error);
    return NextResponse.json(
      { error: "Failed to generate forecast" },
      { status: 500 },
    );
  }
}
