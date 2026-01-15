# WAB-D-002 Webhook Receiver

> **Status:** Implemented
> **Author:** Claude
> **Created:** 2026-01-14
> **Updated:** 2026-01-14

## 1. Overview

### 1.1 Purpose
The Webhook Receiver ingests order data from WooCommerce stores via the WAB plugin. It validates incoming webhooks, authenticates requests using API keys, and stores orders in the dashboard database for attribution analysis.

### 1.2 Scope
**Covers:**
- Order webhook ingestion (create, update, complete events)
- API key authentication
- Order upsert logic (insert or update)
- Store sync status updates
- Payload validation

**Does NOT cover:**
- Attribution processing (see WAB-D-003)
- Metrics aggregation (see WAB-D-004)
- Plugin-side webhook dispatch (see WAB-P-007)

### 1.3 Dependencies
- Drizzle ORM for database operations
- Zod for payload validation
- Store API keys from WAB-D-001

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Accept order webhooks via POST | Must |
| FR-002 | Authenticate requests using X-WAB-API-Key header | Must |
| FR-003 | Validate webhook payload structure | Must |
| FR-004 | Support order.created, order.updated, order.completed events | Must |
| FR-005 | Insert new orders into database | Must |
| FR-006 | Update existing orders (upsert by external_id) | Must |
| FR-007 | Store attribution data from payload | Must |
| FR-008 | Store survey response data | Should |
| FR-009 | Update store lastSyncAt on successful webhook | Must |
| FR-010 | Mark store as active after successful webhook | Must |
| FR-011 | Reject requests with invalid/missing API key | Must |
| FR-012 | Return success response with order details | Must |
| FR-013 | Provide health check endpoint | Should |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Webhook processing time < 500ms | P95 |
| NFR-002 | Support concurrent webhook requests | 100/second |
| NFR-003 | Idempotent processing (safe to retry) | 100% |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  WooCommerce    │────▶│  Webhook        │────▶│  PostgreSQL     │
│  Plugin         │     │  Receiver       │     │  (orders table) │
│  (WAB-P-007)    │     │  (Next.js API)  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       │                        │
       │                        ▼
       │                 ┌─────────────────┐
       └────────────────▶│  stores table   │
         X-WAB-API-Key   │  (validation)   │
                         └─────────────────┘
```

### 3.2 Data Structures

```typescript
// Webhook payload schema
const webhookPayloadSchema = z.object({
  event: z.enum(["order.created", "order.updated", "order.completed"]),
  order: z.object({
    external_id: z.string(),
    order_number: z.string(),
    total: z.number(),
    subtotal: z.number(),
    tax: z.number().default(0),
    shipping: z.number().default(0),
    discount: z.number().default(0),
    currency: z.string().default("GBP"),
    status: z.string(),
    customer_email_hash: z.string(),  // SHA256 hash of lowercase email
    is_new_customer: z.boolean().default(true),
    payment_method: z.string().optional(),
    attribution: z.record(z.unknown()).nullable().optional(),
    survey_response: z.string().nullable().optional(),
    survey_source: z.string().nullable().optional(),
    date_created: z.string(),          // ISO 8601
    date_completed: z.string().nullable().optional(),
  }),
});

// Attribution data structure
interface Attribution {
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  landing_page?: string;
  referrer?: string;
  visitor_id?: string;
}
```

### 3.3 Database Schema

```sql
-- Orders table (see schema.ts)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    external_id VARCHAR(100) NOT NULL,
    order_number VARCHAR(100) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    shipping DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
    status VARCHAR(50) NOT NULL,
    customer_email_hash VARCHAR(64) NOT NULL,
    is_new_customer BOOLEAN NOT NULL DEFAULT true,
    payment_method VARCHAR(100),
    attribution JSONB,
    survey_response VARCHAR(255),
    survey_source VARCHAR(100),
    date_created TIMESTAMP NOT NULL,
    date_completed TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX orders_store_id_idx ON orders(store_id);
CREATE INDEX orders_date_created_idx ON orders(date_created);
CREATE INDEX orders_customer_email_hash_idx ON orders(customer_email_hash);
```

### 3.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhook/orders` | Receive order webhook |
| GET | `/api/webhook/orders` | Health check |

---

## 4. Public Interface

### 4.1 Methods

#### `POST /api/webhook/orders`

**Description:** Receives order data from the WooCommerce plugin and stores it in the database.

**Authentication:** X-WAB-API-Key header (must match a store's API key)

**Request Headers:**
```
Content-Type: application/json
X-WAB-API-Key: wab_abc123...
```

**Request Body:**
```json
{
  "event": "order.created",
  "order": {
    "external_id": "12345",
    "order_number": "ORD-12345",
    "total": 99.99,
    "subtotal": 85.00,
    "tax": 8.50,
    "shipping": 6.49,
    "discount": 0,
    "currency": "GBP",
    "status": "completed",
    "customer_email_hash": "abc123...",
    "is_new_customer": true,
    "payment_method": "stripe",
    "attribution": {
      "fbclid": "AbCdEf123",
      "utm_source": "facebook",
      "utm_medium": "cpc"
    },
    "survey_response": "facebook",
    "survey_source": "Facebook/Instagram",
    "date_created": "2026-01-14T12:00:00Z",
    "date_completed": "2026-01-14T12:30:00Z"
  }
}
```

**Returns:** (200)
```json
{
  "success": true,
  "message": "Order ORD-12345 created"
}
```

**Update Returns:** (200)
```json
{
  "success": true,
  "message": "Order ORD-12345 updated"
}
```

**Errors:**
- 400: Invalid payload
- 401: Invalid or missing API key
- 500: Failed to process webhook

---

#### `GET /api/webhook/orders`

**Description:** Health check endpoint for monitoring.

**Returns:**
```json
{
  "status": "ok",
  "service": "wab-webhook"
}
```

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| 400 | Invalid payload | Request body doesn't match schema | Fix payload structure |
| 401 | Invalid or missing API key | No X-WAB-API-Key header or key not found | Configure correct API key |
| 500 | Failed to process webhook | Database error | Check server logs, retry |

### 5.2 Error Response Format

```json
{
  "error": "Invalid payload",
  "details": [
    {
      "path": ["order", "total"],
      "message": "Expected number, received string"
    }
  ]
}
```

### 5.3 Logging

- **Level:** Error for 5xx, Warning for 401
- **Format:** `[Webhook] [Event] [Order Number] [Status/Error]`
- **Destination:** Console (development), CloudWatch (production)

---

## 6. Security Considerations

- **Authentication:** API key in X-WAB-API-Key header
- **Authorization:** Key lookup in database validates store ownership
- **Idempotency:** Upsert by external_id prevents duplicate orders
- **Data Validation:** Zod schema validates all input
- **PII Handling:** Email stored as SHA256 hash only
- **SQL Injection:** Drizzle ORM prevents SQL injection
- **Rate Limiting:** Not implemented (consider adding for production)

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_webhook_creates_order | Valid payload creates new order | Returns 200 with "created" message |
| test_webhook_updates_order | Existing order is updated | Returns 200 with "updated" message |
| test_webhook_invalid_api_key | Wrong API key rejected | Returns 401 |
| test_webhook_missing_api_key | No API key header | Returns 401 |
| test_webhook_invalid_payload | Malformed payload | Returns 400 with details |
| test_webhook_missing_required | Missing required field | Returns 400 |
| test_webhook_updates_store_sync | Store lastSyncAt updated | Store has new lastSyncAt |
| test_webhook_activates_store | Store status set to active | Store status is "active" |
| test_webhook_handles_null_attribution | Null attribution accepted | Order created with null attribution |
| test_webhook_handles_partial_attribution | Partial attribution stored | Attribution JSONB has provided fields |
| test_webhook_order_created_event | order.created event | Order inserted |
| test_webhook_order_updated_event | order.updated event | Order updated |
| test_webhook_order_completed_event | order.completed event | Order updated with date_completed |
| test_health_check | GET request | Returns ok status |

### 7.2 Integration Tests

- Full webhook flow from plugin to database
- Concurrent webhook handling
- Upsert behavior verification

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `dashboard/src/app/api/webhook/orders/route.ts`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `dashboard/src/app/api/webhook/orders/route.ts` | Webhook receiver implementation |
| `dashboard/src/db/schema.ts` | Orders table schema |

### 8.2 API Key Verification

```typescript
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
```

### 8.3 Known Limitations

- No request signing/HMAC verification (API key only)
- No rate limiting
- No retry queue for failed database operations
- Attribution stored as-is (no validation of click ID formats)

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-14 | Initial spec |
