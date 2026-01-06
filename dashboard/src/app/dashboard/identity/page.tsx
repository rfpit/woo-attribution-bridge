"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import {
  Search,
  Laptop,
  Smartphone,
  Tablet,
  User,
  GitBranch,
  Clock,
} from "lucide-react";

interface IdentityResponse {
  email_hash: string;
  identity: {
    email_hash: string;
    visitors: Array<{
      visitor_id: string;
      device_type: string;
      first_seen: string;
      last_seen: string;
    }>;
    device_count: number;
    visitor_count: number;
  };
  journey: Array<{
    id: string;
    visitor_id: string;
    source: string;
    medium: string;
    campaign: string;
    click_id_type: string;
    created_at: string;
    identity_device: string;
  }>;
  attribution: {
    first_touch: Record<string, number>;
    last_touch: Record<string, number>;
    linear: Record<string, number>;
    position_based: Record<string, number>;
  };
  insights: {
    first_touch_date: string;
    last_touch_date: string;
    total_touchpoints: number;
    devices_used: Record<string, number>;
    channels_used: Record<string, number>;
    journey_duration_days: number;
    visitor_count: number;
    device_count: number;
  };
  generated_at: string;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  desktop: <Laptop className="h-4 w-4" />,
  mobile: <Smartphone className="h-4 w-4" />,
  tablet: <Tablet className="h-4 w-4" />,
  unknown: <User className="h-4 w-4" />,
};

function hashEmail(email: string): string {
  // Simple hash for demo - in production, use crypto.subtle
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(64, "0");
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChannel(
  source: string,
  medium: string,
  clickIdType: string,
): string {
  if (clickIdType) {
    const clickIdLabels: Record<string, string> = {
      gclid: "Google Ads",
      fbclid: "Meta Ads",
      ttclid: "TikTok Ads",
      msclkid: "Microsoft Ads",
    };
    return clickIdLabels[clickIdType] || clickIdType.toUpperCase();
  }
  if (source && medium) {
    return `${source} / ${medium}`;
  }
  return source || medium || "Direct";
}

export default function IdentityPage() {
  const [searchEmail, setSearchEmail] = useState("");
  const [emailHash, setEmailHash] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<IdentityResponse>({
    queryKey: ["identity", emailHash],
    queryFn: async () => {
      if (!emailHash) throw new Error("No email hash");
      const res = await fetch(`/api/dashboard/identity/${emailHash}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("No identity data found for this customer");
        }
        throw new Error("Failed to fetch identity data");
      }
      return res.json();
    },
    enabled: !!emailHash,
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);

    if (!searchEmail.trim()) {
      setSearchError("Please enter an email address");
      return;
    }

    if (!searchEmail.includes("@")) {
      setSearchError("Please enter a valid email address");
      return;
    }

    // Hash the email client-side
    const hash = await sha256(searchEmail);
    setEmailHash(hash);
  };

  // Prepare device chart data
  const deviceData = data?.insights?.devices_used
    ? Object.entries(data.insights.devices_used).map(
        ([device, count], index) => ({
          name: device.charAt(0).toUpperCase() + device.slice(1),
          value: count,
          color: COLORS[index % COLORS.length],
        }),
      )
    : [];

  // Prepare channel chart data
  const channelData = data?.insights?.channels_used
    ? Object.entries(data.insights.channels_used)
        .map(([channel, count], index) => ({
          name: channel,
          value: count,
          color: COLORS[index % COLORS.length],
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Identity Resolution</h1>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Customer Lookup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="Enter customer email address..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
              />
              {searchError && (
                <p className="text-sm text-red-500 mt-1">{searchError}</p>
              )}
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Searching..." : "Search"}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground mt-2">
            Search for a customer to view their cross-device journey and
            identity graph. Email is hashed locally before sending for privacy.
          </p>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && emailHash && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700">{(error as Error).message}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Devices Used
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.insights.device_count}
                </div>
                <div className="flex gap-2 mt-2">
                  {Object.entries(data.insights.devices_used || {}).map(
                    ([device, count]) => (
                      <span
                        key={device}
                        className="flex items-center gap-1 text-sm text-muted-foreground"
                      >
                        {DEVICE_ICONS[device]}
                        {count}
                      </span>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Touchpoints
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.insights.total_touchpoints}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Journey Duration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.insights.journey_duration_days} days
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Visitor Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.insights.visitor_count}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="journey" className="space-y-6">
            <TabsList>
              <TabsTrigger value="journey">Customer Journey</TabsTrigger>
              <TabsTrigger value="identity">Identity Graph</TabsTrigger>
              <TabsTrigger value="attribution">
                Cross-Device Attribution
              </TabsTrigger>
            </TabsList>

            <TabsContent value="journey" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Touchpoint Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.journey.map((touchpoint, index) => (
                      <div
                        key={touchpoint.id || index}
                        className="flex items-start gap-4"
                      >
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            {DEVICE_ICONS[touchpoint.identity_device] ||
                              DEVICE_ICONS.unknown}
                          </div>
                          {index < data.journey.length - 1 && (
                            <div className="w-0.5 h-8 bg-gray-200 my-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium">
                                {formatChannel(
                                  touchpoint.source,
                                  touchpoint.medium,
                                  touchpoint.click_id_type,
                                )}
                              </div>
                              {touchpoint.campaign && (
                                <div className="text-sm text-muted-foreground">
                                  Campaign: {touchpoint.campaign}
                                </div>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {formatDate(touchpoint.created_at)}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                              {touchpoint.identity_device || "unknown"}
                            </span>
                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                              {touchpoint.visitor_id?.substring(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {data.journey.length === 0 && (
                      <p className="text-muted-foreground">
                        No touchpoints recorded
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Channel Distribution */}
              {channelData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Channel Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={channelData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="name" width={120} />
                          <Tooltip />
                          <Bar
                            dataKey="value"
                            fill="#3b82f6"
                            name="Touchpoints"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="identity" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="h-5 w-5" />
                    Linked Identities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.identity.visitors.map((visitor, index) => (
                      <div
                        key={visitor.visitor_id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                            {DEVICE_ICONS[visitor.device_type] ||
                              DEVICE_ICONS.unknown}
                          </div>
                          <div>
                            <div className="font-medium">
                              {visitor.device_type?.charAt(0).toUpperCase() +
                                visitor.device_type?.slice(1) ||
                                "Unknown Device"}
                            </div>
                            <div className="text-sm text-muted-foreground font-mono">
                              {visitor.visitor_id}
                            </div>
                          </div>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <div>
                            First seen: {formatDate(visitor.first_seen)}
                          </div>
                          <div>Last seen: {formatDate(visitor.last_seen)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Device Distribution Pie Chart */}
              {deviceData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Device Usage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={deviceData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {deviceData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="attribution" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Cross-Device Attribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(data.attribution || {}).length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {Object.entries(data.attribution).map(
                        ([model, sources]) => (
                          <div key={model} className="border rounded-lg p-4">
                            <h4 className="font-medium mb-2">
                              {model
                                .replace(/_/g, " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase())}
                            </h4>
                            <div className="space-y-2">
                              {Object.entries(sources as Record<string, number>)
                                .sort(([, a], [, b]) => b - a)
                                .slice(0, 5)
                                .map(([source, value]) => (
                                  <div
                                    key={source}
                                    className="flex justify-between text-sm"
                                  >
                                    <span className="text-muted-foreground">
                                      {source}
                                    </span>
                                    <span className="font-medium">
                                      {((value as number) * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Not enough touchpoints to calculate attribution
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Attribution Explanation */}
              <Card>
                <CardHeader>
                  <CardTitle>Understanding Cross-Device Attribution</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>
                    <strong>Cross-device attribution</strong> tracks how
                    customers interact with your brand across multiple devices
                    before converting.
                  </p>
                  <p>
                    This customer used{" "}
                    <strong>{data.insights.device_count} device(s)</strong>{" "}
                    across{" "}
                    <strong>
                      {data.insights.total_touchpoints} touchpoint(s)
                    </strong>{" "}
                    over{" "}
                    <strong>{data.insights.journey_duration_days} days</strong>.
                  </p>
                  <p>
                    The identity graph links all visitor sessions to a single
                    customer when they provide their email (e.g., at checkout or
                    newsletter signup).
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Empty State */}
      {!data && !isLoading && !error && (
        <Card>
          <CardContent className="pt-6 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Search for a Customer</h3>
            <p className="text-muted-foreground">
              Enter a customer&apos;s email address to view their cross-device
              journey and identity graph.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
