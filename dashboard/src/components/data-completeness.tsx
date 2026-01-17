"use client";

import * as React from "react";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DataCompletenessLevel = "full" | "partial" | "minimal";

interface TouchpointForCompleteness {
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  referrer?: string;
  landing_page?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

/**
 * Calculate the data completeness level for a touchpoint
 */
export function calculateCompleteness(
  touchpoint: TouchpointForCompleteness,
): DataCompletenessLevel {
  const hasClickId = !!(
    touchpoint.gclid ||
    touchpoint.fbclid ||
    touchpoint.ttclid ||
    touchpoint.msclkid
  );
  const hasReferrer = !!touchpoint.referrer;
  const hasLandingPage = !!touchpoint.landing_page;
  const hasUtm = !!(
    touchpoint.utm_source ||
    touchpoint.utm_medium ||
    touchpoint.utm_campaign
  );

  // Full: has click ID + (referrer or UTM)
  if (hasClickId && (hasReferrer || hasUtm)) {
    return "full";
  }

  // Partial: has click ID OR has referrer OR has UTM
  if (hasClickId || hasReferrer || hasUtm || hasLandingPage) {
    return "partial";
  }

  // Minimal: just has timestamp/source
  return "minimal";
}

interface DataCompletenessIndicatorProps {
  level: DataCompletenessLevel;
  touchpoint: TouchpointForCompleteness;
  className?: string;
}

export function DataCompletenessIndicator({
  level,
  touchpoint,
  className,
}: DataCompletenessIndicatorProps) {
  const config = {
    full: {
      Icon: CheckCircle2,
      color: "text-green-500",
      bgColor: "bg-green-50 dark:bg-green-950",
      label: "Complete data",
    },
    partial: {
      Icon: Circle,
      color: "text-yellow-500",
      bgColor: "bg-yellow-50 dark:bg-yellow-950",
      label: "Partial data",
    },
    minimal: {
      Icon: AlertCircle,
      color: "text-gray-400",
      bgColor: "bg-gray-50 dark:bg-gray-900",
      label: "Minimal data",
    },
  };

  const { Icon, color, label } = config[level];

  // Build list of what's present and missing
  const present: string[] = [];
  const missing: string[] = [];

  if (
    touchpoint.gclid ||
    touchpoint.fbclid ||
    touchpoint.ttclid ||
    touchpoint.msclkid
  ) {
    present.push("Click ID");
  } else {
    missing.push("Click ID");
  }

  if (touchpoint.referrer) {
    present.push("Referrer");
  } else {
    missing.push("Referrer");
  }

  if (
    touchpoint.utm_source ||
    touchpoint.utm_medium ||
    touchpoint.utm_campaign
  ) {
    present.push("UTM params");
  } else {
    missing.push("UTM params");
  }

  if (touchpoint.landing_page) {
    present.push("Landing page");
  } else {
    missing.push("Landing page");
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex cursor-pointer", className)}>
            <Icon className={cn("h-4 w-4", color)} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-semibold">{label}</div>
            {present.length > 0 && (
              <div className="text-xs">
                <span className="text-green-600">Present:</span>{" "}
                {present.join(", ")}
              </div>
            )}
            {missing.length > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Missing:</span>{" "}
                {missing.join(", ")}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface JourneySummaryProps {
  touchpoints: TouchpointForCompleteness[];
  className?: string;
}

/**
 * Summary of journey data quality
 */
export function JourneyDataSummary({
  touchpoints,
  className,
}: JourneySummaryProps) {
  if (touchpoints.length === 0) return null;

  const levels = touchpoints.map(calculateCompleteness);
  const fullCount = levels.filter((l) => l === "full").length;
  const partialCount = levels.filter((l) => l === "partial").length;
  const minimalCount = levels.filter((l) => l === "minimal").length;

  // Overall quality
  const allFull = fullCount === touchpoints.length;
  const hasMissing = minimalCount > 0;

  return (
    <div className={cn("inline-flex items-center gap-2 text-xs", className)}>
      {allFull ? (
        <span className="text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Complete journey data
        </span>
      ) : hasMissing ? (
        <span className="text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {minimalCount} touchpoint{minimalCount !== 1 ? "s" : ""} with minimal
          data
        </span>
      ) : (
        <span className="text-yellow-600 flex items-center gap-1">
          <Circle className="h-3 w-3" />
          {fullCount}/{touchpoints.length} touchpoints have full data
        </span>
      )}
    </div>
  );
}
