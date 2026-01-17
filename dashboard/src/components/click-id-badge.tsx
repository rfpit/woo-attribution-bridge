"use client";

import * as React from "react";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ClickIdType = "gclid" | "fbclid" | "ttclid" | "msclkid";

interface ClickIdBadgeProps {
  type: ClickIdType;
  value: string;
  isMatching?: boolean; // true if matches another touchpoint's click ID
  showLabel?: boolean; // show "gclid:" prefix
  className?: string;
}

const platformConfig: Record<
  ClickIdType,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  gclid: {
    label: "Google",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-950",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  fbclid: {
    label: "Meta",
    color: "text-indigo-700 dark:text-indigo-300",
    bgColor: "bg-indigo-50 dark:bg-indigo-950",
    borderColor: "border-indigo-200 dark:border-indigo-800",
  },
  ttclid: {
    label: "TikTok",
    color: "text-pink-700 dark:text-pink-300",
    bgColor: "bg-pink-50 dark:bg-pink-950",
    borderColor: "border-pink-200 dark:border-pink-800",
  },
  msclkid: {
    label: "Microsoft",
    color: "text-cyan-700 dark:text-cyan-300",
    bgColor: "bg-cyan-50 dark:bg-cyan-950",
    borderColor: "border-cyan-200 dark:border-cyan-800",
  },
};

export function ClickIdBadge({
  type,
  value,
  isMatching,
  showLabel = true,
  className,
}: ClickIdBadgeProps) {
  const [copied, setCopied] = useState(false);
  const config = platformConfig[type];

  const truncatedValue =
    value.length > 20 ? `${value.substring(0, 20)}...` : value;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono cursor-pointer transition-colors",
              config.color,
              config.bgColor,
              config.borderColor,
              isMatching === true && "ring-2 ring-green-500 ring-offset-1",
              isMatching === false && "ring-2 ring-orange-500 ring-offset-1",
              className,
            )}
          >
            {showLabel && (
              <span className="font-semibold opacity-70">{type}:</span>
            )}
            <span className="truncate max-w-[120px]">{truncatedValue}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold">{config.label} Click ID</span>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-green-500" />
                    <span className="text-green-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <code className="block text-xs font-mono bg-muted p-2 rounded break-all">
              {value}
            </code>
            {isMatching !== undefined && (
              <div
                className={cn(
                  "text-xs",
                  isMatching ? "text-green-600" : "text-orange-600",
                )}
              >
                {isMatching
                  ? "Same click ID as other touchpoints"
                  : "Different click ID from other touchpoints"}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Get the primary click ID from a touchpoint object
 */
export function getPrimaryClickId(touchpoint: {
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
}): { type: ClickIdType; value: string } | null {
  if (touchpoint.gclid) return { type: "gclid", value: touchpoint.gclid };
  if (touchpoint.fbclid) return { type: "fbclid", value: touchpoint.fbclid };
  if (touchpoint.ttclid) return { type: "ttclid", value: touchpoint.ttclid };
  if (touchpoint.msclkid) return { type: "msclkid", value: touchpoint.msclkid };
  return null;
}

/**
 * Check if two touchpoints have matching click IDs
 */
export function doClickIdsMatch(
  tp1: { gclid?: string; fbclid?: string; ttclid?: string; msclkid?: string },
  tp2: { gclid?: string; fbclid?: string; ttclid?: string; msclkid?: string },
): boolean | undefined {
  const id1 = getPrimaryClickId(tp1);
  const id2 = getPrimaryClickId(tp2);

  // If either doesn't have a click ID, we can't compare
  if (!id1 || !id2) return undefined;

  // Compare by type and value
  return id1.type === id2.type && id1.value === id2.value;
}
