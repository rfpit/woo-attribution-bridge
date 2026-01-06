/**
 * Anomaly Detection
 *
 * Detect unusual patterns in:
 * - Revenue (sudden drops/spikes)
 * - Orders (volume changes)
 * - Conversion rates
 * - Ad spend (cost anomalies)
 * - ROAS (efficiency changes)
 */

export interface DataPoint {
  date: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface Anomaly {
  id: string;
  date: Date;
  metric: string;
  value: number;
  expectedValue: number;
  deviation: number; // How many standard deviations from expected
  severity: "critical" | "warning" | "info";
  direction: "increase" | "decrease";
  percentageChange: number;
  description: string;
  possibleCauses: string[];
  suggestedActions: string[];
}

export interface AnomalyDetectionOptions {
  sensitivity: "low" | "medium" | "high";
  windowSize: number; // Days for rolling calculations
  minDataPoints: number; // Minimum points before detecting
  detectSpikes: boolean;
  detectDrops: boolean;
}

const SENSITIVITY_THRESHOLDS = {
  low: { critical: 4, warning: 3, info: 2.5 },
  medium: { critical: 3, warning: 2.5, info: 2 },
  high: { critical: 2.5, warning: 2, info: 1.5 },
};

/**
 * Detect anomalies in time series data
 */
export function detectAnomalies(
  data: DataPoint[],
  metric: string,
  options: AnomalyDetectionOptions = {
    sensitivity: "medium",
    windowSize: 30,
    minDataPoints: 14,
    detectSpikes: true,
    detectDrops: true,
  },
): Anomaly[] {
  if (data.length < options.minDataPoints) {
    return [];
  }

  // Sort by date
  const sorted = [...data].sort((a, b) => a.date.getTime() - b.date.getTime());

  const anomalies: Anomaly[] = [];
  const thresholds = SENSITIVITY_THRESHOLDS[options.sensitivity];

  // Calculate rolling statistics
  for (let i = options.windowSize; i < sorted.length; i++) {
    const currentPoint = sorted[i];
    const window = sorted.slice(Math.max(0, i - options.windowSize), i);

    // Calculate expected value and deviation
    const stats = calculateWindowStats(window);

    if (stats.stdDev === 0) continue;

    const zScore = (currentPoint.value - stats.mean) / stats.stdDev;
    const absZScore = Math.abs(zScore);

    // Check if anomaly based on z-score
    let severity: "critical" | "warning" | "info" | null = null;

    if (absZScore >= thresholds.critical) {
      severity = "critical";
    } else if (absZScore >= thresholds.warning) {
      severity = "warning";
    } else if (absZScore >= thresholds.info) {
      severity = "info";
    }

    if (!severity) continue;

    // Check direction filter
    const direction = zScore > 0 ? "increase" : "decrease";
    if (direction === "increase" && !options.detectSpikes) continue;
    if (direction === "decrease" && !options.detectDrops) continue;

    const percentageChange =
      stats.mean > 0
        ? ((currentPoint.value - stats.mean) / stats.mean) * 100
        : 0;

    // Generate context-aware description and suggestions
    const { description, possibleCauses, suggestedActions } =
      generateAnomalyContext(
        metric,
        direction,
        percentageChange,
        severity,
        currentPoint,
      );

    anomalies.push({
      id: `${metric}-${currentPoint.date.toISOString()}`,
      date: currentPoint.date,
      metric,
      value: currentPoint.value,
      expectedValue: Math.round(stats.mean * 100) / 100,
      deviation: Math.round(absZScore * 100) / 100,
      severity,
      direction,
      percentageChange: Math.round(percentageChange * 10) / 10,
      description,
      possibleCauses,
      suggestedActions,
    });
  }

  // Sort by severity and date
  return anomalies.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.date.getTime() - a.date.getTime();
  });
}

/**
 * Calculate rolling window statistics
 */
function calculateWindowStats(window: DataPoint[]): {
  mean: number;
  stdDev: number;
  median: number;
} {
  const values = window.map((p) => p.value);
  const n = values.length;

  if (n === 0) return { mean: 0, stdDev: 0, median: 0 };

  // Mean
  const mean = values.reduce((a, b) => a + b, 0) / n;

  // Standard deviation
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Median
  const sorted = [...values].sort((a, b) => a - b);
  const median =
    n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

  return { mean, stdDev, median };
}

/**
 * Generate context-aware anomaly description and suggestions
 */
function generateAnomalyContext(
  metric: string,
  direction: "increase" | "decrease",
  percentageChange: number,
  severity: "critical" | "warning" | "info",
  dataPoint: DataPoint,
): {
  description: string;
  possibleCauses: string[];
  suggestedActions: string[];
} {
  const changeWord = direction === "increase" ? "spike" : "drop";
  const absChange = Math.abs(percentageChange);

  const metricContexts: Record<
    string,
    {
      description: string;
      increaseCauses: string[];
      decreaseCauses: string[];
      increaseActions: string[];
      decreaseActions: string[];
    }
  > = {
    revenue: {
      description: `${severity === "critical" ? "Significant" : "Notable"} ${changeWord} in revenue (${direction === "increase" ? "+" : "-"}${absChange.toFixed(1)}%)`,
      increaseCauses: [
        "Successful promotion or sale",
        "Viral product moment",
        "Large bulk order",
        "New traffic source performing well",
        "Seasonal demand spike",
      ],
      decreaseCauses: [
        "Website or checkout issues",
        "Ad campaign problems",
        "Inventory stockout on popular items",
        "Payment processor issues",
        "Competitor activity",
        "Market/seasonal factors",
      ],
      increaseActions: [
        "Identify the source of increased traffic/sales",
        "Ensure inventory can meet demand",
        "Consider scaling successful campaigns",
        "Document what drove the increase for future reference",
      ],
      decreaseActions: [
        "Check website for errors or downtime",
        "Review ad campaign performance",
        "Verify payment processing is working",
        "Check inventory levels",
        "Review recent site changes",
        "Monitor competitor pricing",
      ],
    },
    orders: {
      description: `${severity === "critical" ? "Major" : "Notable"} ${changeWord} in order volume (${direction === "increase" ? "+" : "-"}${absChange.toFixed(1)}%)`,
      increaseCauses: [
        "Successful marketing campaign",
        "Sale or promotion",
        "Influencer mention",
        "Seasonal demand",
      ],
      decreaseCauses: [
        "Cart abandonment increase",
        "Site performance issues",
        "Checkout problems",
        "Out of stock items",
        "Pricing concerns",
      ],
      increaseActions: [
        "Prepare fulfillment for increased volume",
        "Identify traffic sources",
        "Scale successful campaigns",
      ],
      decreaseActions: [
        "Review cart abandonment rate",
        "Check site speed and performance",
        "Test checkout flow",
        "Review recent price changes",
      ],
    },
    conversion_rate: {
      description: `${severity === "critical" ? "Significant" : "Notable"} ${changeWord} in conversion rate (${direction === "increase" ? "+" : "-"}${absChange.toFixed(1)}%)`,
      increaseCauses: [
        "Improved site experience",
        "Better traffic quality",
        "Successful A/B test",
        "Strong offer or promotion",
      ],
      decreaseCauses: [
        "Lower traffic quality",
        "Site or mobile issues",
        "Pricing not competitive",
        "Poor product availability",
        "Trust signals removed",
      ],
      increaseActions: [
        "Identify what's driving the improvement",
        "Apply learnings to other areas",
        "Document successful changes",
      ],
      decreaseActions: [
        "Audit checkout funnel",
        "Check traffic source quality",
        "Review mobile experience",
        "Test site on different devices",
        "Compare pricing to competitors",
      ],
    },
    ad_spend: {
      description: `${severity === "critical" ? "Major" : "Notable"} ${changeWord} in ad spend (${direction === "increase" ? "+" : "-"}${absChange.toFixed(1)}%)`,
      increaseCauses: [
        "Budget increase applied",
        "Bid strategy changes",
        "New campaign launched",
        "CPM/CPC increases in auction",
      ],
      decreaseCauses: [
        "Budget limits hit",
        "Campaigns paused",
        "Bid strategy changes",
        "Ad disapprovals",
        "Account issues",
      ],
      increaseActions: [
        "Verify spend increase was intentional",
        "Monitor ROAS for the increased spend",
        "Set spend alerts if not already",
      ],
      decreaseActions: [
        "Check if campaigns are running",
        "Review ad account for issues",
        "Verify budget allocations",
        "Check for ad disapprovals",
      ],
    },
    roas: {
      description: `${severity === "critical" ? "Significant" : "Notable"} ${changeWord} in ROAS (${direction === "increase" ? "+" : "-"}${absChange.toFixed(1)}%)`,
      increaseCauses: [
        "Improved targeting",
        "Better creative performance",
        "Strong product-market fit",
        "Lower CPM/CPC",
        "Higher conversion rate",
      ],
      decreaseCauses: [
        "Audience fatigue",
        "Creative fatigue",
        "Increased competition",
        "Targeting issues",
        "Attribution changes",
        "iOS tracking impact",
      ],
      increaseActions: [
        "Identify best performing campaigns",
        "Consider scaling winning campaigns",
        "Document successful strategies",
      ],
      decreaseActions: [
        "Review creative performance",
        "Check audience targeting",
        "Refresh ad creative",
        "Review campaign structure",
        "Check for targeting overlap",
      ],
    },
  };

  const context = metricContexts[metric] || {
    description: `${severity === "critical" ? "Significant" : "Notable"} ${changeWord} in ${metric} (${direction === "increase" ? "+" : "-"}${absChange.toFixed(1)}%)`,
    increaseCauses: ["External factors", "System changes", "Market conditions"],
    decreaseCauses: ["External factors", "System changes", "Market conditions"],
    increaseActions: ["Investigate the cause", "Monitor for continuation"],
    decreaseActions: ["Investigate the cause", "Monitor for continuation"],
  };

  const possibleCauses =
    direction === "increase" ? context.increaseCauses : context.decreaseCauses;
  const suggestedActions =
    direction === "increase"
      ? context.increaseActions
      : context.decreaseActions;

  // Limit based on severity
  const causeLimit =
    severity === "critical" ? 5 : severity === "warning" ? 3 : 2;
  const actionLimit =
    severity === "critical" ? 4 : severity === "warning" ? 3 : 2;

  return {
    description: context.description,
    possibleCauses: possibleCauses.slice(0, causeLimit),
    suggestedActions: suggestedActions.slice(0, actionLimit),
  };
}

/**
 * Detect multiple metric anomalies and correlate them
 */
export function detectCorrelatedAnomalies(
  datasets: { metric: string; data: DataPoint[] }[],
  options?: Partial<AnomalyDetectionOptions>,
): {
  anomalies: Anomaly[];
  correlations: {
    date: Date;
    metrics: string[];
    severity: "critical" | "warning" | "info";
    description: string;
  }[];
} {
  const allAnomalies: Anomaly[] = [];

  // Detect anomalies for each metric
  for (const { metric, data } of datasets) {
    const anomalies = detectAnomalies(data, metric, {
      sensitivity: "medium",
      windowSize: 30,
      minDataPoints: 14,
      detectSpikes: true,
      detectDrops: true,
      ...options,
    });
    allAnomalies.push(...anomalies);
  }

  // Find correlated anomalies (same date, multiple metrics)
  const byDate = new Map<string, Anomaly[]>();

  for (const anomaly of allAnomalies) {
    const dateKey = anomaly.date.toISOString().split("T")[0];
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey)!.push(anomaly);
  }

  const correlations: {
    date: Date;
    metrics: string[];
    severity: "critical" | "warning" | "info";
    description: string;
  }[] = [];

  for (const [dateKey, anomalies] of byDate.entries()) {
    if (anomalies.length >= 2) {
      const metrics = anomalies.map((a) => a.metric);
      const maxSeverity = anomalies.reduce(
        (max, a) => {
          const order = { critical: 0, warning: 1, info: 2 };
          return order[a.severity] < order[max] ? a.severity : max;
        },
        "info" as "critical" | "warning" | "info",
      );

      correlations.push({
        date: new Date(dateKey),
        metrics,
        severity: maxSeverity,
        description: `Multiple anomalies detected: ${metrics.join(", ")}. These may be related.`,
      });
    }
  }

  return { anomalies: allAnomalies, correlations };
}

/**
 * Generate alert configuration based on anomaly patterns
 */
export interface AlertConfig {
  metric: string;
  threshold: number;
  direction: "above" | "below" | "both";
  severity: "critical" | "warning" | "info";
  enabled: boolean;
}

export function generateAlertConfig(
  anomalies: Anomaly[],
  metric: string,
): AlertConfig {
  const metricAnomalies = anomalies.filter((a) => a.metric === metric);

  if (metricAnomalies.length === 0) {
    return {
      metric,
      threshold: 2.5,
      direction: "both",
      severity: "warning",
      enabled: true,
    };
  }

  // Calculate average deviation of anomalies
  const avgDeviation =
    metricAnomalies.reduce((sum, a) => sum + a.deviation, 0) /
    metricAnomalies.length;

  // Determine predominant direction
  const increases = metricAnomalies.filter(
    (a) => a.direction === "increase",
  ).length;
  const decreases = metricAnomalies.filter(
    (a) => a.direction === "decrease",
  ).length;

  const direction =
    increases > decreases * 2
      ? "above"
      : decreases > increases * 2
        ? "below"
        : "both";

  // Determine severity based on historical anomalies
  const criticalCount = metricAnomalies.filter(
    (a) => a.severity === "critical",
  ).length;
  const warningCount = metricAnomalies.filter(
    (a) => a.severity === "warning",
  ).length;

  const severity =
    criticalCount > warningCount
      ? "critical"
      : warningCount > 0
        ? "warning"
        : "info";

  return {
    metric,
    threshold: Math.round(avgDeviation * 10) / 10,
    direction,
    severity,
    enabled: true,
  };
}

/**
 * Check if a new data point triggers an alert
 */
export function checkAlert(
  newValue: number,
  historicalData: DataPoint[],
  config: AlertConfig,
): Anomaly | null {
  if (!config.enabled || historicalData.length < 14) {
    return null;
  }

  const stats = calculateWindowStats(historicalData);

  if (stats.stdDev === 0) return null;

  const zScore = (newValue - stats.mean) / stats.stdDev;
  const absZScore = Math.abs(zScore);

  // Check direction
  if (config.direction === "above" && zScore < 0) return null;
  if (config.direction === "below" && zScore > 0) return null;

  // Check threshold
  if (absZScore < config.threshold) return null;

  const percentageChange =
    stats.mean > 0 ? ((newValue - stats.mean) / stats.mean) * 100 : 0;

  const direction = zScore > 0 ? "increase" : "decrease";

  const { description, possibleCauses, suggestedActions } =
    generateAnomalyContext(
      config.metric,
      direction,
      percentageChange,
      config.severity,
      { date: new Date(), value: newValue },
    );

  return {
    id: `alert-${config.metric}-${Date.now()}`,
    date: new Date(),
    metric: config.metric,
    value: newValue,
    expectedValue: Math.round(stats.mean * 100) / 100,
    deviation: Math.round(absZScore * 100) / 100,
    severity: config.severity,
    direction,
    percentageChange: Math.round(percentageChange * 10) / 10,
    description,
    possibleCauses,
    suggestedActions,
  };
}
