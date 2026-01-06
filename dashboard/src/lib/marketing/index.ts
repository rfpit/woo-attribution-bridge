/**
 * Marketing Optimization Module
 *
 * This module provides marketing platform integrations and optimization tools:
 * - Budget Optimizer: Allocate ad budget across campaigns for maximum ROAS
 * - Klaviyo: Email marketing integration with attribution tracking
 * - Postscript: SMS marketing integration with attribution tracking
 */

// Budget Optimizer
export { optimizeBudget, recommendBidAdjustments } from "./budget-optimizer";

export type {
  CampaignPerformance,
  BudgetAllocation,
  BudgetOptimizationResult,
  BudgetOptimizerOptions,
  BidRecommendation,
} from "./budget-optimizer";

// Klaviyo Email Marketing
export {
  KlaviyoClient,
  trackAttributedPurchase,
  syncSegmentsToLists,
  getEmailPerformance,
} from "./klaviyo";

export type {
  KlaviyoConfig,
  KlaviyoProfile,
  KlaviyoEvent,
  KlaviyoList,
  KlaviyoCampaign,
  KlaviyoMetrics,
} from "./klaviyo";

// Postscript SMS Marketing
export {
  PostscriptClient,
  trackAttributedPurchaseSMS,
  getSMSPerformance,
  syncSegmentsToTags,
} from "./postscript";

export type {
  PostscriptConfig,
  PostscriptSubscriber,
  PostscriptCampaign,
  PostscriptKeyword,
  PostscriptMetrics,
} from "./postscript";
