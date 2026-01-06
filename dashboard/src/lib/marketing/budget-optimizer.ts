/**
 * Budget Allocation Optimizer
 *
 * Optimize ad budget allocation across platforms and campaigns using:
 * - Historical performance data (ROAS, CPA, conversion rates)
 * - Marginal efficiency analysis
 * - Diminishing returns modeling
 * - Multi-objective optimization (revenue vs efficiency)
 */

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  platform: string;
  spend: number;
  revenue: number;
  conversions: number;
  clicks: number;
  impressions: number;
  roas: number;
  cpa: number;
  ctr: number;
  conversionRate: number;
}

export interface BudgetAllocation {
  campaignId: string;
  campaignName: string;
  platform: string;
  currentSpend: number;
  recommendedSpend: number;
  spendChange: number;
  spendChangePercent: number;
  expectedRoas: number;
  expectedRevenue: number;
  priority: "increase" | "maintain" | "decrease" | "pause";
  reason: string;
  confidence: number;
}

export interface BudgetOptimizationResult {
  totalBudget: number;
  optimizedBudget: number;
  allocations: BudgetAllocation[];
  summary: {
    platformAllocations: {
      platform: string;
      budget: number;
      percentage: number;
    }[];
    expectedTotalRevenue: number;
    expectedOverallRoas: number;
    optimizationScore: number;
  };
  insights: string[];
}

export interface BudgetOptimizerOptions {
  totalBudget: number;
  targetRoas?: number;
  minCampaignBudget?: number;
  maxCampaignBudgetPercent?: number;
  optimizeFor: "revenue" | "roas" | "balanced";
}

/**
 * Optimize budget allocation across campaigns
 */
export function optimizeBudget(
  campaigns: CampaignPerformance[],
  options: BudgetOptimizerOptions,
): BudgetOptimizationResult {
  const {
    totalBudget,
    targetRoas = 3,
    minCampaignBudget = 10,
    maxCampaignBudgetPercent = 0.4,
    optimizeFor = "balanced",
  } = options;

  if (campaigns.length === 0) {
    return {
      totalBudget,
      optimizedBudget: 0,
      allocations: [],
      summary: {
        platformAllocations: [],
        expectedTotalRevenue: 0,
        expectedOverallRoas: 0,
        optimizationScore: 0,
      },
      insights: ["No campaign data available for optimization."],
    };
  }

  // Calculate efficiency scores for each campaign
  const scoredCampaigns = campaigns.map((campaign) => {
    const efficiencyScore = calculateEfficiencyScore(
      campaign,
      targetRoas,
      optimizeFor,
    );
    const marginalReturn = estimateMarginalReturn(campaign);
    return { ...campaign, efficiencyScore, marginalReturn };
  });

  // Sort by efficiency score (descending)
  scoredCampaigns.sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  // Allocate budget using efficiency-weighted distribution
  const allocations = allocateBudget(
    scoredCampaigns,
    totalBudget,
    minCampaignBudget,
    maxCampaignBudgetPercent,
    targetRoas,
  );

  // Calculate summary statistics
  const expectedTotalRevenue = allocations.reduce(
    (sum, a) => sum + a.expectedRevenue,
    0,
  );
  const optimizedBudget = allocations.reduce(
    (sum, a) => sum + a.recommendedSpend,
    0,
  );
  const expectedOverallRoas =
    optimizedBudget > 0 ? expectedTotalRevenue / optimizedBudget : 0;

  // Platform-level allocations
  const platformMap = new Map<string, number>();
  for (const allocation of allocations) {
    const current = platformMap.get(allocation.platform) || 0;
    platformMap.set(allocation.platform, current + allocation.recommendedSpend);
  }

  const platformAllocations = Array.from(platformMap.entries())
    .map(([platform, budget]) => ({
      platform,
      budget,
      percentage: optimizedBudget > 0 ? (budget / optimizedBudget) * 100 : 0,
    }))
    .sort((a, b) => b.budget - a.budget);

  // Calculate optimization score (0-100)
  const currentTotalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
  const currentTotalRevenue = campaigns.reduce((sum, c) => sum + c.revenue, 0);
  const currentRoas =
    currentTotalSpend > 0 ? currentTotalRevenue / currentTotalSpend : 0;

  const roasImprovement =
    currentRoas > 0 ? (expectedOverallRoas - currentRoas) / currentRoas : 0;
  const optimizationScore = Math.min(
    100,
    Math.max(0, 50 + roasImprovement * 100),
  );

  // Generate insights
  const insights = generateInsights(
    campaigns,
    allocations,
    expectedOverallRoas,
    targetRoas,
  );

  return {
    totalBudget,
    optimizedBudget,
    allocations,
    summary: {
      platformAllocations,
      expectedTotalRevenue: Math.round(expectedTotalRevenue * 100) / 100,
      expectedOverallRoas: Math.round(expectedOverallRoas * 100) / 100,
      optimizationScore: Math.round(optimizationScore),
    },
    insights,
  };
}

/**
 * Calculate efficiency score for a campaign
 */
function calculateEfficiencyScore(
  campaign: CampaignPerformance,
  targetRoas: number,
  optimizeFor: "revenue" | "roas" | "balanced",
): number {
  // Normalize metrics
  const roasScore = Math.min(campaign.roas / targetRoas, 2);
  const volumeScore = Math.min(campaign.conversions / 10, 2); // Scale conversions
  const ctrScore = Math.min(campaign.ctr / 2, 1); // CTR normalized to 2%

  // Weight based on optimization goal
  let score: number;
  switch (optimizeFor) {
    case "revenue":
      score = roasScore * 0.3 + volumeScore * 0.5 + ctrScore * 0.2;
      break;
    case "roas":
      score = roasScore * 0.6 + volumeScore * 0.2 + ctrScore * 0.2;
      break;
    case "balanced":
    default:
      score = roasScore * 0.4 + volumeScore * 0.35 + ctrScore * 0.25;
  }

  return score;
}

/**
 * Estimate marginal return for additional spend
 * Uses diminishing returns model
 */
function estimateMarginalReturn(campaign: CampaignPerformance): number {
  if (campaign.spend === 0) return 1;

  // Simple diminishing returns model
  // As spend increases, marginal return decreases
  const baseReturn = campaign.roas;
  const spendLevel = Math.log10(campaign.spend + 1);
  const diminishingFactor = 1 / (1 + spendLevel * 0.1);

  return baseReturn * diminishingFactor;
}

/**
 * Allocate budget across campaigns
 */
function allocateBudget(
  campaigns: Array<
    CampaignPerformance & { efficiencyScore: number; marginalReturn: number }
  >,
  totalBudget: number,
  minBudget: number,
  maxBudgetPercent: number,
  targetRoas: number,
): BudgetAllocation[] {
  const maxBudget = totalBudget * maxBudgetPercent;
  const allocations: BudgetAllocation[] = [];

  // Calculate total efficiency score for weighting
  const totalScore = campaigns.reduce((sum, c) => sum + c.efficiencyScore, 0);

  let remainingBudget = totalBudget;

  for (const campaign of campaigns) {
    // Calculate weighted allocation
    const weight =
      totalScore > 0
        ? campaign.efficiencyScore / totalScore
        : 1 / campaigns.length;
    let recommendedSpend = totalBudget * weight;

    // Apply constraints
    recommendedSpend = Math.max(
      minBudget,
      Math.min(maxBudget, recommendedSpend),
    );

    // Check if campaign should be paused (very low efficiency)
    let priority: BudgetAllocation["priority"];
    let reason: string;

    if (campaign.roas < targetRoas * 0.25) {
      recommendedSpend = 0;
      priority = "pause";
      reason = `ROAS (${campaign.roas.toFixed(2)}x) is significantly below target (${targetRoas}x)`;
    } else if (campaign.roas < targetRoas * 0.5) {
      recommendedSpend = Math.min(recommendedSpend, campaign.spend * 0.5);
      priority = "decrease";
      reason = `ROAS underperforming - reduce spend to improve efficiency`;
    } else if (campaign.roas >= targetRoas * 1.5) {
      recommendedSpend = Math.min(maxBudget, recommendedSpend * 1.3);
      priority = "increase";
      reason = `High-performing campaign - scale to capture more revenue`;
    } else {
      priority = "maintain";
      reason = `Performance within target range`;
    }

    // Ensure we don't exceed remaining budget
    recommendedSpend = Math.min(recommendedSpend, remainingBudget);
    remainingBudget -= recommendedSpend;

    const spendChange = recommendedSpend - campaign.spend;
    const spendChangePercent =
      campaign.spend > 0 ? (spendChange / campaign.spend) * 100 : 100;

    // Estimate expected performance
    const expectedRoas =
      campaign.roas *
      (1 - (Math.abs(spendChange) / (campaign.spend + 1)) * 0.1);
    const expectedRevenue = recommendedSpend * expectedRoas;

    // Calculate confidence based on data quality
    const confidence = calculateConfidence(campaign);

    allocations.push({
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      platform: campaign.platform,
      currentSpend: campaign.spend,
      recommendedSpend: Math.round(recommendedSpend * 100) / 100,
      spendChange: Math.round(spendChange * 100) / 100,
      spendChangePercent: Math.round(spendChangePercent * 10) / 10,
      expectedRoas: Math.round(expectedRoas * 100) / 100,
      expectedRevenue: Math.round(expectedRevenue * 100) / 100,
      priority,
      reason,
      confidence,
    });
  }

  return allocations;
}

/**
 * Calculate confidence in recommendation based on data quality
 */
function calculateConfidence(campaign: CampaignPerformance): number {
  // More conversions = higher confidence
  const conversionConfidence = Math.min(1, campaign.conversions / 30);

  // More clicks = higher confidence
  const clickConfidence = Math.min(1, campaign.clicks / 100);

  // Consistent performance (not too volatile)
  const consistencyConfidence =
    campaign.roas > 0.5 && campaign.roas < 20 ? 1 : 0.5;

  const confidence =
    conversionConfidence * 0.5 +
    clickConfidence * 0.3 +
    consistencyConfidence * 0.2;

  return Math.round(confidence * 100) / 100;
}

/**
 * Generate actionable insights
 */
function generateInsights(
  campaigns: CampaignPerformance[],
  allocations: BudgetAllocation[],
  expectedRoas: number,
  targetRoas: number,
): string[] {
  const insights: string[] = [];

  // Overall performance insight
  if (expectedRoas >= targetRoas) {
    insights.push(
      `Optimized allocation is expected to achieve ${expectedRoas.toFixed(2)}x ROAS, meeting your ${targetRoas}x target.`,
    );
  } else {
    insights.push(
      `Expected ROAS of ${expectedRoas.toFixed(2)}x is below target. Consider reducing overall spend or improving underperforming campaigns.`,
    );
  }

  // Platform distribution insights
  const platformCounts = new Map<string, number>();
  for (const a of allocations) {
    platformCounts.set(a.platform, (platformCounts.get(a.platform) || 0) + 1);
  }

  const topPlatform = Array.from(platformCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (topPlatform) {
    insights.push(
      `${topPlatform[0]} has the most campaigns (${topPlatform[1]}). Consider consolidating if performance varies.`,
    );
  }

  // Top performers
  const increaseCount = allocations.filter(
    (a) => a.priority === "increase",
  ).length;
  if (increaseCount > 0) {
    insights.push(
      `${increaseCount} campaign${increaseCount > 1 ? "s" : ""} recommended for budget increase due to strong performance.`,
    );
  }

  // Underperformers
  const pauseCount = allocations.filter((a) => a.priority === "pause").length;
  if (pauseCount > 0) {
    insights.push(
      `${pauseCount} campaign${pauseCount > 1 ? "s" : ""} recommended for pause due to low ROAS. Review targeting and creative.`,
    );
  }

  // Low confidence recommendations
  const lowConfidence = allocations.filter((a) => a.confidence < 0.5);
  if (lowConfidence.length > 0) {
    insights.push(
      `${lowConfidence.length} recommendation${lowConfidence.length > 1 ? "s have" : " has"} low confidence due to limited data. Consider running longer before making changes.`,
    );
  }

  return insights;
}

/**
 * Calculate recommended bid adjustments
 */
export interface BidRecommendation {
  campaignId: string;
  campaignName: string;
  platform: string;
  currentCpc?: number;
  recommendedCpcChange: number;
  recommendedCpcChangePercent: number;
  targetAudiences: {
    audience: string;
    adjustment: number;
    reason: string;
  }[];
  daypartingRecommendations?: {
    dayOfWeek: string;
    hourRange: string;
    adjustment: number;
  }[];
  confidence: number;
}

export function recommendBidAdjustments(
  campaigns: CampaignPerformance[],
  targetRoas: number = 3,
): BidRecommendation[] {
  return campaigns.map((campaign) => {
    // Calculate ideal CPC based on target ROAS
    const avgOrderValue =
      campaign.conversions > 0 ? campaign.revenue / campaign.conversions : 0;
    const targetCpa = avgOrderValue / targetRoas;
    const currentCpc =
      campaign.clicks > 0 ? campaign.spend / campaign.clicks : 0;
    const idealCpc =
      campaign.conversionRate > 0
        ? targetCpa * campaign.conversionRate
        : currentCpc;

    const cpcChange = idealCpc - currentCpc;
    const cpcChangePercent =
      currentCpc > 0 ? (cpcChange / currentCpc) * 100 : 0;

    // Generate audience recommendations (mock - would need actual audience data)
    const targetAudiences = generateAudienceRecommendations(campaign);

    return {
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      platform: campaign.platform,
      currentCpc: Math.round(currentCpc * 100) / 100,
      recommendedCpcChange: Math.round(cpcChange * 100) / 100,
      recommendedCpcChangePercent: Math.round(cpcChangePercent * 10) / 10,
      targetAudiences,
      confidence: calculateConfidence(campaign),
    };
  });
}

/**
 * Generate audience-level bid recommendations
 */
function generateAudienceRecommendations(
  campaign: CampaignPerformance,
): BidRecommendation["targetAudiences"] {
  const recommendations: BidRecommendation["targetAudiences"] = [];

  // High-value audiences (example recommendations)
  if (campaign.roas > 3) {
    recommendations.push({
      audience: "Past Purchasers",
      adjustment: 20,
      reason: "High conversion probability from existing customers",
    });
    recommendations.push({
      audience: "High-Intent Keywords",
      adjustment: 15,
      reason: "Strong ROAS indicates quality traffic",
    });
  }

  if (campaign.roas < 1) {
    recommendations.push({
      audience: "Broad Targeting",
      adjustment: -30,
      reason: "Reduce exposure to low-converting audiences",
    });
    recommendations.push({
      audience: "Cold Audiences",
      adjustment: -20,
      reason: "Focus budget on warmer audiences first",
    });
  }

  if (campaign.conversionRate > 0.05) {
    recommendations.push({
      audience: "Lookalike Audiences",
      adjustment: 25,
      reason: "High conversion rate suggests strong audience fit",
    });
  }

  return recommendations;
}
