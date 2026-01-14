import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores, orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

const orderSchema = z.object({
  external_id: z.string(),
  order_number: z.string(),
  total: z.number(),
  subtotal: z.number(),
  tax: z.number().default(0),
  shipping: z.number().default(0),
  discount: z.number().default(0),
  currency: z.string().default("GBP"),
  status: z.string(),
  customer_email_hash: z.string(),
  is_new_customer: z.boolean().default(true),
  payment_method: z.string().optional(),
  attribution: z.record(z.unknown()).nullable().optional(),
  survey_response: z.string().nullable().optional(),
  survey_source: z.string().nullable().optional(),
  date_created: z.string(),
  date_completed: z.string().nullable().optional(),
});

const webhookPayloadSchema = z.object({
  event: z.enum(["order.created", "order.updated", "order.completed"]),
  order: orderSchema,
});

// Verify API key from header
async function verifyApiKey(
  request: NextRequest,
): Promise<{ storeId: string } | null> {
  const apiKey = request.headers.get("X-WAB-API-Key");
  if (!apiKey) return null;

  const [store] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.apiKey, apiKey))
    .limit(1);

  return store ? { storeId: store.id } : null;
}

export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const auth = await verifyApiKey(request);
    if (!auth) {
      return NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = webhookPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { event, order: orderData } = parsed.data;

    // Check if order already exists
    const existingOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.externalId, orderData.external_id))
      .limit(1);

    const orderPayload = {
      storeId: auth.storeId,
      externalId: orderData.external_id,
      orderNumber: orderData.order_number,
      total: orderData.total.toString(),
      subtotal: orderData.subtotal.toString(),
      tax: orderData.tax.toString(),
      shipping: orderData.shipping.toString(),
      discount: orderData.discount.toString(),
      currency: orderData.currency,
      status: orderData.status,
      customerEmailHash: orderData.customer_email_hash,
      isNewCustomer: orderData.is_new_customer,
      paymentMethod: orderData.payment_method,
      attribution: orderData.attribution || null,
      surveyResponse: orderData.survey_response,
      surveySource: orderData.survey_source,
      dateCreated: new Date(orderData.date_created),
      dateCompleted: orderData.date_completed
        ? new Date(orderData.date_completed)
        : null,
    };

    if (existingOrders.length > 0) {
      // Update existing order
      await db
        .update(orders)
        .set(orderPayload)
        .where(eq(orders.id, existingOrders[0].id));
    } else {
      // Insert new order
      await db.insert(orders).values(orderPayload);
    }

    // Update store's last sync time
    await db
      .update(stores)
      .set({
        lastSyncAt: new Date(),
        status: "active",
      })
      .where(eq(stores.id, auth.storeId));

    return NextResponse.json({
      success: true,
      message: `Order ${orderData.order_number} ${existingOrders.length > 0 ? "updated" : "created"}`,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 },
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ status: "ok", service: "wab-webhook" });
}
