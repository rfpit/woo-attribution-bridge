"use client";

import { useState, useEffect, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  ExternalLink,
  Trash2,
  RefreshCw,
  Loader2,
  ShoppingCart,
  Package,
  Store,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MarketplaceConnection {
  id: string;
  platform: "amazon" | "ebay" | "etsy";
  sellerId: string;
  sellerName: string | null;
  marketplace: string | null;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
}

interface SyncResult {
  success: boolean;
  ordersImported: number;
  adSpendRecords: number;
  errors: string[];
}

const PLATFORM_CONFIG = {
  amazon: {
    name: "Amazon",
    icon: Package,
    color:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    regions: [
      { value: "US", label: "United States" },
      { value: "CA", label: "Canada" },
      { value: "MX", label: "Mexico" },
      { value: "UK", label: "United Kingdom" },
      { value: "DE", label: "Germany" },
      { value: "FR", label: "France" },
      { value: "IT", label: "Italy" },
      { value: "ES", label: "Spain" },
      { value: "NL", label: "Netherlands" },
      { value: "JP", label: "Japan" },
      { value: "AU", label: "Australia" },
    ],
  },
  ebay: {
    name: "eBay",
    icon: ShoppingCart,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    regions: [
      { value: "US", label: "United States" },
      { value: "UK", label: "United Kingdom" },
      { value: "DE", label: "Germany" },
      { value: "FR", label: "France" },
      { value: "IT", label: "Italy" },
      { value: "ES", label: "Spain" },
      { value: "AU", label: "Australia" },
      { value: "CA", label: "Canada" },
    ],
  },
  etsy: {
    name: "Etsy",
    icon: Store,
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    regions: [{ value: "GLOBAL", label: "Global" }],
  },
};

async function fetchConnections(): Promise<{
  connections: MarketplaceConnection[];
}> {
  const response = await fetch("/api/marketplaces");
  if (!response.ok) throw new Error("Failed to fetch marketplace connections");
  return response.json();
}

async function deleteConnection(id: string): Promise<void> {
  const response = await fetch(`/api/marketplaces?id=${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete connection");
}

async function syncConnection(
  platform: string,
  connectionId: string,
): Promise<SyncResult> {
  const response = await fetch(`/api/marketplaces/${platform}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });
  if (!response.ok) throw new Error("Sync failed");
  return response.json();
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    connected:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    pending:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: "amazon" | "ebay" | "etsy" }) {
  const config = PLATFORM_CONFIG[platform];
  const Icon = config.icon;

  return (
    <span
      className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.name}
    </span>
  );
}

function ConnectMarketplaceDialog() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"amazon" | "ebay" | "etsy">(
    "amazon",
  );
  const [marketplace, setMarketplace] = useState("US");
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const handleConnect = () => {
    setIsConnecting(true);
    const marketplaceParam =
      platform === "etsy" ? "" : `?marketplace=${marketplace}`;
    window.location.href = `/api/marketplaces/${platform}/auth${marketplaceParam}`;
  };

  const currentConfig = PLATFORM_CONFIG[platform];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Connect Marketplace
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a Marketplace</DialogTitle>
          <DialogDescription>
            Connect your seller account to import orders, fees, and advertising
            data.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={platform}
          onValueChange={(v) => setPlatform(v as typeof platform)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="amazon" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Amazon
            </TabsTrigger>
            <TabsTrigger value="ebay" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              eBay
            </TabsTrigger>
            <TabsTrigger value="etsy" className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              Etsy
            </TabsTrigger>
          </TabsList>

          {(["amazon", "ebay", "etsy"] as const).map((p) => (
            <TabsContent key={p} value={p} className="space-y-4 mt-4">
              {p !== "etsy" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Marketplace Region
                  </label>
                  <Select value={marketplace} onValueChange={setMarketplace}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_CONFIG[p].regions.map((region) => (
                        <SelectItem key={region.value} value={region.value}>
                          {region.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="text-sm font-medium">What we'll access:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Order history and transaction data</li>
                  <li>Fees and payout information</li>
                  <li>Advertising campaign performance</li>
                  <li>Seller account information</li>
                </ul>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleConnect} disabled={isConnecting}>
                  {isConnecting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Connect {PLATFORM_CONFIG[p].name}
                </Button>
              </DialogFooter>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function MarketplaceCard({
  connection,
  onDelete,
  onSync,
}: {
  connection: MarketplaceConnection;
  onDelete: (id: string) => void;
  onSync: (id: string, platform: string) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const config = PLATFORM_CONFIG[connection.platform];
  const Icon = config.icon;

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to disconnect this marketplace? This cannot be undone.",
      )
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteConnection(connection.id);
      onDelete(connection.id);
      toast({
        title: "Marketplace disconnected",
        description: `${connection.sellerName || config.name} has been removed.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to disconnect",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSync(connection.id, connection.platform);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {connection.sellerName || config.name}
              </CardTitle>
              <CardDescription>
                {connection.marketplace &&
                  connection.marketplace !== "GLOBAL" && (
                    <span className="mr-2">{connection.marketplace}</span>
                  )}
                <span className="text-xs">ID: {connection.sellerId}</span>
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={connection.status} />
            <PlatformBadge platform={connection.platform} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {connection.lastSyncAt
              ? `Last sync: ${new Date(connection.lastSyncAt).toLocaleDateString()} ${new Date(connection.lastSyncAt).toLocaleTimeString()}`
              : "Never synced"}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MarketplacesPageContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-connections"],
    queryFn: fetchConnections,
  });

  // Handle OAuth callbacks
  useEffect(() => {
    const success = searchParams.get("success");
    const errorParam = searchParams.get("error");

    if (success) {
      const platformName =
        PLATFORM_CONFIG[success as keyof typeof PLATFORM_CONFIG]?.name ||
        success;
      toast({
        title: "Marketplace connected",
        description: `Your ${platformName} account has been connected successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["marketplace-connections"] });
      window.history.replaceState({}, "", "/dashboard/marketplaces");
    }

    if (errorParam) {
      toast({
        title: "Connection failed",
        description: decodeURIComponent(errorParam),
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/dashboard/marketplaces");
    }
  }, [searchParams, toast, queryClient]);

  const handleDelete = (id: string) => {
    queryClient.setQueryData(
      ["marketplace-connections"],
      (old: { connections: MarketplaceConnection[] } | undefined) => {
        if (!old) return { connections: [] };
        return {
          connections: old.connections.filter((c) => c.id !== id),
        };
      },
    );
  };

  const handleSync = async (connectionId: string, platform: string) => {
    try {
      const result = await syncConnection(platform, connectionId);
      queryClient.invalidateQueries({ queryKey: ["marketplace-connections"] });

      if (result.errors.length > 0) {
        toast({
          title: "Sync completed with errors",
          description: `Imported ${result.ordersImported} orders, ${result.adSpendRecords} ad records. ${result.errors.length} errors occurred.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sync completed",
          description: `Imported ${result.ordersImported} orders and ${result.adSpendRecords} ad spend records.`,
        });
      }
    } catch (error) {
      toast({
        title: "Sync failed",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Marketplaces</h1>
            <p className="text-muted-foreground">
              Connect Amazon, eBay, and Etsy seller accounts
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 w-48 bg-muted rounded animate-pulse" />
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Marketplaces</h1>
            <p className="text-muted-foreground">
              Connect Amazon, eBay, and Etsy seller accounts
            </p>
          </div>
          <ConnectMarketplaceDialog />
        </div>
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            Failed to load marketplace connections. Please try again.
          </div>
        </Card>
      </div>
    );
  }

  const connections = data?.connections || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Marketplaces</h1>
          <p className="text-muted-foreground">
            Connect Amazon, eBay, and Etsy seller accounts
          </p>
        </div>
        <ConnectMarketplaceDialog />
      </div>

      {connections.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center text-center">
            <div className="p-4 bg-muted rounded-full mb-4">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
              No marketplaces connected
            </h2>
            <p className="text-muted-foreground max-w-sm mb-6">
              Connect your Amazon, eBay, or Etsy seller account to track orders,
              fees, and advertising spend across all your sales channels.
            </p>
            <ConnectMarketplaceDialog />
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {connections.map((connection) => (
            <MarketplaceCard
              key={connection.id}
              connection={connection}
              onDelete={handleDelete}
              onSync={handleSync}
            />
          ))}
        </div>
      )}

      {/* Benefits Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5 text-green-500" />
              Revenue Tracking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Track all marketplace sales in one place. See gross revenue, fees,
              and net profit across Amazon, eBay, and Etsy.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Ad Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Monitor advertising spend and ROAS for Sponsored Products,
              Promoted Listings, and Etsy Ads in one dashboard.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5 text-purple-500" />
              Fee Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Understand your true margins with detailed fee breakdowns
              including referral fees, FBA fees, and payment processing.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Platform Setup Info */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-500" />
              Amazon Setup
            </CardTitle>
            <CardDescription>Amazon Seller Central integration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect using Login with Amazon (LWA) to access:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>SP-API for orders and fees</li>
              <li>Advertising API for Sponsored Products</li>
              <li>Multi-marketplace support</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
              eBay Setup
            </CardTitle>
            <CardDescription>eBay Seller Hub integration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect using eBay OAuth to access:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Fulfillment API for orders</li>
              <li>Finance API for payouts</li>
              <li>Marketing API for Promoted Listings</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-amber-500" />
              Etsy Setup
            </CardTitle>
            <CardDescription>Etsy Shop Manager integration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect using Etsy OAuth to access:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Receipts and transactions</li>
              <li>Fee calculations</li>
              <li>Etsy Ads budget and spend</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function MarketplacesPage() {
  return (
    <Suspense fallback={<MarketplacesPageLoading />}>
      <MarketplacesPageContent />
    </Suspense>
  );
}

function MarketplacesPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Marketplaces</h1>
          <p className="text-muted-foreground">
            Connect Amazon, eBay, and Etsy seller accounts
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 w-48 bg-muted rounded animate-pulse" />
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
