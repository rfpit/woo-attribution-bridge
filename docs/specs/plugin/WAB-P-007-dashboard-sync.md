# WAB-P-007 Dashboard Sync

> **Status:** Approved
> **Author:** Claude
> **Created:** 2026-01-12
> **Updated:** 2026-01-12

## 1. Overview

### 1.1 Purpose
Sends order and attribution data to the central WAB Dashboard for multi-store analytics, cross-platform attribution reporting, and campaign performance analysis. Unlike ad platform integrations, the dashboard receives ALL orders regardless of attribution.

### 1.2 Scope
**Covers:**
- Sending order events (created, updated, completed) to dashboard webhook
- Including full attribution data with each order
- Customer identification (new vs returning)
- Survey response inclusion
- API key authentication

**Does NOT cover:**
- Dashboard implementation (separate TypeScript project)
- Store registration/setup flow
- Dashboard UI components
- Multi-touch attribution calculation (done dashboard-side)

### 1.3 Dependencies
- `WAB_Integration` base class
- `WAB_Deduplication` for event ID generation and logging
- WooCommerce order system
- WAB Dashboard webhook endpoint

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Send all orders to dashboard (not just attributed) | Must |
| FR-002 | Include full attribution data when available | Must |
| FR-003 | Include order totals, tax, shipping, discounts | Must |
| FR-004 | Indicate new vs returning customer | Must |
| FR-005 | Include survey responses if available | Should |
| FR-006 | Send event type based on order status | Must |
| FR-007 | Authenticate using API key header | Must |
| FR-008 | Hash customer email before sending | Must |
| FR-009 | Support configurable dashboard URL | Must |
| FR-010 | Log success/failure with response details | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | API call timeout | 30 seconds max |
| NFR-002 | No PII transmitted | Email hashed only |
| NFR-003 | Idempotent | Same order can be sent multiple times |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dashboard Sync Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WooCommerce Store                       WAB Dashboard           │
│  ┌─────────────────┐                    ┌─────────────────┐     │
│  │                 │                    │                 │     │
│  │  Order Created  │──────────────────▶│  Webhook API    │     │
│  │  Order Updated  │   POST /api/      │  /orders        │     │
│  │  Order Complete │   webhook/orders  │                 │     │
│  │                 │   X-WAB-API-Key   │  ┌───────────┐  │     │
│  └─────────────────┘                    │  │  Store DB │  │     │
│                                         │  │  Orders   │  │     │
│  WAB_Dashboard::send()                  │  │  Metrics  │  │     │
│  ├── Check is_configured()             │  └───────────┘  │     │
│  ├── prepare_payload()                 │                 │     │
│  │   ├── Order data                    └─────────────────┘     │
│  │   ├── Attribution                                            │
│  │   ├── Survey response                                        │
│  │   └── Customer status                                        │
│  └── http_post() with API key                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 API Endpoint

```
POST {dashboard_url}/api/webhook/orders
Content-Type: application/json
X-WAB-API-Key: {api_key}
```

### 3.3 Request Payload Structure

```json
{
  "event": "order.completed",
  "order": {
    "external_id": "12345",
    "order_number": "ORD-12345",
    "total": 99.99,
    "subtotal": 85.00,
    "tax": 8.50,
    "shipping": 6.49,
    "discount": 0.00,
    "currency": "GBP",
    "status": "completed",
    "customer_email_hash": "sha256_hash_of_email",
    "is_new_customer": true,
    "payment_method": "stripe",
    "attribution": {
      "fbclid": "AbCdEf...",
      "gclid": null,
      "utm": {
        "utm_source": "facebook",
        "utm_medium": "cpc",
        "utm_campaign": "summer_sale"
      },
      "visitor_id": "wab_abc123",
      "first_touch": 1704067200,
      "last_touch": 1704153600,
      "landing_page": "https://example.com/product",
      "referrer": "https://facebook.com"
    },
    "survey_response": "facebook",
    "survey_source": "Facebook/Instagram",
    "date_created": "2024-01-15T10:30:00+00:00",
    "date_completed": "2024-01-15T11:00:00+00:00"
  }
}
```

### 3.4 Event Types

| Event | Trigger | Order Status |
|-------|---------|--------------|
| `order.created` | New order placed | any (fallback) |
| `order.updated` | Order status changed | processing, on-hold |
| `order.completed` | Order fulfilled | completed |

---

## 4. Public Interface

### 4.1 Methods

#### `is_configured(): bool`

**Description:** Check if dashboard integration has required settings.

**Returns:** `true` if both api_key and dashboard_url are set

---

#### `get_required_settings(): array`

**Description:** Get list of required WordPress options.

**Returns:** `['wab_api_key', 'wab_dashboard_url']`

---

#### `prepare_payload(WC_Order $order, array $attribution): array`

**Description:** Prepare the webhook payload with order and attribution data.

**Parameters:**
- `$order` (WC_Order): WooCommerce order
- `$attribution` (array): Attribution data (may be empty for direct orders)

**Returns:** Payload object with `event` and `order` keys

---

#### `send(WC_Order $order, array $payload): array`

**Description:** Send prepared payload to dashboard webhook.

**Parameters:**
- `$order` (WC_Order): WooCommerce order
- `$payload` (array): Prepared payload

**Returns:**
```php
[
    'success'       => bool,
    'response_code' => int,
    'response_body' => string,
    'error'         => string,  // Only on failure
]
```

---

### 4.2 Private Methods

#### `get_api_key(): string`

Returns the configured API key from WordPress options.

#### `get_dashboard_url(): string`

Returns the dashboard URL with trailing slash removed.

#### `is_new_customer(WC_Order $order): bool`

Checks if customer has any previous completed/processing orders.

#### `get_event_type(WC_Order $order): string`

Returns event type based on order status.

---

### 4.3 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wab_dashboard_enabled` | bool | `false` | Enable dashboard sync |
| `wab_api_key` | string | - | Store API key (required) |
| `wab_dashboard_url` | string | - | Dashboard base URL (required) |

---

## 5. Error Handling

### 5.1 HTTP Error Codes

| HTTP Code | Meaning | Resolution |
|-----------|---------|------------|
| 200/201 | Success | Order received |
| 400 | Bad Request | Check payload format |
| 401 | Unauthorized | Invalid API key |
| 404 | Not Found | Wrong dashboard URL |
| 500 | Server Error | Dashboard issue, retry later |

### 5.2 Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| "Invalid API key" | API key not found in dashboard | Register store properly |
| "Store not found" | API key doesn't match store | Verify API key |
| Connection timeout | Dashboard unreachable | Check URL, retry |

### 5.3 Logging

All sends logged via `WAB_Deduplication`:
- Success: `log_success()` with event type
- Failure: `log_failure()` with error details

Event types logged: `order.created`, `order.updated`, `order.completed`

---

## 6. Security Considerations

- **API Key:** Stored in WordPress options, sent via X-WAB-API-Key header
- **Email Hashing:** Customer email SHA256 hashed before transmission
- **No Raw PII:** Only hashed identifiers sent to dashboard
- **HTTPS Required:** Dashboard URL should always be HTTPS
- **Store Isolation:** Each store has unique API key, can only see own data

### 6.1 Data Sent to Dashboard

| Data | Purpose | Privacy |
|------|---------|---------|
| Order totals | Revenue reporting | Aggregate only |
| Order status | Funnel analysis | Non-PII |
| Email hash | Customer identification | Hashed, non-reversible |
| Attribution data | Campaign analysis | Marketing data |
| Survey responses | Attribution validation | Aggregate only |

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_is_configured_true | Both settings present | Returns true |
| test_is_configured_missing_key | No API key | Returns false |
| test_is_configured_missing_url | No dashboard URL | Returns false |
| test_prepare_payload_event_created | New order | event = order.created |
| test_prepare_payload_event_updated | Processing order | event = order.updated |
| test_prepare_payload_event_completed | Completed order | event = order.completed |
| test_prepare_payload_order_data | Check order fields | All fields present |
| test_prepare_payload_with_attribution | Attribution data | Included in payload |
| test_prepare_payload_without_attribution | Direct order | attribution = null |
| test_prepare_payload_customer_email_hashed | Check hash | SHA256 hash |
| test_prepare_payload_new_customer | First order | is_new_customer = true |
| test_prepare_payload_returning_customer | Has previous orders | is_new_customer = false |
| test_prepare_payload_survey_response | Survey answered | Included in payload |
| test_prepare_payload_no_survey | Survey not answered | survey_response = null |
| test_send_success | API returns 200 | success = true |
| test_send_failure | API returns 401 | success = false |
| test_send_includes_api_key | Check headers | X-WAB-API-Key present |
| test_send_correct_url | Check URL | Uses dashboard_url + /api/webhook/orders |
| test_should_send_always | No click ID needed | Returns true |
| test_supports_sending_without_click_id | Override method | Returns true |

### 7.2 Integration Tests

- Test end-to-end order → dashboard flow
- Verify orders appear in dashboard UI
- Test API key validation

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `src/integrations/class-wab-dashboard.php`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `src/integrations/class-wab-dashboard.php` | Dashboard sync implementation |
| `tests/Unit/Integrations/DashboardTest.php` | Unit tests |

### 8.2 Dashboard Webhook Endpoint

The dashboard receives webhooks at:
```
POST /api/webhook/orders
```

Request is validated against the `X-WAB-API-Key` header to identify the store.

### 8.3 Store Registration Flow

1. Store owner registers on dashboard
2. Dashboard generates API key for store
3. Store owner enters API key and dashboard URL in plugin settings
4. Plugin validates connection with test request
5. Orders start syncing automatically

### 8.4 Differences from Ad Platform Integrations

| Aspect | Ad Platforms | Dashboard |
|--------|--------------|-----------|
| Click ID required | Yes (usually) | No |
| Receives all orders | No (only attributed) | Yes |
| Event types | Purchase only | Multiple (created, updated, completed) |
| Survey data | Not sent | Included |
| Purpose | Attribution/optimization | Analytics/reporting |

### 8.5 Known Limitations

- No bulk historical sync (orders sync one at a time)
- No webhook retry queue (uses shared queue)
- No real-time status updates (event-driven only)

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial spec |
