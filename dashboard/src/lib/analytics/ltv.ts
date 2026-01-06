/**
 * LTV (Lifetime Value) Predictions
 *
 * Predict customer lifetime value using:
 * - Historical purchase behavior
 * - RFM (Recency, Frequency, Monetary) analysis
 * - BG/NBD probability model (simplified)
 * - Gamma-Gamma spend model (simplified)
 */

export interface CustomerData {
  customerId: string;
  firstOrderDate: Date;
  lastOrderDate: Date;
  orderCount: number;
  totalRevenue: number;
  avgOrderValue: number;
  source?: string;
}

export interface LTVPrediction {
  customerId: string;
  historicalValue: number;
  predictedValue: number;
  totalLTV: number;
  confidenceScore: number;
  segment: "high" | "medium" | "low";
  expectedOrders: number;
  churnProbability: number;
  rfmScore: RFMScore;
}

export interface RFMScore {
  recency: number; // 1-5, 5 is most recent
  frequency: number; // 1-5, 5 is most frequent
  monetary: number; // 1-5, 5 is highest spend
  combined: number; // Combined RFM score
  segment: string; // Customer segment label
}

export interface LTVOptions {
  predictionMonths: number; // How far to predict (default 12)
  discountRate: number; // Annual discount rate for NPV (default 0.10)
  avgLifespanMonths: number; // Average customer lifespan in months (default 36)
}

/**
 * Calculate LTV predictions for customers
 */
export function predictLTV(
  customers: CustomerData[],
  options: LTVOptions = {
    predictionMonths: 12,
    discountRate: 0.1,
    avgLifespanMonths: 36,
  },
): LTVPrediction[] {
  if (customers.length === 0) return [];

  // Calculate global stats for normalization
  const stats = calculateGlobalStats(customers);

  return customers.map((customer) => {
    const rfmScore = calculateRFMScore(customer, stats);
    const churnProbability = estimateChurnProbability(customer, stats);
    const expectedOrders = estimateFutureOrders(
      customer,
      options.predictionMonths,
      stats,
    );
    const predictedValue = estimateFutureValue(
      customer,
      expectedOrders,
      churnProbability,
      options,
    );

    const totalLTV = customer.totalRevenue + predictedValue;
    const confidenceScore = calculateConfidence(customer, stats);
    const segment = determineSegment(totalLTV, stats);

    return {
      customerId: customer.customerId,
      historicalValue: customer.totalRevenue,
      predictedValue,
      totalLTV,
      confidenceScore,
      segment,
      expectedOrders,
      churnProbability,
      rfmScore,
    };
  });
}

/**
 * Calculate global statistics for normalization
 */
function calculateGlobalStats(customers: CustomerData[]) {
  const now = new Date();

  // Recency (days since last order)
  const recencies = customers.map((c) =>
    Math.floor(
      (now.getTime() - c.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );

  // Frequency
  const frequencies = customers.map((c) => c.orderCount);

  // Monetary
  const monetaries = customers.map((c) => c.totalRevenue);

  // Customer age (days since first order)
  const ages = customers.map((c) =>
    Math.floor(
      (now.getTime() - c.firstOrderDate.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );

  return {
    recency: {
      min: Math.min(...recencies),
      max: Math.max(...recencies),
      avg: recencies.reduce((a, b) => a + b, 0) / recencies.length,
      quintiles: calculateQuintiles(recencies),
    },
    frequency: {
      min: Math.min(...frequencies),
      max: Math.max(...frequencies),
      avg: frequencies.reduce((a, b) => a + b, 0) / frequencies.length,
      quintiles: calculateQuintiles(frequencies),
    },
    monetary: {
      min: Math.min(...monetaries),
      max: Math.max(...monetaries),
      avg: monetaries.reduce((a, b) => a + b, 0) / monetaries.length,
      quintiles: calculateQuintiles(monetaries),
    },
    age: {
      min: Math.min(...ages),
      max: Math.max(...ages),
      avg: ages.reduce((a, b) => a + b, 0) / ages.length,
    },
    ltvQuintiles: calculateQuintiles(monetaries),
  };
}

/**
 * Calculate quintiles for scoring
 */
function calculateQuintiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const quintiles: number[] = [];

  for (let i = 1; i <= 4; i++) {
    const idx = Math.floor((sorted.length * i) / 5);
    quintiles.push(sorted[idx]);
  }

  return quintiles;
}

/**
 * Calculate RFM score for a customer
 */
function calculateRFMScore(
  customer: CustomerData,
  stats: ReturnType<typeof calculateGlobalStats>,
): RFMScore {
  const now = new Date();

  const recencyDays = Math.floor(
    (now.getTime() - customer.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Score recency (lower is better, so reverse)
  const recencyScore =
    5 -
    scoreValue(
      recencyDays,
      stats.recency.quintiles,
      true, // Reverse - lower recency = higher score
    );

  // Score frequency (higher is better)
  const frequencyScore = scoreValue(
    customer.orderCount,
    stats.frequency.quintiles,
    false,
  );

  // Score monetary (higher is better)
  const monetaryScore = scoreValue(
    customer.totalRevenue,
    stats.monetary.quintiles,
    false,
  );

  const combined = recencyScore * 100 + frequencyScore * 10 + monetaryScore;

  return {
    recency: recencyScore,
    frequency: frequencyScore,
    monetary: monetaryScore,
    combined,
    segment: getRFMSegment(recencyScore, frequencyScore, monetaryScore),
  };
}

/**
 * Score a value based on quintiles
 */
function scoreValue(
  value: number,
  quintiles: number[],
  reverse = false,
): number {
  let score = 1;

  for (let i = 0; i < quintiles.length; i++) {
    if (value >= quintiles[i]) {
      score = i + 2;
    }
  }

  return reverse ? 6 - score : score;
}

/**
 * Get RFM segment label
 */
function getRFMSegment(r: number, f: number, m: number): string {
  // Champions: High in all dimensions
  if (r >= 4 && f >= 4 && m >= 4) return "Champions";

  // Loyal Customers: High frequency and monetary
  if (f >= 4 && m >= 4) return "Loyal Customers";

  // Potential Loyalists: Recent with medium frequency
  if (r >= 4 && f >= 2 && f <= 4) return "Potential Loyalists";

  // New Customers: Very recent, low frequency
  if (r >= 4 && f <= 2) return "New Customers";

  // At Risk: Previously engaged, now absent
  if (r <= 2 && f >= 3) return "At Risk";

  // About to Sleep: Low recency and frequency
  if (r <= 2 && f <= 2) return "About to Sleep";

  // Hibernating: Very low scores
  if (r <= 2 && f <= 2 && m <= 2) return "Hibernating";

  // Need Attention: Medium scores
  return "Need Attention";
}

/**
 * Estimate churn probability (simplified model)
 */
function estimateChurnProbability(
  customer: CustomerData,
  stats: ReturnType<typeof calculateGlobalStats>,
): number {
  const now = new Date();

  const daysSinceLastOrder = Math.floor(
    (now.getTime() - customer.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  const customerAgeDays = Math.floor(
    (now.getTime() - customer.firstOrderDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Average days between orders
  const avgDaysBetweenOrders =
    customer.orderCount > 1
      ? customerAgeDays / (customer.orderCount - 1)
      : customerAgeDays;

  // Ratio of days since last order to avg interval
  const intervalRatio = daysSinceLastOrder / Math.max(avgDaysBetweenOrders, 1);

  // Higher ratio = higher churn probability
  // Using a sigmoid-like function
  const churnProb = 1 / (1 + Math.exp(-0.5 * (intervalRatio - 2)));

  // Adjust for frequency - frequent buyers have lower churn
  const frequencyFactor = 1 / (1 + 0.1 * customer.orderCount);

  return Math.min(
    0.99,
    Math.max(0.01, churnProb * (1 - frequencyFactor * 0.3)),
  );
}

/**
 * Estimate future orders (simplified BG/NBD model)
 */
function estimateFutureOrders(
  customer: CustomerData,
  monthsAhead: number,
  stats: ReturnType<typeof calculateGlobalStats>,
): number {
  const now = new Date();

  const customerAgeDays = Math.floor(
    (now.getTime() - customer.firstOrderDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Purchase rate (orders per day)
  const purchaseRate = customer.orderCount / Math.max(customerAgeDays, 1);

  // Expected orders = rate * future days * survival probability
  const futureDays = monthsAhead * 30;
  const churnProb = estimateChurnProbability(customer, stats);

  // Simple decay model for survival
  const survivalFactor = Math.pow(1 - churnProb, monthsAhead / 12);

  const expectedOrders = purchaseRate * futureDays * survivalFactor;

  return Math.max(0, Math.round(expectedOrders * 100) / 100);
}

/**
 * Estimate future monetary value
 */
function estimateFutureValue(
  customer: CustomerData,
  expectedOrders: number,
  churnProbability: number,
  options: LTVOptions,
): number {
  // Expected value = expected orders * avg order value * (1 - churn)
  const expectedRevenue =
    expectedOrders * customer.avgOrderValue * (1 - churnProbability);

  // Apply discount rate for NPV
  const monthlyDiscountRate = options.discountRate / 12;
  const discountFactor =
    1 / (1 + monthlyDiscountRate * options.predictionMonths);

  return Math.max(0, Math.round(expectedRevenue * discountFactor * 100) / 100);
}

/**
 * Calculate confidence score for prediction
 */
function calculateConfidence(
  customer: CustomerData,
  stats: ReturnType<typeof calculateGlobalStats>,
): number {
  // More orders = higher confidence
  const orderConfidence = Math.min(1, customer.orderCount / 10);

  // Longer relationship = higher confidence
  const now = new Date();
  const ageDays = Math.floor(
    (now.getTime() - customer.firstOrderDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const ageConfidence = Math.min(1, ageDays / 365);

  // Recent activity = higher confidence
  const daysSinceOrder = Math.floor(
    (now.getTime() - customer.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const recencyConfidence = Math.max(0, 1 - daysSinceOrder / 180);

  // Weighted average
  const confidence =
    orderConfidence * 0.4 + ageConfidence * 0.3 + recencyConfidence * 0.3;

  return Math.round(confidence * 100) / 100;
}

/**
 * Determine LTV segment
 */
function determineSegment(
  ltv: number,
  stats: ReturnType<typeof calculateGlobalStats>,
): "high" | "medium" | "low" {
  const [q1, q2, q3, q4] = stats.ltvQuintiles;

  if (ltv >= q4) return "high";
  if (ltv >= q2) return "medium";
  return "low";
}

/**
 * Aggregate LTV by acquisition source
 */
export function getLTVBySource(
  predictions: LTVPrediction[],
  customers: CustomerData[],
): {
  source: string;
  customerCount: number;
  avgLTV: number;
  totalLTV: number;
  avgPredictedValue: number;
}[] {
  // Create customer map for source lookup
  const customerMap = new Map(customers.map((c) => [c.customerId, c]));

  // Group by source
  const bySource = new Map<
    string,
    { predictions: LTVPrediction[]; source: string }
  >();

  for (const pred of predictions) {
    const customer = customerMap.get(pred.customerId);
    const source = customer?.source || "direct";

    if (!bySource.has(source)) {
      bySource.set(source, { predictions: [], source });
    }
    bySource.get(source)!.predictions.push(pred);
  }

  // Calculate aggregates
  return Array.from(bySource.values()).map(({ source, predictions }) => ({
    source,
    customerCount: predictions.length,
    avgLTV:
      predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.totalLTV, 0) /
          predictions.length
        : 0,
    totalLTV: predictions.reduce((sum, p) => sum + p.totalLTV, 0),
    avgPredictedValue:
      predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.predictedValue, 0) /
          predictions.length
        : 0,
  }));
}

/**
 * Get customer segments distribution
 */
export function getSegmentDistribution(predictions: LTVPrediction[]): {
  segment: string;
  count: number;
  percentage: number;
  avgLTV: number;
}[] {
  const segments = new Map<string, LTVPrediction[]>();

  for (const pred of predictions) {
    const segment = pred.rfmScore.segment;
    if (!segments.has(segment)) {
      segments.set(segment, []);
    }
    segments.get(segment)!.push(pred);
  }

  const total = predictions.length;

  return Array.from(segments.entries())
    .map(([segment, preds]) => ({
      segment,
      count: preds.length,
      percentage: total > 0 ? (preds.length / total) * 100 : 0,
      avgLTV:
        preds.length > 0
          ? preds.reduce((sum, p) => sum + p.totalLTV, 0) / preds.length
          : 0,
    }))
    .sort((a, b) => b.avgLTV - a.avgLTV);
}
