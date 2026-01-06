import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";

interface Params {
  params: Promise<{ email_hash: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email_hash } = await params;

    // Validate email hash format (64 hex characters)
    if (!/^[a-f0-9]{64}$/.test(email_hash)) {
      return NextResponse.json(
        { error: "Invalid email hash format" },
        { status: 400 },
      );
    }

    // Get user's stores
    const userStores = await db
      .select()
      .from(stores)
      .where(eq(stores.userId, session.user.id));

    if (userStores.length === 0) {
      return NextResponse.json(
        { error: "No stores connected" },
        { status: 404 },
      );
    }

    // For now, use the first store
    // In a multi-store setup, you'd aggregate across stores
    const store = userStores[0];

    // Fetch identity data from store's API
    const response = await fetch(
      `${store.url}/wp-json/wab/v1/identity/${email_hash}`,
      {
        headers: {
          ...(store.apiKey && { "X-WAB-API-Key": store.apiKey }),
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "No identity data found for this customer" },
          { status: 404 },
        );
      }
      throw new Error(`Store API returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Identity API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch identity data" },
      { status: 500 },
    );
  }
}
