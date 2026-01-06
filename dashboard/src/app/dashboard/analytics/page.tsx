"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Users,
  TrendingUp,
  AlertTriangle,
  Activity,
  DollarSign,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils";

// Types
interface CohortData {
  cohortMonth: string;
  customersCount: number;
  initialRevenue: number;
  periods: { period: number; retentionRate: number }[];
}

interface LTVPrediction {
  customerId: string;
  totalLTV: number;
  predictedValue: number;
  churnProbability: number;
  segment: "high" | "medium" | "low";
  rfmScore: { segment: string };
}

interface ForecastResult {
  date: string;
  predicted: number;
  lowerBound: number;
  upperBound: number;
}

interface Anomaly {
  id: string;
  date: string;
  metric: string;
  value: number;
  expectedValue: number;
  severity: "critical" | "warning" | "info";
  direction: "increase" | "decrease";
  percentageChange: number;
  description: string;
  possibleCauses: string[];
}

// Fetch functions
async function fetchCohorts() {
  const response = await fetch("/api/analytics/cohorts?months=12");
  if (!response.ok) throw new Error("Failed to fetch cohorts");
  return response.json();
}

async function fetchLTV() {
  const response = await fetch("/api/analytics/ltv?limit=100");
  if (!response.ok) throw new Error("Failed to fetch LTV");
  return response.json();
}

async function fetchForecast() {
  const response = await fetch(
    "/api/analytics/forecast?periods=6&periodType=month",
  );
  if (!response.ok) throw new Error("Failed to fetch forecast");
  return response.json();
}

async function fetchAnomalies() {
  const response = await fetch("/api/analytics/anomalies?sensitivity=medium");
  if (!response.ok) throw new Error("Failed to fetch anomalies");
  return response.json();
}

// Tab Button Component
function TabButton({
  active,
  onClick,
  children,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ElementType;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

// Cohort Heatmap Component
function CohortHeatmap({ cohorts }: { cohorts: CohortData[] }) {
  if (!cohorts || cohorts.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Not enough data for cohort analysis yet.
      </p>
    );
  }

  const maxPeriods = Math.max(...cohorts.map((c) => c.periods.length));
  const periods = Array.from({ length: Math.min(maxPeriods, 7) }, (_, i) => i);

  const getColor = (rate: number) => {
    if (rate >= 40) return "bg-green-500";
    if (rate >= 30) return "bg-green-400";
    if (rate >= 20) return "bg-yellow-400";
    if (rate >= 10) return "bg-orange-400";
    return "bg-red-400";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">
              Cohort
            </th>
            <th className="text-center py-2 px-3 font-medium text-muted-foreground">
              Customers
            </th>
            {periods.map((p) => (
              <th
                key={p}
                className="text-center py-2 px-3 font-medium text-muted-foreground"
              >
                M{p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.slice(-12).map((cohort) => (
            <tr key={cohort.cohortMonth} className="border-t">
              <td className="py-2 px-3 font-medium">{cohort.cohortMonth}</td>
              <td className="py-2 px-3 text-center">{cohort.customersCount}</td>
              {periods.map((p) => {
                const period = cohort.periods[p];
                const rate = period?.retentionRate || 0;
                return (
                  <td key={p} className="py-2 px-3 text-center">
                    <span
                      className={`inline-block w-12 py-1 rounded text-white text-xs font-medium ${getColor(rate)}`}
                    >
                      {rate.toFixed(0)}%
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Segment Distribution Component
function SegmentDistribution({
  segments,
}: {
  segments: {
    segment: string;
    count: number;
    percentage: number;
    avgLTV: number;
  }[];
}) {
  const segmentColors: Record<string, string> = {
    Champions: "bg-purple-500",
    "Loyal Customers": "bg-blue-500",
    "Potential Loyalists": "bg-green-500",
    "New Customers": "bg-cyan-500",
    "At Risk": "bg-orange-500",
    "About to Sleep": "bg-yellow-500",
    Hibernating: "bg-red-500",
    "Need Attention": "bg-gray-500",
  };

  return (
    <div className="space-y-3">
      {segments.slice(0, 6).map((seg) => (
        <div key={seg.segment} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{seg.segment}</span>
            <span className="text-muted-foreground">
              {seg.count} ({seg.percentage.toFixed(1)}%)
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${segmentColors[seg.segment] || "bg-gray-400"}`}
              style={{ width: `${seg.percentage}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Avg LTV: {formatCurrency(seg.avgLTV)}
          </p>
        </div>
      ))}
    </div>
  );
}

// Forecast Chart Component
function ForecastChart({
  trendData,
}: {
  trendData: {
    date: string;
    value: number;
    type: "historical" | "forecast";
    lowerBound?: number;
    upperBound?: number;
  }[];
}) {
  if (!trendData || trendData.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Not enough historical data for forecasting.
      </p>
    );
  }

  const maxValue = Math.max(...trendData.map((d) => d.upperBound || d.value));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-primary rounded" />
          <span>Historical</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded" />
          <span>Forecast</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-200 rounded" />
          <span>Confidence</span>
        </div>
      </div>
      <div className="h-48 flex items-end gap-1">
        {trendData.slice(-18).map((point, i) => {
          const height = (point.value / maxValue) * 100;
          const date = new Date(point.date);
          const monthLabel = date.toLocaleDateString("en-US", {
            month: "short",
          });

          return (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div className="relative w-full flex justify-center">
                {point.type === "forecast" &&
                  point.upperBound &&
                  point.lowerBound && (
                    <div
                      className="absolute w-full bg-green-100 rounded-t"
                      style={{
                        height: `${((point.upperBound - point.lowerBound) / maxValue) * 100}%`,
                        bottom: `${(point.lowerBound / maxValue) * 100}%`,
                      }}
                    />
                  )}
                <div
                  className={`w-4/5 rounded-t ${
                    point.type === "historical" ? "bg-primary" : "bg-green-500"
                  }`}
                  style={{ height: `${height}%`, minHeight: "4px" }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground mt-1">
                {monthLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Anomaly List Component
function AnomalyList({ anomalies }: { anomalies: Anomaly[] }) {
  if (!anomalies || anomalies.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No anomalies detected. Your metrics are within normal ranges.
      </p>
    );
  }

  const severityColors = {
    critical: "bg-red-100 text-red-800 border-red-200",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
    info: "bg-blue-100 text-blue-800 border-blue-200",
  };

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {anomalies.slice(0, 10).map((anomaly) => (
        <div
          key={anomaly.id}
          className={`p-3 rounded-lg border ${severityColors[anomaly.severity]}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {anomaly.direction === "increase" ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              <span className="font-medium capitalize">{anomaly.metric}</span>
            </div>
            <span className="text-xs">
              {new Date(anomaly.date).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm mt-1">{anomaly.description}</p>
          {anomaly.possibleCauses.length > 0 && (
            <p className="text-xs mt-2 opacity-75">
              Possible causes: {anomaly.possibleCauses.slice(0, 2).join(", ")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// Main Analytics Page
export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "cohorts" | "ltv" | "forecast" | "anomalies"
  >("overview");

  const { data: cohortsData, isLoading: cohortsLoading } = useQuery({
    queryKey: ["analytics-cohorts"],
    queryFn: fetchCohorts,
    retry: false,
  });

  const { data: ltvData, isLoading: ltvLoading } = useQuery({
    queryKey: ["analytics-ltv"],
    queryFn: fetchLTV,
    retry: false,
  });

  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: ["analytics-forecast"],
    queryFn: fetchForecast,
    retry: false,
  });

  const { data: anomaliesData, isLoading: anomaliesLoading } = useQuery({
    queryKey: ["analytics-anomalies"],
    queryFn: fetchAnomalies,
    retry: false,
  });

  const isLoading =
    cohortsLoading || ltvLoading || forecastLoading || anomaliesLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Advanced Analytics</h1>
        <p className="text-muted-foreground">
          Cohort analysis, LTV predictions, forecasting, and anomaly detection
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 pb-2 border-b">
        <TabButton
          active={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          icon={BarChart3}
        >
          Overview
        </TabButton>
        <TabButton
          active={activeTab === "cohorts"}
          onClick={() => setActiveTab("cohorts")}
          icon={Users}
        >
          Cohorts
        </TabButton>
        <TabButton
          active={activeTab === "ltv"}
          onClick={() => setActiveTab("ltv")}
          icon={DollarSign}
        >
          LTV
        </TabButton>
        <TabButton
          active={activeTab === "forecast"}
          onClick={() => setActiveTab("forecast")}
          icon={TrendingUp}
        >
          Forecast
        </TabButton>
        <TabButton
          active={activeTab === "anomalies"}
          onClick={() => setActiveTab("anomalies")}
          icon={AlertTriangle}
        >
          Anomalies
          {anomaliesData?.summary?.critical > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {anomaliesData.summary.critical}
            </span>
          )}
        </TabButton>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="space-y-0 pb-2">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-muted rounded animate-pulse mb-2" />
                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Overview Tab */}
      {!isLoading && activeTab === "overview" && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Avg Customer LTV
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {ltvData?.summary
                    ? formatCurrency(ltvData.summary.avgLTV)
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ltvData?.summary?.totalCustomers || 0} customers analyzed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  M1 Retention
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {cohortsData?.summary
                    ? formatPercent(cohortsData.summary.avgM1Retention)
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg first month retention
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue Trend
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {forecastData?.summary?.trend === "up" && "↑ Growing"}
                  {forecastData?.summary?.trend === "down" && "↓ Declining"}
                  {forecastData?.summary?.trend === "flat" && "→ Stable"}
                  {!forecastData?.summary && "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {forecastData?.summary
                    ? `${forecastData.summary.growthPercentage > 0 ? "+" : ""}${forecastData.summary.growthPercentage.toFixed(1)}% expected`
                    : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Alerts
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {anomaliesData?.summary?.recentCount ?? "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {anomaliesData?.summary?.critical > 0 && (
                    <span className="text-red-500">
                      {anomaliesData.summary.critical} critical
                    </span>
                  )}
                  {anomaliesData?.summary?.critical === 0 &&
                    "No critical issues"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Overview Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Forecast</CardTitle>
                <CardDescription>
                  Projected revenue for the next 6 months
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ForecastChart trendData={forecastData?.trendData || []} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer Segments</CardTitle>
                <CardDescription>
                  RFM-based customer segmentation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SegmentDistribution
                  segments={ltvData?.segmentDistribution || []}
                />
              </CardContent>
            </Card>
          </div>

          {/* Recent Anomalies */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Anomalies</CardTitle>
              <CardDescription>
                Unusual patterns detected in the last 7 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnomalyList anomalies={anomaliesData?.recentAnomalies || []} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cohorts Tab */}
      {!isLoading && activeTab === "cohorts" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cohort Retention Analysis</CardTitle>
              <CardDescription>
                Customer retention by acquisition month. Higher percentages
                (green) indicate better retention.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CohortHeatmap cohorts={cohortsData?.cohorts || []} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Cohorts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {cohortsData?.summary?.totalCohorts || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Customers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(cohortsData?.summary?.totalCustomers || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Avg Initial Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(cohortsData?.summary?.avgInitialRevenue || 0)}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* LTV Tab */}
      {!isLoading && activeTab === "ltv" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Customer Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(ltvData?.summary?.totalLTV || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Historical + Predicted
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Predicted Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(ltvData?.summary?.totalPredictedValue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Next 12 months</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  High-Value Customers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {ltvData?.summary?.highValueCount || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  LTV ≥{" "}
                  {formatCurrency(ltvData?.summary?.highValueThreshold || 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  At-Risk Customers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500">
                  {ltvData?.summary?.atRiskCount || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  High churn probability
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Customer Segments</CardTitle>
                <CardDescription>Distribution by RFM segment</CardDescription>
              </CardHeader>
              <CardContent>
                <SegmentDistribution
                  segments={ltvData?.segmentDistribution || []}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>LTV by Acquisition Source</CardTitle>
                <CardDescription>
                  Average lifetime value by marketing channel
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {ltvData?.ltvBySource
                    ?.slice(0, 5)
                    .map(
                      (source: {
                        source: string;
                        customerCount: number;
                        avgLTV: number;
                      }) => (
                        <div
                          key={source.source}
                          className="flex items-center justify-between"
                        >
                          <div>
                            <p className="font-medium capitalize">
                              {source.source}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {source.customerCount} customers
                            </p>
                          </div>
                          <p className="font-semibold">
                            {formatCurrency(source.avgLTV)}
                          </p>
                        </div>
                      ),
                    ) || (
                    <p className="text-muted-foreground text-sm">
                      No source data available
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Forecast Tab */}
      {!isLoading && activeTab === "forecast" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Forecasted Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(forecastData?.summary?.forecastedTotal || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Next {forecastData?.forecastPeriods || 0} months
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Growth Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    (forecastData?.summary?.growthPercentage || 0) >= 0
                      ? "text-green-500"
                      : "text-red-500"
                  }`}
                >
                  {(forecastData?.summary?.growthPercentage || 0) >= 0
                    ? "+"
                    : ""}
                  {(forecastData?.summary?.growthPercentage || 0).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  vs historical avg
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Seasonality
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(
                    (forecastData?.summary?.seasonalityStrength || 0) * 100
                  ).toFixed(0)}
                  %
                </div>
                <p className="text-xs text-muted-foreground">
                  Seasonal influence
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Confidence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ±
                  {formatCurrency(
                    forecastData?.summary?.confidenceInterval || 0,
                  )}
                </div>
                <p className="text-xs text-muted-foreground">90% interval</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue Forecast</CardTitle>
              <CardDescription>
                Historical data and projected revenue with confidence intervals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ForecastChart trendData={forecastData?.trendData || []} />
            </CardContent>
          </Card>

          {forecastData?.adSpendRecommendation && (
            <Card>
              <CardHeader>
                <CardTitle>Ad Spend Recommendation</CardTitle>
                <CardDescription>
                  Optimal ad spend to achieve your target ROAS
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Recommended Spend
                    </p>
                    <p className="text-xl font-bold">
                      {formatCurrency(
                        forecastData.adSpendRecommendation.recommendedSpend,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Expected Revenue
                    </p>
                    <p className="text-xl font-bold">
                      {formatCurrency(
                        forecastData.adSpendRecommendation.expectedRevenue,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Expected ROAS
                    </p>
                    <p className="text-xl font-bold">
                      {forecastData.adSpendRecommendation.expectedROAS.toFixed(
                        2,
                      )}
                      x
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Confidence</p>
                    <p className="text-xl font-bold">
                      {(
                        forecastData.adSpendRecommendation.confidence * 100
                      ).toFixed(0)}
                      %
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Anomalies Tab */}
      {!isLoading && activeTab === "anomalies" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Anomalies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {anomaliesData?.summary?.totalAnomalies || 0}
                </div>
                <p className="text-xs text-muted-foreground">Last 90 days</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Critical
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">
                  {anomaliesData?.summary?.critical || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Requires attention
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Warning
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-500">
                  {anomaliesData?.summary?.warning || 0}
                </div>
                <p className="text-xs text-muted-foreground">Should review</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Correlated Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {anomaliesData?.summary?.correlatedEvents || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Multi-metric anomalies
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Anomalies</CardTitle>
              <CardDescription>
                Detected anomalies sorted by severity and recency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnomalyList anomalies={anomaliesData?.anomalies || []} />
            </CardContent>
          </Card>

          {anomaliesData?.correlations?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Correlated Events</CardTitle>
                <CardDescription>
                  Multiple metrics showing anomalies on the same day
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {anomaliesData.correlations.map(
                    (
                      corr: {
                        date: string;
                        metrics: string[];
                        description: string;
                      },
                      i: number,
                    ) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg border bg-muted/50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">
                            {new Date(corr.date).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {corr.metrics.length} metrics affected
                          </span>
                        </div>
                        <p className="text-sm">{corr.description}</p>
                      </div>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
