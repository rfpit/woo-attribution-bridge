"use client";

import { useState, useEffect, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Store,
  ExternalLink,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StoreData {
  id: string;
  name: string;
  url: string;
  domain?: string;
  platform: string;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
  apiKey?: string;
}

async function fetchStores(): Promise<{ stores: StoreData[] }> {
  const response = await fetch("/api/stores");
  if (!response.ok) throw new Error("Failed to fetch stores");
  return response.json();
}

async function createStore(data: {
  name: string;
  url: string;
  platform: string;
}): Promise<{ store: StoreData; message: string }> {
  const response = await fetch("/api/stores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create store");
  }
  return response.json();
}

async function deleteStore(id: string): Promise<void> {
  const response = await fetch(`/api/stores/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete store");
  }
}

async function syncStore(
  id: string,
): Promise<{ success: boolean; status: string; message: string }> {
  const response = await fetch(`/api/stores/${id}/sync`, {
    method: "POST",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to sync store");
  }
  return data;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    connected:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    pending:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    paused: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    disconnected:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const config: Record<
    string,
    { icon: typeof Store; label: string; color: string }
  > = {
    woocommerce: {
      icon: ShoppingCart,
      label: "WooCommerce",
      color:
        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    },
    shopify: {
      icon: ShoppingBag,
      label: "Shopify",
      color:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
  };

  const {
    icon: Icon,
    label,
    color,
  } = config[platform] || {
    icon: Store,
    label: platform,
    color: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${color}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function AddStoreDialog() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"woocommerce" | "shopify">(
    "woocommerce",
  );
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [isConnectingShopify, setIsConnectingShopify] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: createStore,
    onSuccess: (data) => {
      // Set API key first - don't invalidate queries yet or the dialog will flash
      setApiKey(data.store.apiKey || "");
      toast({
        title: "Store created",
        description: "Copy the API key and configure it in your plugin.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleWooCommerceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ name, url, platform: "woocommerce" });
  };

  const handleShopifyConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate shop domain format
    let domain = shopDomain.trim().toLowerCase();

    // Add .myshopify.com if not present
    if (!domain.includes(".myshopify.com")) {
      domain = `${domain}.myshopify.com`;
    }

    // Validate format
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    if (!shopRegex.test(domain)) {
      toast({
        title: "Invalid shop domain",
        description:
          "Please enter a valid Shopify store domain (e.g., mystore.myshopify.com)",
        variant: "destructive",
      });
      return;
    }

    setIsConnectingShopify(true);

    // Redirect to Shopify OAuth
    window.location.href = `/api/shopify/auth?shop=${encodeURIComponent(domain)}`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    // Invalidate queries when closing to refresh the stores list
    if (apiKey) {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    }
    setOpen(false);
    setName("");
    setUrl("");
    setShopDomain("");
    setApiKey("");
    setCopied(false);
    setPlatform("woocommerce");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Store
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {!apiKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Connect a Store</DialogTitle>
              <DialogDescription>
                Choose your e-commerce platform to start tracking attribution
                data.
              </DialogDescription>
            </DialogHeader>
            <Tabs
              value={platform}
              onValueChange={(v) => setPlatform(v as "woocommerce" | "shopify")}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="woocommerce"
                  className="flex items-center gap-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  WooCommerce
                </TabsTrigger>
                <TabsTrigger
                  value="shopify"
                  className="flex items-center gap-2"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Shopify
                </TabsTrigger>
              </TabsList>

              <TabsContent value="woocommerce" className="space-y-4 mt-4">
                <form onSubmit={handleWooCommerceSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="wc-name">Store Name</Label>
                    <Input
                      id="wc-name"
                      placeholder="My WooCommerce Store"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wc-url">Store URL</Label>
                    <Input
                      id="wc-url"
                      type="url"
                      placeholder="https://mystore.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Create Store
                    </Button>
                  </DialogFooter>
                </form>
              </TabsContent>

              <TabsContent value="shopify" className="space-y-4 mt-4">
                <form onSubmit={handleShopifyConnect} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="shop-domain">Shopify Store Domain</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="shop-domain"
                        placeholder="mystore"
                        value={shopDomain}
                        onChange={(e) => setShopDomain(e.target.value)}
                        required
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        .myshopify.com
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter your Shopify store name (the part before
                      .myshopify.com)
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <p className="text-sm font-medium">What happens next:</p>
                    <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                      <li>
                        You'll be redirected to Shopify to authorize the app
                      </li>
                      <li>Grant the requested permissions</li>
                      <li>You'll be redirected back here automatically</li>
                    </ol>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isConnectingShopify}>
                      {isConnectingShopify && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Connect Shopify
                    </Button>
                  </DialogFooter>
                </form>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Store Created Successfully</DialogTitle>
              <DialogDescription>
                Copy this API key and add it to your Attribution Bridge plugin
                settings.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-md text-sm break-all">
                    {apiKey}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <div className="flex gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
                  <div className="text-sm text-yellow-800 dark:text-yellow-200">
                    <p className="font-medium">Important</p>
                    <p>
                      This is the only time you'll see this API key. Make sure
                      to copy it now.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StoreCard({
  store,
  onDelete,
  onSync,
}: {
  store: StoreData;
  onDelete: (id: string) => void;
  onSync: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncStore(store.id);
      toast({
        title: result.success ? "Connection verified" : "Connection issue",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      onSync(); // Refresh the stores list
    } catch (error) {
      toast({
        title: "Sync failed",
        description:
          error instanceof Error ? error.message : "Failed to sync store",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this store? This cannot be undone.",
      )
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteStore(store.id);
      onDelete(store.id);
      toast({
        title: "Store deleted",
        description: `${store.name} has been removed.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete store",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const PlatformIcon =
    store.platform === "shopify" ? ShoppingBag : ShoppingCart;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <PlatformIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{store.name}</CardTitle>
              <CardDescription className="flex items-center gap-1">
                <a
                  href={store.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline flex items-center gap-1"
                >
                  {store.domain || store.url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={store.status} />
            <PlatformBadge platform={store.platform} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {store.lastSyncAt
              ? `Last sync: ${new Date(store.lastSyncAt).toLocaleDateString()}`
              : "Never synced"}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
              title="Test connection"
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

function StoresPageContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery({
    queryKey: ["stores"],
    queryFn: fetchStores,
  });

  // Handle OAuth callbacks
  useEffect(() => {
    const success = searchParams.get("success");
    const errorParam = searchParams.get("error");

    if (success === "connected") {
      toast({
        title: "Store connected",
        description: "Your Shopify store has been connected successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      // Clean up URL
      window.history.replaceState({}, "", "/dashboard/stores");
    }

    if (errorParam) {
      const errorMessages: Record<string, string> = {
        invalid_state: "Security check failed. Please try again.",
        shop_mismatch: "Shop verification failed. Please try again.",
        no_code: "Authorization was cancelled. Please try again.",
        callback_failed: "Failed to complete connection. Please try again.",
        unauthorized: "Please log in to connect a store.",
      };
      toast({
        title: "Connection failed",
        description:
          errorMessages[errorParam] || "An error occurred. Please try again.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, "", "/dashboard/stores");
    }
  }, [searchParams, toast, queryClient]);

  const handleStoreDeleted = (id: string) => {
    queryClient.setQueryData(
      ["stores"],
      (old: { stores: StoreData[] } | undefined) => {
        if (!old) return { stores: [] };
        return {
          stores: old.stores.filter((s) => s.id !== id),
        };
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Stores</h1>
            <p className="text-muted-foreground">
              Manage your connected e-commerce stores
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
            <h1 className="text-3xl font-bold">Stores</h1>
            <p className="text-muted-foreground">
              Manage your connected e-commerce stores
            </p>
          </div>
          <AddStoreDialog />
        </div>
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            Failed to load stores. Please try again.
          </div>
        </Card>
      </div>
    );
  }

  const stores = data?.stores || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stores</h1>
          <p className="text-muted-foreground">
            Manage your connected e-commerce stores
          </p>
        </div>
        <AddStoreDialog />
      </div>

      {stores.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center text-center">
            <div className="p-4 bg-muted rounded-full mb-4">
              <Store className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No stores connected</h2>
            <p className="text-muted-foreground max-w-sm mb-6">
              Connect your WooCommerce or Shopify store to start tracking
              attribution data and measuring your marketing performance.
            </p>
            <AddStoreDialog />
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {stores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              onDelete={handleStoreDeleted}
              onSync={() =>
                queryClient.invalidateQueries({ queryKey: ["stores"] })
              }
            />
          ))}
        </div>
      )}

      {/* Setup Instructions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              WooCommerce Setup
            </CardTitle>
            <CardDescription>
              How to connect your WooCommerce store
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-3 text-sm">
              <li>
                Download the Attribution Bridge plugin from the WordPress plugin
                directory
              </li>
              <li>
                Install and activate the plugin in your WordPress admin panel
              </li>
              <li>
                Go to <strong>Attribution → Settings → Dashboard</strong>
              </li>
              <li>Enter your API key and Dashboard URL</li>
              <li>Click Save Changes and the plugin will start syncing data</li>
            </ol>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Dashboard URL:</strong>{" "}
                <code>
                  {typeof window !== "undefined" ? window.location.origin : ""}
                </code>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              Shopify Setup
            </CardTitle>
            <CardDescription>How to connect your Shopify store</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-3 text-sm">
              <li>Click "Add Store" and select the Shopify tab</li>
              <li>
                Enter your Shopify store domain (e.g., mystore.myshopify.com)
              </li>
              <li>Click "Connect Shopify" to authorize the app</li>
              <li>Grant the requested permissions in Shopify</li>
              <li>You'll be redirected back automatically once connected</li>
            </ol>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>No plugin needed!</strong> Shopify stores connect
                directly via OAuth and webhooks are configured automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function StoresPage() {
  return (
    <Suspense fallback={<StoresPageLoading />}>
      <StoresPageContent />
    </Suspense>
  );
}

function StoresPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stores</h1>
          <p className="text-muted-foreground">
            Manage your connected e-commerce stores
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
