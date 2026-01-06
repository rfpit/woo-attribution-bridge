"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  Target,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

interface DashboardMetrics {
  revenue: {
    total: number;
    change: number;
  };
  orders: {
    total: number;
    change: number;
  };
  customers: {
    total: number;
    newCustomers: number;
    change: number;
  };
  attribution: {
    tracked: number;
    rate: number;
    change: number;
  };
  adSpend: {
    total: number;
    roas: number;
    change: number;
  };
  topSources: Array<{
    source: string;
    revenue: number;
    orders: number;
    roas: number;
  }>;
}

async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const response = await fetch("/api/dashboard/metrics");
  if (!response.ok) throw new Error("Failed to fetch metrics");
  return response.json();
}

function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  format = "number",
}: {
  title: string;
  value: number;
  change: number;
  icon: React.ElementType;
  format?: "number" | "currency" | "percent";
}) {
  const formatValue = (val: number) => {
    switch (format) {
      case "currency":
        return formatCurrency(val);
      case "percent":
        return formatPercent(val);
      default:
        return formatNumber(val);
    }
  };

  const isPositive = change >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        <div className="flex items-center gap-1 text-xs">
          <TrendIcon
            className={`h-3 w-3 ${isPositive ? "text-green-500" : "text-red-500"}`}
          />
          <span className={isPositive ? "text-green-500" : "text-red-500"}>
            {isPositive ? "+" : ""}
            {formatPercent(change)}
          </span>
          <span className="text-muted-foreground">vs last period</span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="rounded-full bg-muted p-6 mb-6">
        <Target className="h-12 w-12 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-semibold mb-2">
        Welcome to Attribution Bridge
      </h2>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Connect your WooCommerce store to start tracking attribution data and
        see your marketing performance.
      </p>
      <Button asChild>
        <Link href="/dashboard/stores">
          <Plus className="mr-2 h-4 w-4" />
          Connect Your First Store
        </Link>
      </Button>
    </div>
  );
}

export default function DashboardPage() {
  const {
    data: metrics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: fetchDashboardMetrics,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Your marketing attribution overview
            </p>
          </div>
        </div>
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
      </div>
    );
  }

  if (error || !metrics) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Your marketing attribution overview
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/stores">
            Manage Stores
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Revenue"
          value={metrics.revenue.total}
          change={metrics.revenue.change}
          icon={DollarSign}
          format="currency"
        />
        <MetricCard
          title="Orders"
          value={metrics.orders.total}
          change={metrics.orders.change}
          icon={ShoppingCart}
        />
        <MetricCard
          title="Customers"
          value={metrics.customers.total}
          change={metrics.customers.change}
          icon={Users}
        />
        <MetricCard
          title="Attribution Rate"
          value={metrics.attribution.rate}
          change={metrics.attribution.change}
          icon={Target}
          format="percent"
        />
      </div>

      {/* ROAS and Ad Spend */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ad Spend & ROAS</CardTitle>
            <CardDescription>
              Track your return on ad spend across platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total Ad Spend</span>
                <span className="font-semibold">
                  {formatCurrency(metrics.adSpend.total)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Overall ROAS</span>
                <span className="font-semibold text-lg">
                  {metrics.adSpend.roas.toFixed(2)}x
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Attributed Revenue
                </span>
                <span className="font-semibold">
                  {formatCurrency(metrics.adSpend.total * metrics.adSpend.roas)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Traffic Sources</CardTitle>
            <CardDescription>
              Revenue breakdown by attribution source
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics.topSources.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No attribution data yet. Orders will appear here once they're
                  tracked.
                </p>
              ) : (
                metrics.topSources.map((source) => (
                  <div
                    key={source.source}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{source.source}</p>
                      <p className="text-xs text-muted-foreground">
                        {source.orders} orders
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatCurrency(source.revenue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {source.roas.toFixed(2)}x ROAS
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attribution Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Attribution Summary</CardTitle>
          <CardDescription>
            How orders are being attributed to marketing channels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-3xl font-bold">
                {formatNumber(metrics.attribution.tracked)}
              </p>
              <p className="text-sm text-muted-foreground">
                Orders with attribution
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold">
                {formatPercent(metrics.attribution.rate)}
              </p>
              <p className="text-sm text-muted-foreground">Attribution rate</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold">
                {formatNumber(metrics.customers.newCustomers)}
              </p>
              <p className="text-sm text-muted-foreground">New customers</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
