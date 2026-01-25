"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface GoogleAdsAccount {
  customerId: string;
  name: string | null;
  currency: string;
  timezone: string;
}

interface PendingTokenData {
  accounts: GoogleAdsAccount[];
  expiresAt: string;
}

function GoogleAdsSelectAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const pendingTokenId = searchParams.get("pendingTokenId");

  const [accounts, setAccounts] = useState<GoogleAdsAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingTokenId) {
      setError(
        "No pending token ID found. Please start the connection process again.",
      );
      setIsLoading(false);
      return;
    }

    // Fetch the pending token data
    fetchPendingTokenData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTokenId]);

  async function fetchPendingTokenData() {
    try {
      const response = await fetch(
        `/api/auth/google-ads/pending?id=${pendingTokenId}`,
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch account data");
      }

      const data: PendingTokenData = await response.json();
      setAccounts(data.accounts);

      // Pre-select first account if only one
      if (data.accounts.length === 1) {
        setSelectedAccountId(data.accounts[0].customerId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit() {
    if (!selectedAccountId || !pendingTokenId) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/google-ads/select-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingTokenId,
          accountId: selectedAccountId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to connect account");
      }

      toast({
        title: "Google Ads Connected",
        description: "Your Google Ads account has been successfully connected.",
      });

      router.push("/dashboard/platforms?success=true&platform=google_ads");
    } catch (err) {
      toast({
        title: "Connection Failed",
        description:
          err instanceof Error ? err.message : "Failed to connect account",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    router.push("/dashboard/platforms");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-2xl py-8">
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center gap-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Connection Error</h2>
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={() => router.push("/dashboard/platforms")}>
                Back to Ad Platforms
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Select Google Ads Account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose which Google Ads account you want to connect to the
            dashboard.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={selectedAccountId}
            onValueChange={setSelectedAccountId}
            className="space-y-3"
          >
            {accounts.map((account) => (
              <div
                key={account.customerId}
                className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedAccountId(account.customerId)}
              >
                <RadioGroupItem
                  value={account.customerId}
                  id={account.customerId}
                />
                <Label
                  htmlFor={account.customerId}
                  className="flex-1 cursor-pointer"
                >
                  <div className="font-medium">
                    {account.name || `Account ${account.customerId}`}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ID: {account.customerId} • {account.currency} •{" "}
                    {account.timezone}
                  </div>
                </Label>
                {selectedAccountId === account.customerId && (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                )}
              </div>
            ))}
          </RadioGroup>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedAccountId || isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Connect Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GoogleAdsSelectAccountPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <GoogleAdsSelectAccountContent />
    </Suspense>
  );
}
