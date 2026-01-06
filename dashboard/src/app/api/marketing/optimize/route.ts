/**
 * Marketing Budget Optimizer API
 *
 * Optimize budget allocation and bid recommendations across campaigns
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  adPlatformConnections,
  adSpend,
  orders,
  stores,
  marketplaceAdSpend,
  marketplaceConnections,
} from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  optimizeBudget,
  recommendBidAdjustments,
  type CampaignPerformance,
} from "@/lib/marketing/budget-optimizer";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      totalBudget,
      targetRoas = 3,
      optimizeFor = "balanced",
      startDate,
      endDate,
      platforms, // Optional: filter by platforms
    } = body;

    if (!totalBudget || totalBudget <= 0) {
      return NextResponse.json(
        { error: "Valid total budget is required" },
        { status: 400 },
      );
    }

    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Get user's ad platform connections
    const userConnections = await db.query.adPlatformConnections.findMany({
      where: eq(adPlatformConnections.userId, session.user.id),
    });

    // Get user's stores for revenue attribution
    const userStores = await db.query.stores.findMany({
      where: eq(stores.userId, session.user.id),
    });

    const storeIds = userStores.map((s) => s.id);

    // Get ad spend data
    const connectionIds = userConnections
      .filter((c) => !platforms || platforms.includes(c.platform))
      .map((c) => c.id);

    if (connectionIds.length === 0) {
      return NextResponse.json({
        optimization: null,
        bidRecommendations: [],
        message: "No ad platform connections found",
      });
    }

    // Aggregate campaign performance from ad spend
    const campaignData = await db
      .select({
        campaignId: adSpend.campaignId,
        campaignName: adSpend.campaignName,
        connectionId: adSpend.connectionId,
        spend: sql<number>`SUM(${adSpend.spend}::numeric)`,
        impressions: sql<number>`SUM(${adSpend.impressions})`,
        clicks: sql<number>`SUM(${adSpend.clicks})`,
      })
      .from(adSpend)
      .where(
        and(
          sql`${adSpend.connectionId} IN (${sql.join(
            connectionIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          gte(adSpend.date, start),
          lte(adSpend.date, end),
        ),
      )
      .groupBy(adSpend.campaignId, adSpend.campaignName, adSpend.connectionId);

    // Get orders for revenue calculation
    const orderData =
      storeIds.length > 0
        ? await db
            .select({
              total: sql<number>`SUM(${orders.total}::numeric)`,
              count: sql<number>`COUNT(*)`,
            })
            .from(orders)
            .where(
              and(
                sql`${orders.storeId} IN (${sql.join(
                  storeIds.map((id) => sql`${id}`),
                  sql`, `,
                )})`,
                gte(orders.dateCreated, start),
                lte(orders.dateCreated, end),
              ),
            )
        : [{ total: 0, count: 0 }];

    const totalRevenue = orderData[0]?.total || 0;
    const totalOrders = orderData[0]?.count || 0;

    // Build campaign performance data
    const connectionMap = new Map(userConnections.map((c) => [c.id, c]));
    const totalCampaignSpend = campaignData.reduce(
      (sum, c) => sum + Number(c.spend),
      0,
    );

    const campaigns: CampaignPerformance[] = campaignData.map((campaign) => {
      const connection = connectionMap.get(campaign.connectionId);
      const spend = Number(campaign.spend);

      // Estimate revenue attribution proportionally
      const spendRatio =
        totalCampaignSpend > 0 ? spend / totalCampaignSpend : 0;
      const estimatedRevenue = totalRevenue * spendRatio;
      const estimatedConversions = Math.round(totalOrders * spendRatio);

      const roas = spend > 0 ? estimatedRevenue / spend : 0;
      const cpa =
        estimatedConversions > 0 ? spend / estimatedConversions : spend;
      const ctr =
        campaign.impressions > 0
          ? (campaign.clicks / campaign.impressions) * 100
          : 0;
      const conversionRate =
        campaign.clicks > 0
          ? (estimatedConversions / campaign.clicks) * 100
          : 0;

      return {
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName || campaign.campaignId,
        platform: connection?.platform || "unknown",
        spend,
        revenue: estimatedRevenue,
        conversions: estimatedConversions,
        clicks: campaign.clicks,
        impressions: campaign.impressions,
        roas,
        cpa,
        ctr,
        conversionRate,
      };
    });

    // Also include marketplace ad campaigns
    const marketplaceConnectionData =
      await db.query.marketplaceConnections.findMany({
        where: eq(marketplaceConnections.userId, session.user.id),
      });

    const marketplaceConnectionIds = marketplaceConnectionData
      .filter((c) => !platforms || platforms.includes(c.platform))
      .map((c) => c.id);

    if (marketplaceConnectionIds.length > 0) {
      const marketplaceCampaignData = await db
        .select({
          campaignId: marketplaceAdSpend.campaignId,
          campaignName: marketplaceAdSpend.campaignName,
          platform: marketplaceAdSpend.platform,
          spend: sql<number>`SUM(${marketplaceAdSpend.spend}::numeric)`,
          impressions: sql<number>`SUM(${marketplaceAdSpend.impressions})`,
          clicks: sql<number>`SUM(${marketplaceAdSpend.clicks})`,
          sales: sql<number>`SUM(${marketplaceAdSpend.sales}::numeric)`,
        })
        .from(marketplaceAdSpend)
        .where(
          and(
            sql`${marketplaceAdSpend.connectionId} IN (${sql.join(
              marketplaceConnectionIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
            gte(marketplaceAdSpend.date, start),
            lte(marketplaceAdSpend.date, end),
          ),
        )
        .groupBy(
          marketplaceAdSpend.campaignId,
          marketplaceAdSpend.campaignName,
          marketplaceAdSpend.platform,
        );

      for (const campaign of marketplaceCampaignData) {
        const spend = Number(campaign.spend);
        const sales = Number(campaign.sales);
        const roas = spend > 0 ? sales / spend : 0;
        const estimatedConversions = Math.ceil(sales / 50); // Rough estimate
        const cpa =
          estimatedConversions > 0 ? spend / estimatedConversions : spend;
        const ctr =
          campaign.impressions > 0
            ? (campaign.clicks / campaign.impressions) * 100
            : 0;
        const conversionRate =
          campaign.clicks > 0
            ? (estimatedConversions / campaign.clicks) * 100
            : 0;

        campaigns.push({
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName || campaign.campaignId,
          platform: `${campaign.platform}_ads`,
          spend,
          revenue: sales,
          conversions: estimatedConversions,
          clicks: campaign.clicks,
          impressions: campaign.impressions,
          roas,
          cpa,
          ctr,
          conversionRate,
        });
      }
    }

    if (campaigns.length === 0) {
      return NextResponse.json({
        optimization: null,
        bidRecommendations: [],
        message: "No campaign data found for the selected period",
      });
    }

    // Run budget optimization
    const optimization = optimizeBudget(campaigns, {
      totalBudget,
      targetRoas,
      optimizeFor,
      minCampaignBudget: 10,
      maxCampaignBudgetPercent: 0.4,
    });

    // Get bid recommendations
    const bidRecommendations = recommendBidAdjustments(campaigns, targetRoas);

    return NextResponse.json({
      optimization,
      bidRecommendations,
      campaignData: campaigns,
      dateRange: { start, end },
    });
  } catch (error) {
    console.error("Failed to optimize budget:", error);
    return NextResponse.json(
      { error: "Failed to optimize budget" },
      { status: 500 },
    );
  }
}
