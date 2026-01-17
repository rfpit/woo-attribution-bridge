"use client";

import * as React from "react";
import { Globe, Search, Users, Link2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  parseReferrer,
  getReferrerLabel,
  getReferrerStyle,
  type ParsedReferrer,
} from "@/lib/referrer-utils";

interface ReferrerBadgeProps {
  referrer: string | undefined | null;
  hasClickId?: boolean;
  showMismatchWarning?: boolean; // Show warning when referrer present but source says "direct"
  className?: string;
}

function getReferrerIcon(type: ParsedReferrer["type"]) {
  switch (type) {
    case "search":
      return Search;
    case "social":
      return Users;
    case "referral":
      return Link2;
    case "direct":
    default:
      return Globe;
  }
}

export function ReferrerBadge({
  referrer,
  hasClickId = false,
  showMismatchWarning = false,
  className,
}: ReferrerBadgeProps) {
  const parsed = parseReferrer(referrer);
  const label = getReferrerLabel(referrer, hasClickId);
  const style = getReferrerStyle(parsed.type);
  const Icon = getReferrerIcon(parsed.type);

  // Don't show badge for direct traffic without referrer
  if (parsed.type === "direct" && !referrer) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs cursor-pointer transition-colors",
              style.bgColor,
              style.textColor,
              style.borderColor,
              showMismatchWarning && "ring-2 ring-yellow-500 ring-offset-1",
              className,
            )}
          >
            <Icon className="h-3 w-3" />
            <span>{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md">
          <div className="space-y-2">
            <div className="font-semibold">Referrer</div>
            {referrer ? (
              <code className="block text-xs font-mono bg-muted p-2 rounded break-all">
                {referrer}
              </code>
            ) : (
              <span className="text-xs text-muted-foreground">
                No referrer (direct visit)
              </span>
            )}
            {showMismatchWarning && (
              <div className="text-xs text-yellow-600">
                Referrer present but source marked as &quot;Direct&quot; -
                possible data mismatch
              </div>
            )}
            {parsed.isOrganic && !hasClickId && (
              <div className="text-xs text-green-600">
                Organic traffic (no paid click ID)
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Check if there's a mismatch between referrer and reported source
 */
export function hasReferrerSourceMismatch(
  referrer: string | undefined | null,
  source: string,
): boolean {
  if (!referrer) return false;

  const parsed = parseReferrer(referrer);

  // If we have a referrer from a known source but the source is "direct" or "unknown"
  if (
    parsed.type !== "direct" &&
    (source.toLowerCase() === "direct" || source.toLowerCase() === "unknown")
  ) {
    return true;
  }

  return false;
}
