"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  Users,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Trash2,
  Settings,
  BarChart3,
} from "lucide-react";

interface MarketingConnection {
  id: string;
  platform: string;
  name: string;
  apiKey: string;
  status: string;
  lastSyncAt: string | null;
  stats: {
    campaignCount: number;
    subscriberCount: number;
  };
}

interface Campaign {
  id: string;
  externalId: string;
  name: string;
  type: string;
  status: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  revenue: string;
  sentAt: string | null;
  connection: {
    platform: string;
    name: string;
  };
}

interface BudgetAllocation {
  campaignId: string;
  campaignName: string;
  platform: string;
  currentSpend: number;
  recommendedSpend: number;
  spendChange: number;
  spendChangePercent: number;
  expectedRoas: number;
  priority: "increase" | "maintain" | "decrease" | "pause";
  reason: string;
  confidence: number;
}

interface OptimizationResult {
  totalBudget: number;
  optimizedBudget: number;
  allocations: BudgetAllocation[];
  summary: {
    platformAllocations: {
      platform: string;
      budget: number;
      percentage: number;
    }[];
    expectedTotalRevenue: number;
    expectedOverallRoas: number;
    optimizationScore: number;
  };
  insights: string[];
}

export default function MarketingPage() {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newConnection, setNewConnection] = useState({
    platform: "klaviyo",
    name: "",
    apiKey: "",
    publicApiKey: "",
    shopId: "",
  });
  const [optimizerSettings, setOptimizerSettings] = useState({
    totalBudget: 10000,
    targetRoas: 3,
    optimizeFor: "balanced" as "revenue" | "roas" | "balanced",
  });

  // Fetch connections
  const { data: connectionsData, isLoading: connectionsLoading } = useQuery({
    queryKey: ["marketing-connections"],
    queryFn: async () => {
      const res = await fetch("/api/marketing/connections");
      if (!res.ok) throw new Error("Failed to fetch connections");
      return res.json();
    },
  });

  // Fetch campaigns
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/marketing/campaigns");
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  // Create connection mutation
  const createConnection = useMutation({
    mutationFn: async (data: typeof newConnection) => {
      const res = await fetch("/api/marketing/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create connection");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-connections"] });
      setIsAddDialogOpen(false);
      setNewConnection({
        platform: "klaviyo",
        name: "",
        apiKey: "",
        publicApiKey: "",
        shopId: "",
      });
    },
  });

  // Delete connection mutation
  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/marketing/connections?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete connection");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-connections"] });
    },
  });

  // Sync campaigns mutation
  const syncCampaigns = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (!res.ok) throw new Error("Failed to sync campaigns");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
    },
  });

  // Budget optimization
  const {
    data: optimizationData,
    refetch: runOptimization,
    isFetching: optimizing,
  } = useQuery({
    queryKey: ["budget-optimization", optimizerSettings],
    queryFn: async () => {
      const res = await fetch("/api/marketing/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optimizerSettings),
      });
      if (!res.ok) throw new Error("Failed to run optimization");
      return res.json();
    },
    enabled: false,
  });

  const connections: MarketingConnection[] = connectionsData?.connections || [];
  const campaigns: Campaign[] = campaignsData?.campaigns || [];
  const campaignSummary = campaignsData?.summary;
  const optimization: OptimizationResult | null =
    optimizationData?.optimization;

  const getPlatformIcon = (platform: string) => {
    if (platform === "klaviyo" || platform.includes("email")) {
      return <Mail className="h-4 w-4" />;
    }
    return <MessageSquare className="h-4 w-4" />;
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      klaviyo: "bg-green-100 text-green-800",
      postscript: "bg-purple-100 text-purple-800",
      mailchimp: "bg-yellow-100 text-yellow-800",
      attentive: "bg-blue-100 text-blue-800",
    };
    return colors[platform] || "bg-gray-100 text-gray-800";
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      increase: "bg-green-100 text-green-800",
      maintain: "bg-blue-100 text-blue-800",
      decrease: "bg-orange-100 text-orange-800",
      pause: "bg-red-100 text-red-800",
    };
    return colors[priority] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Marketing</h1>
          <p className="text-muted-foreground">
            Email & SMS marketing integrations with budget optimization
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Connection
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Marketing Connection</DialogTitle>
              <DialogDescription>
                Connect your email or SMS marketing platform
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select
                  value={newConnection.platform}
                  onValueChange={(value) =>
                    setNewConnection((prev) => ({ ...prev, platform: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="klaviyo">Klaviyo (Email)</SelectItem>
                    <SelectItem value="postscript">Postscript (SMS)</SelectItem>
                    <SelectItem value="mailchimp">Mailchimp (Email)</SelectItem>
                    <SelectItem value="attentive">Attentive (SMS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  placeholder="My Klaviyo Account"
                  value={newConnection.name}
                  onChange={(e) =>
                    setNewConnection((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  placeholder="Enter your API key"
                  value={newConnection.apiKey}
                  onChange={(e) =>
                    setNewConnection((prev) => ({
                      ...prev,
                      apiKey: e.target.value,
                    }))
                  }
                />
              </div>
              {newConnection.platform === "klaviyo" && (
                <div className="space-y-2">
                  <Label>Public API Key (Optional)</Label>
                  <Input
                    placeholder="For client-side tracking"
                    value={newConnection.publicApiKey}
                    onChange={(e) =>
                      setNewConnection((prev) => ({
                        ...prev,
                        publicApiKey: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
              {newConnection.platform === "postscript" && (
                <div className="space-y-2">
                  <Label>Shop ID</Label>
                  <Input
                    placeholder="Your Postscript Shop ID"
                    value={newConnection.shopId}
                    onChange={(e) =>
                      setNewConnection((prev) => ({
                        ...prev,
                        shopId: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => createConnection.mutate(newConnection)}
                disabled={createConnection.isPending || !newConnection.apiKey}
              >
                {createConnection.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Connect
              </Button>
            </DialogFooter>
            {createConnection.isError && (
              <p className="text-sm text-destructive mt-2">
                {createConnection.error.message}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="optimizer">Budget Optimizer</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Campaigns
                </CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {campaignSummary?.totalCampaigns || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {campaignSummary?.byType?.email || 0} email,{" "}
                  {campaignSummary?.byType?.sms || 0} SMS
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Messages Sent
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(campaignSummary?.totalSent || 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {(campaignSummary?.totalDelivered || 0).toLocaleString()}{" "}
                  delivered
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Avg Open Rate
                </CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((campaignSummary?.avgOpenRate || 0) * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {((campaignSummary?.avgClickRate || 0) * 100).toFixed(1)}%
                  click rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Revenue
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${(campaignSummary?.totalRevenue || 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Attributed to campaigns
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Connections Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Connected Platforms</CardTitle>
              <CardDescription>
                Your marketing platform integrations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {connectionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : connections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No connections yet. Add your first marketing platform.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {connections.map((connection) => (
                    <Card key={connection.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                            {getPlatformIcon(connection.platform)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">
                                {connection.name}
                              </h3>
                              <Badge
                                variant="secondary"
                                className={getPlatformColor(
                                  connection.platform,
                                )}
                              >
                                {connection.platform}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {connection.stats.campaignCount} campaigns,{" "}
                              {connection.stats.subscriberCount} subscribers
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => syncCampaigns.mutate(connection.id)}
                            disabled={syncCampaigns.isPending}
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${
                                syncCampaigns.isPending ? "animate-spin" : ""
                              }`}
                            />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Campaigns */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Campaigns</CardTitle>
              <CardDescription>Latest email and SMS campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No campaigns found. Sync your marketing platforms.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Open Rate</TableHead>
                      <TableHead>Click Rate</TableHead>
                      <TableHead>Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.slice(0, 5).map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{campaign.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {campaign.connection?.name}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              campaign.type === "email"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-purple-100 text-purple-800"
                            }
                          >
                            {campaign.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{campaign.sent.toLocaleString()}</TableCell>
                        <TableCell>
                          {campaign.delivered > 0
                            ? (
                                (campaign.opened / campaign.delivered) *
                                100
                              ).toFixed(1)
                            : 0}
                          %
                        </TableCell>
                        <TableCell>
                          {campaign.delivered > 0
                            ? (
                                (campaign.clicked / campaign.delivered) *
                                100
                              ).toFixed(1)
                            : 0}
                          %
                        </TableCell>
                        <TableCell>
                          ${Number(campaign.revenue).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Marketing Connections</CardTitle>
              <CardDescription>
                Manage your email and SMS marketing platform integrations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {connectionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : connections.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">
                    No connections yet
                  </h3>
                  <p className="text-muted-foreground">
                    Connect your first marketing platform to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {connections.map((connection) => (
                    <Card key={connection.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div
                              className={`flex h-12 w-12 items-center justify-center rounded-lg ${getPlatformColor(
                                connection.platform,
                              )}`}
                            >
                              {getPlatformIcon(connection.platform)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">
                                  {connection.name}
                                </h3>
                                <Badge
                                  variant={
                                    connection.status === "active"
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {connection.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                API Key: {connection.apiKey}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Last synced:{" "}
                                {connection.lastSyncAt
                                  ? new Date(
                                      connection.lastSyncAt,
                                    ).toLocaleString()
                                  : "Never"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right mr-4">
                              <p className="text-sm font-medium">
                                {connection.stats.campaignCount} campaigns
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {connection.stats.subscriberCount} subscribers
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() =>
                                syncCampaigns.mutate(connection.id)
                              }
                              disabled={syncCampaigns.isPending}
                            >
                              <RefreshCw
                                className={`h-4 w-4 ${
                                  syncCampaigns.isPending ? "animate-spin" : ""
                                }`}
                              />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="text-destructive"
                              onClick={() => {
                                if (
                                  confirm(
                                    "Are you sure you want to delete this connection?",
                                  )
                                ) {
                                  deleteConnection.mutate(connection.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Campaigns</CardTitle>
              <CardDescription>
                Email and SMS campaign performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-8">
                  <Mail className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">No campaigns</h3>
                  <p className="text-muted-foreground">
                    Sync your marketing platforms to see campaigns
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Clicked</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium">
                          {campaign.name}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={getPlatformColor(
                              campaign.connection?.platform,
                            )}
                          >
                            {campaign.connection?.platform}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              campaign.type === "email"
                                ? "border-blue-500"
                                : "border-purple-500"
                            }
                          >
                            {campaign.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              campaign.status === "sent"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {campaign.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{campaign.sent.toLocaleString()}</TableCell>
                        <TableCell>
                          {campaign.delivered.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {campaign.opened.toLocaleString()}
                          <span className="text-xs text-muted-foreground ml-1">
                            (
                            {campaign.delivered > 0
                              ? (
                                  (campaign.opened / campaign.delivered) *
                                  100
                                ).toFixed(1)
                              : 0}
                            %)
                          </span>
                        </TableCell>
                        <TableCell>
                          {campaign.clicked.toLocaleString()}
                          <span className="text-xs text-muted-foreground ml-1">
                            (
                            {campaign.delivered > 0
                              ? (
                                  (campaign.clicked / campaign.delivered) *
                                  100
                                ).toFixed(1)
                              : 0}
                            %)
                          </span>
                        </TableCell>
                        <TableCell>
                          ${Number(campaign.revenue).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {campaign.sentAt
                            ? new Date(campaign.sentAt).toLocaleDateString()
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimizer" className="space-y-4">
          {/* Optimizer Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Budget Optimizer</CardTitle>
              <CardDescription>
                AI-powered budget allocation recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Total Budget</Label>
                  <Input
                    type="number"
                    value={optimizerSettings.totalBudget}
                    onChange={(e) =>
                      setOptimizerSettings((prev) => ({
                        ...prev,
                        totalBudget: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target ROAS</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={optimizerSettings.targetRoas}
                    onChange={(e) =>
                      setOptimizerSettings((prev) => ({
                        ...prev,
                        targetRoas: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Optimize For</Label>
                  <Select
                    value={optimizerSettings.optimizeFor}
                    onValueChange={(value: "revenue" | "roas" | "balanced") =>
                      setOptimizerSettings((prev) => ({
                        ...prev,
                        optimizeFor: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="revenue">Maximum Revenue</SelectItem>
                      <SelectItem value="roas">Maximum ROAS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => runOptimization()}
                    disabled={optimizing}
                    className="w-full"
                  >
                    {optimizing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Optimize
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Optimization Results */}
          {optimization && (
            <>
              {/* Summary */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Optimization Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {optimization.summary.optimizationScore}/100
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Expected Revenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      $
                      {optimization.summary.expectedTotalRevenue.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Expected ROAS
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {optimization.summary.expectedOverallRoas.toFixed(2)}x
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Budget Utilized
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${optimization.optimizedBudget.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Insights */}
              <Card>
                <CardHeader>
                  <CardTitle>Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {optimization.insights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Target className="h-4 w-4 text-primary mt-1 shrink-0" />
                        <span className="text-sm">{insight}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Allocations */}
              <Card>
                <CardHeader>
                  <CardTitle>Budget Allocations</CardTitle>
                  <CardDescription>
                    Recommended spend per campaign
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Current Spend</TableHead>
                        <TableHead>Recommended</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>Expected ROAS</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {optimization.allocations.map((allocation) => (
                        <TableRow key={allocation.campaignId}>
                          <TableCell className="font-medium">
                            {allocation.campaignName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {allocation.platform}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            ${allocation.currentSpend.toLocaleString()}
                          </TableCell>
                          <TableCell className="font-medium">
                            ${allocation.recommendedSpend.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {allocation.spendChange > 0 ? (
                                <ArrowUpRight className="h-4 w-4 text-green-500" />
                              ) : allocation.spendChange < 0 ? (
                                <ArrowDownRight className="h-4 w-4 text-red-500" />
                              ) : null}
                              <span
                                className={
                                  allocation.spendChange > 0
                                    ? "text-green-600"
                                    : allocation.spendChange < 0
                                      ? "text-red-600"
                                      : ""
                                }
                              >
                                {allocation.spendChangePercent > 0 ? "+" : ""}
                                {allocation.spendChangePercent.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {allocation.expectedRoas.toFixed(2)}x
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={getPriorityColor(allocation.priority)}
                            >
                              {allocation.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary"
                                  style={{
                                    width: `${allocation.confidence * 100}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {(allocation.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Platform Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Platform Allocation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {optimization.summary.platformAllocations.map(
                      (platform) => (
                        <div key={platform.platform} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {platform.platform}
                            </span>
                            <span className="text-muted-foreground">
                              ${platform.budget.toLocaleString()} (
                              {platform.percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${platform.percentage}%` }}
                            />
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {!optimization && !optimizing && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">
                  Run Budget Optimization
                </h3>
                <p className="text-muted-foreground text-center max-w-md mt-2">
                  Enter your total budget and optimization goals, then click
                  Optimize to get AI-powered budget allocation recommendations.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
