/**
 * Advanced Analytics Module
 *
 * This module provides comprehensive analytics capabilities:
 * - Cohort Analysis: Track customer retention and revenue by acquisition cohort
 * - LTV Predictions: Predict customer lifetime value using RFM scoring
 * - Revenue Forecasting: Forecast future revenue with confidence intervals
 * - Anomaly Detection: Detect unusual patterns in key metrics
 */

// Cohort Analysis
export {
  buildCohortAnalysis,
  getCohortRetentionMatrix,
  getAverageRetentionCurve,
  getCohortLTV,
} from "./cohorts";

export type {
  CohortData,
  CohortPeriod,
  CohortInput,
  CohortOptions,
} from "./cohorts";

// LTV Predictions
export { predictLTV, getLTVBySource, getSegmentDistribution } from "./ltv";

export type { CustomerData, LTVPrediction, RFMScore, LTVOptions } from "./ltv";

// Revenue Forecasting
export {
  forecastRevenue,
  evaluateForecast,
  recommendAdSpend,
} from "./forecasting";

export type {
  TimeSeriesPoint,
  ForecastResult,
  ForecastSummary,
  ForecastOptions,
} from "./forecasting";

// Anomaly Detection
export {
  detectAnomalies,
  detectCorrelatedAnomalies,
  generateAlertConfig,
  checkAlert,
} from "./anomaly";

export type {
  DataPoint,
  Anomaly,
  AnomalyDetectionOptions,
  AlertConfig,
} from "./anomaly";
