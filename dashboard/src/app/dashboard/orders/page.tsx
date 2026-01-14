"use client";

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
import { formatCurrency } from "@/lib/utils";
import { ShoppingCart } from "lucide-react";

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

function getAttributionSource(
  attribution: Record<string, unknown> | null,
): string {
  if (!attribution) return "Direct";

  if (attribution.fbclid) return "Meta (Facebook)";
  if (attribution.gclid) return "Google Ads";
  if (attribution.ttclid) return "TikTok";

  const utm = attribution.utm as Record<string, string> | undefined;
  if (utm?.utm_source) {
    return `UTM: ${utm.utm_source}`;
  }

  return "Direct";
}

export default function OrdersPage() {
  const {
    data: orders,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
  });

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
                  <TableHead>Order #</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Attribution</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
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
                      {formatCurrency(parseFloat(order.total), order.currency)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {getAttributionSource(order.attribution)}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
