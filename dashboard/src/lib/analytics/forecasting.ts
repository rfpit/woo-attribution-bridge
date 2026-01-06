/**
 * Revenue Forecasting
 *
 * Forecast future revenue using:
 * - Time series analysis (moving averages, trend)
 * - Seasonal decomposition
 * - Growth modeling
 */

export interface TimeSeriesPoint {
  date: Date;
  value: number;
}

export interface ForecastResult {
  date: Date;
  predicted: number;
  lowerBound: number;
  upperBound: number;
  trend: number;
  seasonal: number;
}

export interface ForecastSummary {
  historicalAvg: number;
  forecastedTotal: number;
  growth: number;
  growthPercentage: number;
  trend: "up" | "down" | "flat";
  seasonalityStrength: number;
  confidenceInterval: number;
}

export interface ForecastOptions {
  periods: number; // Number of periods to forecast
  periodType: "day" | "week" | "month";
  confidenceLevel: number; // 0.80, 0.90, 0.95
  seasonalPeriod?: number; // Auto-detect if not specified
}

/**
 * Generate revenue forecast
 */
export function forecastRevenue(
  historicalData: TimeSeriesPoint[],
  options: ForecastOptions = {
    periods: 12,
    periodType: "month",
    confidenceLevel: 0.9,
  },
): { forecast: ForecastResult[]; summary: ForecastSummary } {
  if (historicalData.length < 3) {
    return {
      forecast: [],
      summary: {
        historicalAvg: 0,
        forecastedTotal: 0,
        growth: 0,
        growthPercentage: 0,
        trend: "flat",
        seasonalityStrength: 0,
        confidenceInterval: 0,
      },
    };
  }

  // Sort data by date
  const sorted = [...historicalData].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  // Detect seasonality period if not specified
  const seasonalPeriod =
    options.seasonalPeriod || detectSeasonalPeriod(sorted, options.periodType);

  // Decompose time series
  const decomposition = decomposeTimeSeries(sorted, seasonalPeriod);

  // Calculate trend using linear regression
  const trendParams = calculateTrend(decomposition.trend);

  // Calculate forecast
  const forecast: ForecastResult[] = [];
  const lastDate = sorted[sorted.length - 1].date;
  const lastTrendValue = decomposition.trend[decomposition.trend.length - 1];

  // Calculate standard deviation of residuals for confidence interval
  const residuals = decomposition.residual.filter((r) => !isNaN(r));
  const stdDev = calculateStdDev(residuals);
  const zScore = getZScore(options.confidenceLevel);

  for (let i = 1; i <= options.periods; i++) {
    const forecastDate = addPeriods(lastDate, i, options.periodType);

    // Project trend
    const trendValue =
      lastTrendValue + trendParams.slope * i * trendParams.growthFactor;

    // Apply seasonality
    const seasonalIndex = (sorted.length + i - 1) % seasonalPeriod;
    const seasonalFactor =
      seasonalPeriod > 0 && decomposition.seasonal.length > seasonalIndex
        ? decomposition.seasonal[seasonalIndex]
        : 0;

    const predicted = Math.max(0, trendValue + seasonalFactor);
    const margin = zScore * stdDev * Math.sqrt(1 + i / sorted.length);

    forecast.push({
      date: forecastDate,
      predicted: Math.round(predicted * 100) / 100,
      lowerBound: Math.max(0, Math.round((predicted - margin) * 100) / 100),
      upperBound: Math.round((predicted + margin) * 100) / 100,
      trend: Math.round(trendValue * 100) / 100,
      seasonal: Math.round(seasonalFactor * 100) / 100,
    });
  }

  // Calculate summary
  const historicalAvg =
    sorted.reduce((sum, p) => sum + p.value, 0) / sorted.length;
  const forecastedTotal = forecast.reduce((sum, f) => sum + f.predicted, 0);
  const forecastAvg =
    forecast.length > 0 ? forecastedTotal / forecast.length : 0;
  const growth = forecastAvg - historicalAvg;
  const growthPercentage =
    historicalAvg > 0
      ? ((forecastAvg - historicalAvg) / historicalAvg) * 100
      : 0;

  const summary: ForecastSummary = {
    historicalAvg: Math.round(historicalAvg * 100) / 100,
    forecastedTotal: Math.round(forecastedTotal * 100) / 100,
    growth: Math.round(growth * 100) / 100,
    growthPercentage: Math.round(growthPercentage * 10) / 10,
    trend:
      trendParams.slope > 0.01
        ? "up"
        : trendParams.slope < -0.01
          ? "down"
          : "flat",
    seasonalityStrength: calculateSeasonalityStrength(decomposition.seasonal),
    confidenceInterval: Math.round(zScore * stdDev * 100) / 100,
  };

  return { forecast, summary };
}

/**
 * Detect seasonal period from data
 */
function detectSeasonalPeriod(
  data: TimeSeriesPoint[],
  periodType: "day" | "week" | "month",
): number {
  // Default seasonal periods
  const defaults: Record<string, number> = {
    day: 7, // Weekly seasonality
    week: 52, // Yearly seasonality
    month: 12, // Yearly seasonality
  };

  // Use autocorrelation to detect seasonality if enough data
  if (data.length >= 24) {
    const values = data.map((d) => d.value);
    const possiblePeriods =
      periodType === "day"
        ? [7, 30, 365]
        : periodType === "week"
          ? [4, 13, 52]
          : [3, 6, 12];

    let bestPeriod = defaults[periodType];
    let bestCorrelation = 0;

    for (const period of possiblePeriods) {
      if (data.length >= period * 2) {
        const correlation = calculateAutocorrelation(values, period);
        if (correlation > bestCorrelation && correlation > 0.3) {
          bestCorrelation = correlation;
          bestPeriod = period;
        }
      }
    }

    return bestPeriod;
  }

  return defaults[periodType];
}

/**
 * Calculate autocorrelation at given lag
 */
function calculateAutocorrelation(values: number[], lag: number): number {
  if (values.length <= lag) return 0;

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    if (i < n - lag) {
      numerator += (values[i] - mean) * (values[i + lag] - mean);
    }
    denominator += Math.pow(values[i] - mean, 2);
  }

  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Decompose time series into trend, seasonal, and residual
 */
function decomposeTimeSeries(
  data: TimeSeriesPoint[],
  seasonalPeriod: number,
): { trend: number[]; seasonal: number[]; residual: number[] } {
  const values = data.map((d) => d.value);
  const n = values.length;

  // Calculate trend using centered moving average
  const windowSize = Math.min(seasonalPeriod, Math.floor(n / 2));
  const trend: number[] = [];

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(n, i + Math.ceil(windowSize / 2));
    const window = values.slice(start, end);
    trend.push(window.reduce((a, b) => a + b, 0) / window.length);
  }

  // Calculate seasonal component
  const detrended = values.map((v, i) => v - trend[i]);
  const seasonal: number[] = new Array(seasonalPeriod).fill(0);
  const counts: number[] = new Array(seasonalPeriod).fill(0);

  for (let i = 0; i < n; i++) {
    const seasonIndex = i % seasonalPeriod;
    seasonal[seasonIndex] += detrended[i];
    counts[seasonIndex]++;
  }

  // Normalize seasonal component
  for (let i = 0; i < seasonalPeriod; i++) {
    if (counts[i] > 0) {
      seasonal[i] /= counts[i];
    }
  }

  // Center seasonal component
  const seasonalMean = seasonal.reduce((a, b) => a + b, 0) / seasonalPeriod;
  for (let i = 0; i < seasonalPeriod; i++) {
    seasonal[i] -= seasonalMean;
  }

  // Calculate residual
  const residual = values.map((v, i) => {
    const seasonIndex = i % seasonalPeriod;
    return v - trend[i] - seasonal[seasonIndex];
  });

  return { trend, seasonal, residual };
}

/**
 * Calculate linear trend parameters
 */
function calculateTrend(trend: number[]): {
  slope: number;
  growthFactor: number;
} {
  const n = trend.length;
  if (n < 2) return { slope: 0, growthFactor: 1 };

  // Linear regression
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += trend[i];
    sumXY += i * trend[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Calculate growth factor (for dampening far forecasts)
  const recentSlope =
    n > 6 ? (trend[n - 1] - trend[n - 6]) / 5 : trend[n - 1] - trend[0];
  const overallSlope = (trend[n - 1] - trend[0]) / (n - 1);

  // Dampen if recent slope differs significantly from overall
  const growthFactor =
    Math.abs(overallSlope) > 0
      ? Math.min(1.5, Math.max(0.5, recentSlope / overallSlope))
      : 1;

  return { slope, growthFactor };
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Get z-score for confidence level
 */
function getZScore(confidenceLevel: number): number {
  const zScores: Record<string, number> = {
    "0.80": 1.28,
    "0.85": 1.44,
    "0.90": 1.645,
    "0.95": 1.96,
    "0.99": 2.576,
  };

  return zScores[confidenceLevel.toFixed(2)] || 1.645;
}

/**
 * Add periods to date
 */
function addPeriods(
  date: Date,
  periods: number,
  periodType: "day" | "week" | "month",
): Date {
  const result = new Date(date);

  switch (periodType) {
    case "day":
      result.setDate(result.getDate() + periods);
      break;
    case "week":
      result.setDate(result.getDate() + periods * 7);
      break;
    case "month":
      result.setMonth(result.getMonth() + periods);
      break;
  }

  return result;
}

/**
 * Calculate seasonality strength (0-1)
 */
function calculateSeasonalityStrength(seasonal: number[]): number {
  if (seasonal.length === 0) return 0;

  const range = Math.max(...seasonal) - Math.min(...seasonal);
  const mean =
    Math.abs(seasonal.reduce((a, b) => a + Math.abs(b), 0)) / seasonal.length;

  if (mean === 0) return 0;

  // Normalize to 0-1
  return Math.min(1, range / (mean * 4));
}

/**
 * Compare actual vs forecasted for model evaluation
 */
export function evaluateForecast(
  forecast: ForecastResult[],
  actual: TimeSeriesPoint[],
): {
  mape: number; // Mean Absolute Percentage Error
  rmse: number; // Root Mean Square Error
  mae: number; // Mean Absolute Error
  accuracy: number; // 1 - MAPE (as percentage)
} {
  // Match forecast to actual by date
  const pairs: { predicted: number; actual: number }[] = [];

  for (const f of forecast) {
    const match = actual.find(
      (a) =>
        a.date.getFullYear() === f.date.getFullYear() &&
        a.date.getMonth() === f.date.getMonth() &&
        a.date.getDate() === f.date.getDate(),
    );

    if (match && match.value > 0) {
      pairs.push({ predicted: f.predicted, actual: match.value });
    }
  }

  if (pairs.length === 0) {
    return { mape: 0, rmse: 0, mae: 0, accuracy: 100 };
  }

  // Calculate metrics
  let sumAPE = 0;
  let sumSE = 0;
  let sumAE = 0;

  for (const { predicted, actual } of pairs) {
    sumAPE += Math.abs((actual - predicted) / actual);
    sumSE += Math.pow(actual - predicted, 2);
    sumAE += Math.abs(actual - predicted);
  }

  const mape = (sumAPE / pairs.length) * 100;
  const rmse = Math.sqrt(sumSE / pairs.length);
  const mae = sumAE / pairs.length;
  const accuracy = Math.max(0, 100 - mape);

  return {
    mape: Math.round(mape * 10) / 10,
    rmse: Math.round(rmse * 100) / 100,
    mae: Math.round(mae * 100) / 100,
    accuracy: Math.round(accuracy * 10) / 10,
  };
}

/**
 * Forecast ad spend recommendations based on ROAS targets
 */
export function recommendAdSpend(params: {
  historicalRevenue: TimeSeriesPoint[];
  historicalSpend: TimeSeriesPoint[];
  targetROAS: number;
  forecastPeriods: number;
}): {
  recommendedSpend: number;
  expectedRevenue: number;
  expectedROAS: number;
  confidence: number;
} {
  const { historicalRevenue, historicalSpend, targetROAS, forecastPeriods } =
    params;

  // Calculate historical ROAS
  const totalRevenue = historicalRevenue.reduce((sum, p) => sum + p.value, 0);
  const totalSpend = historicalSpend.reduce((sum, p) => sum + p.value, 0);
  const historicalROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Forecast revenue
  const { forecast, summary } = forecastRevenue(historicalRevenue, {
    periods: forecastPeriods,
    periodType: "month",
    confidenceLevel: 0.9,
  });

  const expectedRevenue = forecast.reduce((sum, f) => sum + f.predicted, 0);

  // Calculate recommended spend to achieve target ROAS
  const recommendedSpend =
    targetROAS > 0 ? expectedRevenue / targetROAS : totalSpend;

  // Adjust based on historical efficiency
  const efficiencyFactor =
    historicalROAS > 0 ? Math.min(1.5, targetROAS / historicalROAS) : 1;
  const adjustedSpend = recommendedSpend * efficiencyFactor;

  // Calculate expected ROAS with recommended spend
  const expectedROAS =
    adjustedSpend > 0 ? expectedRevenue / adjustedSpend : targetROAS;

  // Confidence based on forecast quality and historical consistency
  const confidence = Math.min(
    0.95,
    (1 - summary.confidenceInterval / summary.historicalAvg) * 0.7 +
      (historicalROAS > 0 ? 0.3 : 0),
  );

  return {
    recommendedSpend: Math.round(adjustedSpend * 100) / 100,
    expectedRevenue: Math.round(expectedRevenue * 100) / 100,
    expectedROAS: Math.round(expectedROAS * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  };
}
