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

function formatSourceName(source: string): string {
  return (
    SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1)
  );
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
                    <Bar dataKey="orders" fill="#3b82f6" name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-6 grid md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    Single Touchpoint Orders
                  </div>
                  <div className="text-xl font-bold">
                    {data?.touchpointDistribution.find(
                      (d) => d.touchpoints === 1,
                    )?.orders || 0}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    Multi-Touch Orders
                  </div>
                  <div className="text-xl font-bold">
                    {(data?.touchpointDistribution || [])
                      .filter((d) => d.touchpoints > 1)
                      .reduce((sum, d) => sum + d.orders, 0)}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    Avg Journey Length
                  </div>
                  <div className="text-xl font-bold">
                    {data?.averageTouchpoints.toFixed(1) || "0"} touchpoints
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
