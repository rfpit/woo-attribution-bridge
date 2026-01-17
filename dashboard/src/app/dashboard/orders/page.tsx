"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, parseTimestamp } from "@/lib/utils";
import {
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  Clock,
  MousePointerClick,
  ArrowRight,
} from "lucide-react";

interface Order {
  id: string;
  externalId: string;
  orderNumber: string;
  total: string;
  subtotal: string;
  tax: string;
  shipping: string;
  discount: string;
  currency: string;
  status: string;
  isNewCustomer: boolean;
  paymentMethod: string | null;
  attribution: Record<string, unknown> | null;
  surveyResponse: string | null;
  surveySource: string | null;
  dateCreated: string;
  dateCompleted: string | null;
  createdAt: string;
  store: {
    name: string;
  };
}

async function fetchOrders(): Promise<Order[]> {
  const response = await fetch("/api/orders");
  if (!response.ok) throw new Error("Failed to fetch orders");
  return response.json();
}

function getStatusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "processing":
      return "secondary";
    case "cancelled":
    case "failed":
    case "refunded":
      return "destructive";
    default:
      return "outline";
  }
}

interface TouchpointData {
  source?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  utm_source?: string;
}

interface MultiTouchData {
  first_touch?: TouchpointData;
  last_touch?: TouchpointData;
}

// Derive source from click IDs when source field is not present
function deriveSource(touchpoint: TouchpointData | undefined): string | null {
  if (!touchpoint) return null;

  // If source is explicitly set, use it and format nicely
  if (touchpoint.source) {
    return formatSourceName(touchpoint.source);
  }

  // Derive from click IDs (priority order)
  if (touchpoint.gclid) return "Google Ads";
  if (touchpoint.fbclid) return "Meta (Facebook)";
  if (touchpoint.ttclid) return "TikTok";
  if (touchpoint.msclkid) return "Microsoft Ads";
  if (touchpoint.utm_source) return `UTM: ${touchpoint.utm_source}`;

  return null;
}

// Format source names for display
function formatSourceName(source: string): string {
  const sourceMap: Record<string, string> = {
    google_ads: "Google Ads",
    meta_ads: "Meta (Facebook)",
    tiktok_ads: "TikTok",
    microsoft_ads: "Microsoft Ads",
    direct: "Direct",
  };
  return sourceMap[source] || source;
}

interface Touchpoint {
  timestamp: string;
  source: string;
  landing_page?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

// Format time gap between touchpoints
function formatTimeGap(ms: number | null): string | null {
  if (ms == null || isNaN(ms) || ms <= 0) {
    return null;
  }
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) {
    const minutes = Math.round(ms / (1000 * 60));
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }
  const days = Math.round(hours / 24);
  return `${days}d`;
}

// Get touchpoints from attribution data
function getTouchpoints(
  attribution: Record<string, unknown> | null,
): Touchpoint[] {
  if (!attribution) return [];

  // Check for touchpoints array
  const touchpoints = attribution.touchpoints as Touchpoint[] | undefined;
  if (touchpoints && Array.isArray(touchpoints) && touchpoints.length > 0) {
    return touchpoints;
  }

  // Check multi_touch structure
  const multiTouch = attribution.multi_touch as
    | Record<string, unknown>
    | undefined;
  if (multiTouch?.touchpoints) {
    const mtTouchpoints = multiTouch.touchpoints as Touchpoint[] | undefined;
    if (mtTouchpoints && Array.isArray(mtTouchpoints)) {
      return mtTouchpoints;
    }
  }

  // Fallback: construct from first/last touch if available
  const result: Touchpoint[] = [];
  const firstTouch = (attribution.first_touch ||
    (multiTouch?.first_touch as TouchpointData | undefined)) as
    | (TouchpointData & { timestamp?: string })
    | undefined;
  const lastTouch = (attribution.last_touch ||
    (multiTouch?.last_touch as TouchpointData | undefined)) as
    | (TouchpointData & { timestamp?: string })
    | undefined;

  if (firstTouch?.timestamp) {
    result.push({
      timestamp: String(firstTouch.timestamp),
      source: deriveSource(firstTouch) || "Unknown",
      gclid: firstTouch.gclid,
      fbclid: firstTouch.fbclid,
      ttclid: firstTouch.ttclid,
      utm_source: firstTouch.utm_source,
    });
  }

  // Only add last touch if different from first touch
  if (
    lastTouch?.timestamp &&
    String(lastTouch.timestamp) !== String(firstTouch?.timestamp)
  ) {
    result.push({
      timestamp: String(lastTouch.timestamp),
      source: deriveSource(lastTouch) || "Unknown",
      gclid: lastTouch.gclid,
      fbclid: lastTouch.fbclid,
      ttclid: lastTouch.ttclid,
      utm_source: lastTouch.utm_source,
    });
  }

  return result;
}

// Journey Timeline Component
function JourneyTimeline({
  touchpoints,
  orderDate,
}: {
  touchpoints: Touchpoint[];
  orderDate: string;
}) {
  if (touchpoints.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No journey data available for this order
      </div>
    );
  }

  const orderTime = parseTimestamp(orderDate);

  return (
    <div className="py-4 px-2">
      <div className="flex items-center gap-2 mb-3">
        <MousePointerClick className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Customer Journey</span>
        <span className="text-xs text-muted-foreground">
          ({touchpoints.length} touchpoint{touchpoints.length !== 1 ? "s" : ""})
        </span>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-border" />

        <div className="space-y-3">
          {touchpoints.map((tp, idx) => {
            const tpTime = parseTimestamp(tp.timestamp);
            const nextTp = touchpoints[idx + 1];
            const nextTime = nextTp
              ? parseTimestamp(nextTp.timestamp)
              : orderTime;
            const timeGap = tpTime && nextTime ? nextTime - tpTime : null;

            return (
              <div key={idx} className="relative pl-8">
                {/* Timeline dot */}
                <div
                  className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 ${
                    idx === 0
                      ? "bg-green-500 border-green-500"
                      : idx === touchpoints.length - 1
                        ? "bg-blue-500 border-blue-500"
                        : "bg-background border-muted-foreground"
                  }`}
                />

                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {formatSourceName(tp.source)}
                      </span>
                      {idx === 0 && (
                        <Badge variant="outline" className="text-xs">
                          First Touch
                        </Badge>
                      )}
                      {idx === touchpoints.length - 1 &&
                        touchpoints.length > 1 && (
                          <Badge variant="outline" className="text-xs">
                            Last Touch
                          </Badge>
                        )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {tpTime
                        ? new Date(tpTime).toLocaleString()
                        : "Invalid Date"}
                    </span>
                  </div>

                  {/* UTM details */}
                  {(tp.utm_source || tp.utm_medium || tp.utm_campaign) && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[tp.utm_source, tp.utm_medium, tp.utm_campaign]
                        .filter(Boolean)
                        .join(" / ")}
                    </div>
                  )}

                  {/* Click IDs */}
                  {(tp.gclid || tp.fbclid || tp.ttclid) && (
                    <div className="mt-1 text-xs font-mono text-muted-foreground truncate">
                      {tp.gclid && `gclid: ${tp.gclid.substring(0, 20)}...`}
                      {tp.fbclid && `fbclid: ${tp.fbclid.substring(0, 20)}...`}
                      {tp.ttclid && `ttclid: ${tp.ttclid.substring(0, 20)}...`}
                    </div>
                  )}

                  {/* Landing page */}
                  {tp.landing_page && (
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {tp.landing_page}
                    </div>
                  )}
                </div>

                {/* Time gap arrow */}
                {idx < touchpoints.length - 1 &&
                  timeGap &&
                  timeGap > 0 &&
                  (() => {
                    const gap = formatTimeGap(timeGap);
                    return gap ? (
                      <div className="flex items-center gap-1 mt-1 ml-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{gap} later</span>
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    ) : null;
                  })()}
              </div>
            );
          })}

          {/* Conversion marker */}
          <div className="relative pl-8">
            <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-primary border-2 border-primary" />
            <div className="bg-primary/10 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-primary">
                  Conversion
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(orderDate).toLocaleString()}
                </span>
              </div>
              {touchpoints.length > 0 &&
                (() => {
                  const firstTouchTime = parseTimestamp(
                    touchpoints[0].timestamp,
                  );
                  const gap =
                    firstTouchTime && orderTime
                      ? formatTimeGap(orderTime - firstTouchTime)
                      : null;
                  return gap ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {gap} from first touch
                    </div>
                  ) : null;
                })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getFirstTouchSource(
  attribution: Record<string, unknown> | null,
): string {
  if (!attribution) return "Direct";

  // Check for first_touch data (outer level from WAB_Cookie takes priority)
  const firstTouch = attribution.first_touch as TouchpointData | undefined;
  if (firstTouch) {
    const source = deriveSource(firstTouch);
    if (source) return source;
  }

  // Check multi_touch structure
  const multiTouch = attribution.multi_touch as MultiTouchData | undefined;
  if (multiTouch?.first_touch) {
    const source = deriveSource(multiTouch.first_touch);
    if (source) return source;
  }

  // Fallback to root-level click IDs
  if (attribution.fbclid) return "Meta (Facebook)";
  if (attribution.gclid) return "Google Ads";
  if (attribution.ttclid) return "TikTok";

  const utm = attribution.utm as Record<string, string> | undefined;
  if (utm?.utm_source) return `UTM: ${utm.utm_source}`;

  return "Direct";
}

function getLastTouchSource(
  attribution: Record<string, unknown> | null,
): string {
  if (!attribution) return "Direct";

  // Check for last_touch data (outer level from WAB_Cookie takes priority)
  const lastTouch = attribution.last_touch as TouchpointData | undefined;
  if (lastTouch) {
    const source = deriveSource(lastTouch);
    if (source) return source;
  }

  // Check multi_touch structure
  const multiTouch = attribution.multi_touch as MultiTouchData | undefined;
  if (multiTouch?.last_touch) {
    const source = deriveSource(multiTouch.last_touch);
    if (source) return source;
  }

  // Fallback to root-level click IDs (these represent the last known touch)
  if (attribution.gclid) return "Google Ads";
  if (attribution.fbclid) return "Meta (Facebook)";
  if (attribution.ttclid) return "TikTok";

  const utm = attribution.utm as Record<string, string> | undefined;
  if (utm?.utm_source) return `UTM: ${utm.utm_source}`;

  return "Direct";
}

export default function OrdersPage() {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const {
    data: orders,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
  });

  const toggleRow = (orderId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground">
          View all orders synced from your stores
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Recent Orders
          </CardTitle>
          <CardDescription>
            Orders received from connected WooCommerce stores
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load orders. Please try again.
            </div>
          ) : !orders || orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders yet. Orders will appear here once they sync from your
              stores.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>First Touch</TableHead>
                  <TableHead>Last Touch</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const isExpanded = expandedRows.has(order.id);
                  const touchpoints = getTouchpoints(order.attribution);
                  const hasTouchpoints =
                    touchpoints.length > 0 || order.attribution !== null;

                  return (
                    <>
                      <TableRow
                        key={order.id}
                        className={isExpanded ? "border-b-0" : ""}
                      >
                        <TableCell className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => toggleRow(order.id)}
                            disabled={!hasTouchpoints}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">
                          #{order.orderNumber}
                        </TableCell>
                        <TableCell>{order.store?.name || "Unknown"}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(order.status)}>
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatCurrency(
                            parseFloat(order.total),
                            order.currency,
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {getFirstTouchSource(order.attribution)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {getLastTouchSource(order.attribution)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {order.isNewCustomer ? (
                            <Badge variant="outline" className="text-xs">
                              New
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              Returning
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(order.dateCreated).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${order.id}-expanded`}>
                          <TableCell colSpan={9} className="bg-muted/30 p-0">
                            <JourneyTimeline
                              touchpoints={touchpoints}
                              orderDate={order.dateCreated}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
