"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface SourceBreakdown {
  source: string;
  orders: number;
  revenue: number;
  firstTouch: number;
  lastTouch: number;
  linear: number;
  positionBased: number;
}

interface TimeToConversionBucket {
  bucket: string;
  orders: number;
  revenue: number;
}

interface JourneyPatterns {
  singleTouch: { orders: number; revenue: number };
  multiTouch: { orders: number; revenue: number };
  avgTouchpointsMulti: number;
}

interface AttributionResponse {
  sources: SourceBreakdown[];
  models: {
    first_touch: Record<string, number>;
    last_touch: Record<string, number>;
    linear: Record<string, number>;
    position_based: Record<string, number>;
  };
  touchpointDistribution: Array<{ touchpoints: number; orders: number }>;
  averageTouchpoints: number;
  totalOrdersWithAttribution: number;
  timeToConversion: {
    average: number;
    median: number;
    distribution: TimeToConversionBucket[];
    ordersWithData: number;
  };
  journeyPatterns: JourneyPatterns;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

const SOURCE_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
  microsoft_ads: "Microsoft Ads",
  email: "Email",
  organic: "Organic Search",
  direct: "Direct",
  social: "Social",
  referral: "Referral",
};

const MODEL_LABELS: Record<string, string> = {
  first_touch: "First Touch",
  last_touch: "Last Touch",
  linear: "Linear",
  position_based: "Position Based",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSourceName(source: string | undefined | null): string {
  if (!source) return "Unknown";
  return (
    SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1)
  );
}

function formatDays(days: number): string {
  // Guard against NaN/invalid values
  if (days == null || isNaN(days)) {
    return "N/A";
  }
  if (days < 1) {
    const hours = Math.round(days * 24);
    if (hours < 1) {
      const minutes = Math.round(days * 24 * 60);
      return `${minutes} min`;
    }
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  if (days < 7) {
    const rounded = Math.round(days * 10) / 10;
    return `${rounded} day${rounded !== 1 ? "s" : ""}`;
  }
  const weeks = Math.round((days / 7) * 10) / 10;
  return `${weeks} week${weeks !== 1 ? "s" : ""}`;
}

export default function AttributionPage() {
  const [days, setDays] = useState("30");
  const [selectedModel, setSelectedModel] = useState("first_touch");

  const { data, isLoading } = useQuery<AttributionResponse>({
    queryKey: ["attribution", days],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/attribution?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch attribution data");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Multi-Touch Attribution</h1>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-24" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Prepare chart data for selected model
  const modelData =
    data?.models[selectedModel as keyof typeof data.models] || {};
  const chartData = Object.entries(modelData)
    .map(([source, value]) => ({
      source: formatSourceName(source),
      value: Math.round(value * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Prepare comparison data
  const comparisonData =
    data?.sources.slice(0, 6).map((source) => ({
      source: formatSourceName(source.source),
      "First Touch": Math.round(source.firstTouch),
      "Last Touch": Math.round(source.lastTouch),
      Linear: Math.round(source.linear),
      "Position Based": Math.round(source.positionBased),
    })) || [];

  // Prepare pie chart data
  const pieData = chartData.map((item, index) => ({
    name: item.source,
    value: item.value,
    color: COLORS[index % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Multi-Touch Attribution</h1>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Orders with Attribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.totalOrdersWithAttribution || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Touchpoints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.averageTouchpoints.toFixed(1) || "0"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Traffic Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.sources.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.sources[0]
                ? formatSourceName(data.sources[0].source)
                : "N/A"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attribution Model Tabs */}
      <Tabs defaultValue="model" className="space-y-6">
        <TabsList>
          <TabsTrigger value="model">By Model</TabsTrigger>
          <TabsTrigger value="comparison">Model Comparison</TabsTrigger>
          <TabsTrigger value="journey">Customer Journey</TabsTrigger>
        </TabsList>

        <TabsContent value="model" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Attribution by Source</CardTitle>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_touch">First Touch</SelectItem>
                    <SelectItem value="last_touch">Last Touch</SelectItem>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="position_based">
                      Position Based
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Bar Chart */}
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={formatCurrency} />
                      <YAxis type="category" dataKey="source" width={80} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar dataKey="value" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Pie Chart */}
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={120}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attribution Table */}
          <Card>
            <CardHeader>
              <CardTitle>
                {MODEL_LABELS[selectedModel]} Attribution Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Source</th>
                      <th className="text-right py-3 px-4">Orders</th>
                      <th className="text-right py-3 px-4">Revenue</th>
                      <th className="text-right py-3 px-4">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((item, index) => {
                      const total = chartData.reduce(
                        (sum, i) => sum + i.value,
                        0,
                      );
                      const share = total > 0 ? (item.value / total) * 100 : 0;
                      const sourceData = data?.sources.find(
                        (s) => formatSourceName(s.source) === item.source,
                      );
                      return (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{
                                  backgroundColor:
                                    COLORS[index % COLORS.length],
                                }}
                              />
                              {item.source}
                            </div>
                          </td>
                          <td className="text-right py-3 px-4">
                            {sourceData?.orders || 0}
                          </td>
                          <td className="text-right py-3 px-4">
                            {formatCurrency(item.value)}
                          </td>
                          <td className="text-right py-3 px-4">
                            {share.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Attribution Model Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={comparisonData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="source" />
                    <YAxis tickFormatter={formatCurrency} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                    <Bar dataKey="First Touch" fill="#3b82f6" />
                    <Bar dataKey="Last Touch" fill="#10b981" />
                    <Bar dataKey="Linear" fill="#f59e0b" />
                    <Bar dataKey="Position Based" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Compare how different attribution models assign credit to each
                marketing channel. First Touch credits the channel that first
                brought the customer, Last Touch credits the final touchpoint,
                Linear distributes evenly, and Position Based gives 40% to
                first/last with 20% split among middle touchpoints.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journey" className="space-y-6">
          {/* Time to Conversion */}
          <Card>
            <CardHeader>
              <CardTitle>Time to Conversion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    Average Time
                  </div>
                  <div className="text-xl font-bold text-blue-700">
                    {data?.timeToConversion?.average
                      ? formatDays(data.timeToConversion.average)
                      : "N/A"}
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    Median Time
                  </div>
                  <div className="text-xl font-bold text-green-700">
                    {data?.timeToConversion?.median
                      ? formatDays(data.timeToConversion.median)
                      : "N/A"}
                  </div>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    Same-Day Conversions
                  </div>
                  <div className="text-xl font-bold text-purple-700">
                    {(() => {
                      const sameDayOrders =
                        (data?.timeToConversion?.distribution?.find(
                          (d) => d.bucket === "<1 hour",
                        )?.orders || 0) +
                        (data?.timeToConversion?.distribution?.find(
                          (d) => d.bucket === "1-24 hours",
                        )?.orders || 0);
                      const total = data?.timeToConversion?.ordersWithData || 0;
                      return total > 0
                        ? `${Math.round((sameDayOrders / total) * 100)}%`
                        : "N/A";
                    })()}
                  </div>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    Long Journey (30+ days)
                  </div>
                  <div className="text-xl font-bold text-orange-700">
                    {(() => {
                      const longOrders =
                        data?.timeToConversion?.distribution?.find(
                          (d) => d.bucket === "30+ days",
                        )?.orders || 0;
                      const total = data?.timeToConversion?.ordersWithData || 0;
                      return total > 0
                        ? `${Math.round((longOrders / total) * 100)}%`
                        : "N/A";
                    })()}
                  </div>
                </div>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.timeToConversion?.distribution || []}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="bucket" width={90} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === "orders"
                          ? `${value} orders`
                          : formatCurrency(value),
                        name === "orders" ? "Orders" : "Revenue",
                      ]}
                    />
                    <Legend />
                    <Bar dataKey="orders" fill="#3b82f6" name="Orders" />
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Shows how long customers take from their first marketing
                touchpoint to completing a purchase. Shorter times indicate
                high-intent traffic; longer journeys may need nurturing
                strategies.
              </p>
            </CardContent>
          </Card>

          {/* Touchpoint Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Touchpoint Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.touchpointDistribution || []}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="touchpoints"
                      label={{
                        value: "Number of Touchpoints",
                        position: "bottom",
                      }}
                    />
                    <YAxis
                      label={{
                        value: "Orders",
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <Tooltip />
                    <Bar dataKey="orders" fill="#8b5cf6" name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Journey Pattern Stats */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Single vs Multi-Touch Journeys</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium">Single Touchpoint</div>
                      <div className="text-sm text-muted-foreground">
                        Direct converters
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold">
                        {data?.journeyPatterns?.singleTouch?.orders || 0} orders
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(
                          data?.journeyPatterns?.singleTouch?.revenue || 0,
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium">Multi-Touch</div>
                      <div className="text-sm text-muted-foreground">
                        Avg{" "}
                        {data?.journeyPatterns?.avgTouchpointsMulti?.toFixed(
                          1,
                        ) || 0}{" "}
                        touchpoints
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold">
                        {data?.journeyPatterns?.multiTouch?.orders || 0} orders
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(
                          data?.journeyPatterns?.multiTouch?.revenue || 0,
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Journey Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="text-sm text-muted-foreground">
                      Avg Journey Length
                    </div>
                    <div className="text-xl font-bold text-blue-700">
                      {data?.averageTouchpoints?.toFixed(1) || "0"} touchpoints
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="text-sm text-muted-foreground">
                      Multi-Touch Revenue Share
                    </div>
                    <div className="text-xl font-bold text-green-700">
                      {(() => {
                        const multiRevenue =
                          data?.journeyPatterns?.multiTouch?.revenue || 0;
                        const singleRevenue =
                          data?.journeyPatterns?.singleTouch?.revenue || 0;
                        const total = multiRevenue + singleRevenue;
                        return total > 0
                          ? `${Math.round((multiRevenue / total) * 100)}%`
                          : "N/A";
                      })()}
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="text-sm text-muted-foreground">
                      Orders with Time Data
                    </div>
                    <div className="text-xl font-bold text-purple-700">
                      {data?.timeToConversion?.ordersWithData || 0}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
