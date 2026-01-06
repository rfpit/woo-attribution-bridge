import { NextResponse } from "next/server";
import { verifyWebhook, webhookHandlers } from "@/lib/shopify/webhooks";

export async function POST(request: Request) {
  try {
    // Get webhook headers
    const topic = request.headers.get("x-shopify-topic");
    const shop = request.headers.get("x-shopify-shop-domain");
    const hmac = request.headers.get("x-shopify-hmac-sha256");

    if (!topic || !shop || !hmac) {
      console.error("[Shopify Webhook] Missing required headers");
      return NextResponse.json(
        { error: "Missing required headers" },
        { status: 400 },
      );
    }

    // Get raw body for signature verification
    const body = await request.text();

    // Verify webhook signature
    if (!verifyWebhook(body, hmac)) {
      console.error("[Shopify Webhook] Invalid signature");
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 },
      );
    }

    // Parse body
    const payload = JSON.parse(body);

    // Find handler for this topic
    const handler = webhookHandlers[topic];

    if (!handler) {
      console.log(`[Shopify Webhook] No handler for topic: ${topic}`);
      // Return success anyway to acknowledge receipt
      return NextResponse.json({ success: true, topic, handled: false });
    }

    // Process webhook asynchronously
    // We return success immediately to avoid timeout
    handler(shop, payload).catch((error) => {
      console.error(`[Shopify Webhook] Handler error for ${topic}:`, error);
    });

    return NextResponse.json({ success: true, topic, handled: true });
  } catch (error) {
    console.error("[Shopify Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
