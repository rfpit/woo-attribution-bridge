"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check, X, ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdPlatformConnection {
  id: string;
  platform: string;
  accountId: string;
  accountName: string | null;
  status: string;
  createdAt: string;
}

// Map platform IDs to their OAuth endpoints and DB values
const PLATFORM_CONFIG: Record<
  string,
  { oauthPath: string; dbPlatform: string }
> = {
  google: { oauthPath: "/api/auth/google-ads", dbPlatform: "google_ads" },
  meta: { oauthPath: "/api/auth/meta", dbPlatform: "meta_ads" },
  tiktok: { oauthPath: "/api/auth/tiktok-ads", dbPlatform: "tiktok_ads" },
};

const PLATFORMS = [
  {
    id: "google",
    name: "Google Ads",
    description: "Track gclid conversions and optimize Google campaigns",
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
    color: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    id: "meta",
    name: "Meta Ads",
    description: "Track fbclid conversions across Facebook and Instagram",
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24">
        <path
          fill="#1877F2"
          d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
        />
      </svg>
    ),
    color: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "Track ttclid conversions from TikTok campaigns",
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 24 24">
        <path
          d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
          fill="currentColor"
        />
      </svg>
    ),
    color: "bg-gray-50 dark:bg-gray-900/20",
  },
];

async function fetchConnections(): Promise<{
  connections: AdPlatformConnection[];
}> {
  const response = await fetch("/api/platforms");
  if (!response.ok) throw new Error("Failed to fetch connections");
  return response.json();
}

async function disconnectPlatform(id: string): Promise<void> {
  const response = await fetch(`/api/platforms/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to disconnect");
}

function PlatformCard({
  platform,
  connection,
  onDisconnect,
}: {
  platform: (typeof PLATFORMS)[0];
  connection?: AdPlatformConnection;
  onDisconnect: (id: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isConnected = !!connection && connection.status === "active";
  const needsReauth = connection?.status === "needs_reauth";

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectPlatform(connection!.id),
    onSuccess: () => {
      onDisconnect(connection!.id);
      toast({
        title: "Disconnected",
        description: `${platform.name} has been disconnected.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleConnect = () => {
    const config = PLATFORM_CONFIG[platform.id];
    if (!config) {
      toast({
        title: "Coming Soon",
        description: `${platform.name} OAuth integration is coming soon.`,
      });
      return;
    }

    // Google Ads and Meta Ads are implemented
    if (platform.id !== "google" && platform.id !== "meta") {
      toast({
        title: "Coming Soon",
        description: `${platform.name} OAuth integration is coming soon.`,
      });
      return;
    }

    // Redirect to OAuth endpoint
    router.push(config.oauthPath);
  };

  return (
    <Card className={platform.color}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {platform.icon}
            <div>
              <CardTitle className="text-lg">{platform.name}</CardTitle>
              <CardDescription>{platform.description}</CardDescription>
            </div>
          </div>
          {isConnected ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="h-5 w-5" />
              <span className="text-sm font-medium">Connected</span>
            </div>
          ) : needsReauth ? (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <X className="h-5 w-5" />
              <span className="text-sm font-medium">Needs Reconnection</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <X className="h-5 w-5" />
              <span className="text-sm">Not connected</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isConnected ? (
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Account: </span>
              <span className="font-medium">
                {connection.accountName || connection.accountId}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Disconnect"
              )}
            </Button>
          </div>
        ) : needsReauth ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Your connection has expired. Please reconnect to continue syncing
              data.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleConnect} className="flex-1">
                Reconnect
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Remove"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={handleConnect} className="w-full">
            Connect {platform.name}
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Separate component that handles OAuth redirect params (requires Suspense)
function OAuthRedirectHandler({ refetch }: { refetch: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const platform = searchParams.get("platform");

    if (success === "true") {
      const platformName =
        PLATFORMS.find((p) => PLATFORM_CONFIG[p.id]?.dbPlatform === platform)
          ?.name || "Ad Platform";
      toast({
        title: "Connected Successfully",
        description: `${platformName} has been connected to your account.`,
      });
      // Refetch connections to show the new one
      refetch();
      // Clear the URL params
      router.replace("/dashboard/platforms");
    } else if (error) {
      toast({
        title: "Connection Failed",
        description: decodeURIComponent(error),
        variant: "destructive",
      });
      // Clear the URL params
      router.replace("/dashboard/platforms");
    }
  }, [searchParams, toast, router, refetch]);

  return null;
}

export default function PlatformsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ad-platforms"],
    queryFn: fetchConnections,
  });

  const handleDisconnect = (id: string) => {
    queryClient.setQueryData(
      ["ad-platforms"],
      (old: { connections: AdPlatformConnection[] } | undefined) => {
        if (!old) return { connections: [] };
        return {
          connections: old.connections.filter((c) => c.id !== id),
        };
      },
    );
  };

  const connections = data?.connections || [];

  const getConnection = (platformId: string) => {
    const dbPlatform = PLATFORM_CONFIG[platformId]?.dbPlatform;
    return connections.find((c) => c.platform === dbPlatform);
  };

  return (
    <div className="space-y-6">
      {/* Handle OAuth redirects with Suspense boundary */}
      <Suspense fallback={null}>
        <OAuthRedirectHandler refetch={refetch} />
      </Suspense>

      <div>
        <h1 className="text-3xl font-bold">Ad Platforms</h1>
        <p className="text-muted-foreground">
          Connect your ad platforms to import spend data and calculate ROAS
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="h-8 w-8 bg-muted rounded animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              connection={getConnection(platform.id)}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>
            Learn how ad platform connections enhance your attribution data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium">1. Connect</h4>
              <p className="text-muted-foreground">
                Authorize Attribution Bridge to access your ad platform data
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">2. Import</h4>
              <p className="text-muted-foreground">
                We automatically import your campaign spend data daily
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">3. Calculate</h4>
              <p className="text-muted-foreground">
                See accurate ROAS for each platform based on attributed revenue
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
