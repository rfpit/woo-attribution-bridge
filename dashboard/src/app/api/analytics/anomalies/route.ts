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
  detectAnomalies,
  detectCorrelatedAnomalies,
  generateAlertConfig,
  type DataPoint,
  type AnomalyDetectionOptions,
} from "@/lib/analytics";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sensitivity =
      (searchParams.get("sensitivity") as "low" | "medium" | "high") ||
      "medium";
    const windowSize = parseInt(searchParams.get("windowSize") || "30");
    const metrics = searchParams.get("metrics")?.split(",") || [
      "revenue",
      "orders",
      "ad_spend",
      "roas",
    ];

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

    // Get date range (last 90 days for anomaly detection)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    // Fetch daily metrics
    const dailyRevenue = await db
      .select({
        date: sql<Date>`DATE(${orders.dateCreated})`,
        total: sql<number>`SUM(CAST(${orders.total} AS DECIMAL))`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(orders)
      .where(and(storeFilter(storeIds), gte(orders.dateCreated, startDate)))
      .groupBy(sql`DATE(${orders.dateCreated})`)
      .orderBy(sql`DATE(${orders.dateCreated})`);

    // Get ad platform connections
    const userConnections = await db
      .select({ id: adPlatformConnections.id })
      .from(adPlatformConnections)
      .where(eq(adPlatformConnections.userId, userId));

    const connectionIds = userConnections.map((c) => c.id);

    // Fetch ad spend data
    let dailyAdSpend: { date: Date; total: number }[] = [];
    if (connectionIds.length > 0) {
      dailyAdSpend = await db
        .select({
          date: sql<Date>`DATE(${adSpend.date})`,
          total: sql<number>`SUM(CAST(${adSpend.spend} AS DECIMAL))`,
        })
        .from(adSpend)
        .where(
          and(connectionFilter(connectionIds), gte(adSpend.date, startDate)),
        )
        .groupBy(sql`DATE(${adSpend.date})`)
        .orderBy(sql`DATE(${adSpend.date})`);
    }

    // Build datasets for anomaly detection
    const datasets: { metric: string; data: DataPoint[] }[] = [];

    // Revenue dataset
    if (metrics.includes("revenue")) {
      datasets.push({
        metric: "revenue",
        data: dailyRevenue.map((row) => ({
          date: new Date(row.date),
          value: Number(row.total),
        })),
      });
    }

    // Orders dataset
    if (metrics.includes("orders")) {
      datasets.push({
        metric: "orders",
        data: dailyRevenue.map((row) => ({
          date: new Date(row.date),
          value: row.count,
        })),
      });
    }

    // Ad spend dataset
    if (metrics.includes("ad_spend") && dailyAdSpend.length > 0) {
      datasets.push({
        metric: "ad_spend",
        data: dailyAdSpend.map((row) => ({
          date: new Date(row.date),
          value: Number(row.total),
        })),
      });
    }

    // ROAS dataset (requires both revenue and ad spend)
    if (metrics.includes("roas") && dailyAdSpend.length > 0) {
      // Build spend map by date
      const spendByDate = new Map<string, number>();
      for (const row of dailyAdSpend) {
        spendByDate.set(
          new Date(row.date).toISOString().split("T")[0],
          Number(row.total),
        );
      }

      const roasData: DataPoint[] = [];
      for (const row of dailyRevenue) {
        const dateKey = new Date(row.date).toISOString().split("T")[0];
        const spend = spendByDate.get(dateKey) || 0;
        if (spend > 0) {
          roasData.push({
            date: new Date(row.date),
            value: Number(row.total) / spend,
          });
        }
      }

      if (roasData.length > 0) {
        datasets.push({
          metric: "roas",
          data: roasData,
        });
      }
    }

    // Conversion rate dataset
    if (metrics.includes("conversion_rate")) {
      // Would need session data - placeholder for now
      // Could calculate as orders / estimated visits
    }

    // Anomaly detection options
    const options: Partial<AnomalyDetectionOptions> = {
      sensitivity,
      windowSize,
      minDataPoints: 14,
      detectSpikes: true,
      detectDrops: true,
    };

    // Detect correlated anomalies across metrics
    const { anomalies, correlations } = detectCorrelatedAnomalies(
      datasets,
      options,
    );

    // Generate alert configurations for each metric
    const alertConfigs = datasets.map((d) =>
      generateAlertConfig(anomalies, d.metric),
    );

    // Summary statistics
    const criticalCount = anomalies.filter(
      (a) => a.severity === "critical",
    ).length;
    const warningCount = anomalies.filter(
      (a) => a.severity === "warning",
    ).length;
    const infoCount = anomalies.filter((a) => a.severity === "info").length;

    // Recent anomalies (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentAnomalies = anomalies.filter((a) => a.date >= sevenDaysAgo);

    return NextResponse.json({
      anomalies,
      correlations,
      alertConfigs,
      summary: {
        totalAnomalies: anomalies.length,
        critical: criticalCount,
        warning: warningCount,
        info: infoCount,
        recentCount: recentAnomalies.length,
        correlatedEvents: correlations.length,
        metricsAnalyzed: datasets.length,
      },
      recentAnomalies,
    });
  } catch (error) {
    console.error("Anomalies API error:", error);
    return NextResponse.json(
      { error: "Failed to detect anomalies" },
      { status: 500 },
    );
  }
}
