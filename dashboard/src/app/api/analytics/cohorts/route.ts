import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { stores, orders } from "@/db/schema";
import { eq, sql, and, gte, or, SQL } from "drizzle-orm";

// Helper to create store filter that works around Drizzle UUID array bug
function storeFilter(storeIds: string[]): SQL {
  if (storeIds.length === 1) {
    return eq(orders.storeId, storeIds[0]);
  }
  return or(...storeIds.map((id) => eq(orders.storeId, id)))!;
}
import {
  buildCohortAnalysis,
  getCohortRetentionMatrix,
  getAverageRetentionCurve,
  getCohortLTV,
  type CohortInput,
} from "@/lib/analytics";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const groupBy =
      (searchParams.get("groupBy") as "month" | "week" | "quarter") || "month";
    const source = searchParams.get("source") || undefined;
    const maxPeriods = parseInt(searchParams.get("maxPeriods") || "12");
    const months = parseInt(searchParams.get("months") || "12");

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

    // Get date range
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    // Fetch all orders within the date range
    const orderData = await db
      .select({
        customerEmailHash: orders.customerEmailHash,
        total: orders.total,
        dateCreated: orders.dateCreated,
        attribution: orders.attribution,
      })
      .from(orders)
      .where(and(storeFilter(storeIds), gte(orders.dateCreated, startDate)));

    // Group orders by customer and find first order date
    const customerFirstOrder = new Map<string, Date>();
    for (const order of orderData) {
      const existing = customerFirstOrder.get(order.customerEmailHash);
      if (!existing || order.dateCreated < existing) {
        customerFirstOrder.set(order.customerEmailHash, order.dateCreated);
      }
    }

    // Build cohort input data
    const cohortInput: CohortInput[] = orderData.map((order) => {
      // Extract source from attribution
      const attr = order.attribution as {
        source?: string;
        gclid?: string;
        fbclid?: string;
        ttclid?: string;
      } | null;

      let orderSource = "direct";
      if (attr?.gclid) orderSource = "google";
      else if (attr?.fbclid) orderSource = "meta";
      else if (attr?.ttclid) orderSource = "tiktok";
      else if (attr?.source) orderSource = attr.source;

      return {
        customerId: order.customerEmailHash,
        firstOrderDate:
          customerFirstOrder.get(order.customerEmailHash) || order.dateCreated,
        orderDate: order.dateCreated,
        revenue: parseFloat(order.total),
        source: orderSource,
      };
    });

    // Build cohort analysis
    const cohorts = buildCohortAnalysis(cohortInput, {
      groupBy,
      source,
      maxPeriods,
    });

    // Get additional cohort metrics
    const retentionMatrix = getCohortRetentionMatrix(cohorts);
    const avgRetentionCurve = getAverageRetentionCurve(cohorts);
    const cohortLTV = getCohortLTV(cohorts);

    // Calculate summary stats
    const totalCustomers = cohorts.reduce(
      (sum, c) => sum + c.customersCount,
      0,
    );
    const avgInitialRevenue =
      totalCustomers > 0
        ? cohorts.reduce((sum, c) => sum + c.initialRevenue, 0) / totalCustomers
        : 0;

    // Get month-over-month retention avg for period 1
    const m1Retention = cohorts
      .filter((c) => c.periods.length > 1)
      .map((c) => c.periods[1].retentionRate);
    const avgM1Retention =
      m1Retention.length > 0
        ? m1Retention.reduce((a, b) => a + b, 0) / m1Retention.length
        : 0;

    return NextResponse.json({
      cohorts,
      retentionMatrix,
      avgRetentionCurve,
      cohortLTV,
      summary: {
        totalCohorts: cohorts.length,
        totalCustomers,
        avgInitialRevenue: Math.round(avgInitialRevenue * 100) / 100,
        avgM1Retention: Math.round(avgM1Retention * 10) / 10,
      },
    });
  } catch (error) {
    console.error("Cohorts API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cohort data" },
      { status: 500 },
    );
  }
}
