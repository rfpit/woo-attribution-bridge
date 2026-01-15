# WAB-P-006 TikTok Events API

> **Status:** Approved
> **Author:** Claude
> **Created:** 2026-01-12
> **Updated:** 2026-01-12

## 1. Overview

### 1.1 Purpose
Sends purchase conversion events (CompletePayment) to TikTok Events API for attribution and ad optimization. This enables server-side tracking that bypasses ad blockers and iOS privacy restrictions.

### 1.2 Scope
**Covers:**
- Sending CompletePayment events to TikTok Events API
- User matching via ttclid (click ID)
- Enhanced matching with hashed email and phone
- Browser pixel ID (_ttp) support
- Test event code support for development

**Does NOT cover:**
- Other event types (ViewContent, AddToCart, etc.)
- TikTok Pixel (browser-side tracking)
- Lead generation events
- Custom event definitions

### 1.3 Dependencies
- `WAB_Integration` base class
- `WAB_Deduplication` for event ID generation and logging
- WooCommerce order system
- TikTok Marketing API v1.3

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Send CompletePayment events to TikTok Events API | Must |
| FR-002 | Support ttclid for click attribution | Must |
| FR-003 | Support sending without ttclid via email/phone matching | Must |
| FR-004 | Hash email and phone per TikTok requirements | Must |
| FR-005 | Include order value, currency, and items | Must |
| FR-006 | Use stable event_id for deduplication | Must |
| FR-007 | Support _ttp (browser pixel ID) if available | Should |
| FR-008 | Include hashed external_id for user matching | Should |
| FR-009 | Include client IP and user agent | Should |
| FR-010 | Handle TikTok's error response format (code in body) | Must |
| FR-011 | Support test_event_code for Events Manager testing | Should |
| FR-012 | Log success/failure with response details | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | API call timeout | 30 seconds max |
| NFR-002 | Hash algorithm | SHA256 (TikTok requirement) |
| NFR-003 | API version | v1.3 |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TikTok Events API Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WAB_Dispatcher                                                  │
│       │                                                          │
│       └─→ WAB_TikTok::should_send()                             │
│           │   Check enabled, configured                          │
│           │   TikTok supports sending without ttclid            │
│           ↓                                                      │
│       WAB_TikTok::prepare_payload()                             │
│           │   ├── get_user_data() - hash email, phone           │
│           │   ├── get_order_items() - format products          │
│           │   ├── generate_stable_event_id()                   │
│           │   └── Build context with user, page, ip, ua        │
│           ↓                                                      │
│       WAB_TikTok::send()                                        │
│           │   POST to business-api.tiktok.com                   │
│           │                                                      │
│           ├── 200 + code=0: log_success()                       │
│           ├── 200 + code≠0: log_failure() (API error)          │
│           └── HTTP error: log_failure()                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 API Endpoint

```
POST https://business-api.tiktok.com/open_api/v1.3/pixel/track/
Content-Type: application/json
Access-Token: {access_token}
```

### 3.3 Request Payload Structure

```json
{
  "data": [{
    "pixel_code": "PIXEL123",
    "event": "CompletePayment",
    "event_id": "abc123_456_tiktok_CompletePayment",
    "timestamp": "1704067200",
    "context": {
      "page": {
        "url": "https://example.com/order-received/123/"
      },
      "user": {
        "email": "sha256_hash_of_email",
        "phone": "sha256_hash_of_phone",
        "ttclid": "click_id_from_tiktok",
        "ttp": "browser_pixel_id",
        "external_id": "sha256_hashed_order_id_with_salt",
        "ip": "1.2.3.4",
        "user_agent": "Mozilla/5.0..."
      },
      "ip": "1.2.3.4",
      "user_agent": "Mozilla/5.0..."
    },
    "properties": {
      "currency": "GBP",
      "value": 99.99,
      "contents": [{
        "content_id": "SKU123",
        "content_name": "Product Name",
        "content_type": "product",
        "quantity": 2,
        "price": 49.99
      }],
      "content_type": "product",
      "order_id": "12345"
    }
  }],
  "test_event_code": "TEST12345"
}
```

### 3.4 Response Format

TikTok returns HTTP 200 for all requests but includes an error code in the response body:

**Success:**
```json
{
  "code": 0,
  "message": "OK",
  "data": {}
}
```

**Error (still HTTP 200):**
```json
{
  "code": 40001,
  "message": "Invalid parameter: pixel_code"
}
```

Must check `response.code === 0` for actual success.

---

## 4. Public Interface

### 4.1 Methods

#### `is_configured(): bool`

**Description:** Check if TikTok integration has required settings.

**Returns:** `true` if both pixel_code and access_token are set

---

#### `get_required_settings(): array`

**Description:** Get list of required WordPress options.

**Returns:** `['wab_tiktok_pixel_code', 'wab_tiktok_access_token']`

---

#### `prepare_payload(WC_Order $order, array $attribution): array`

**Description:** Prepare the Events API request payload.

**Parameters:**
- `$order` (WC_Order): WooCommerce order
- `$attribution` (array): Attribution data including ttclid, _ttp

**Returns:** Single event object (not wrapped in data array yet)

**Note:** The `send()` method wraps this in the required `data` array.

---

#### `send(WC_Order $order, array $payload): array`

**Description:** Send prepared payload to TikTok Events API.

**Parameters:**
- `$order` (WC_Order): WooCommerce order
- `$payload` (array): Prepared payload from `prepare_payload()`

**Returns:**
```php
[
    'success'       => bool,
    'response_code' => int,     // HTTP status (usually 200)
    'response_body' => string,  // Full API response
    'error'         => string,  // Only on failure, includes TikTok error code
]
```

**Important:** HTTP 200 with `response.code !== 0` is treated as failure.

---

### 4.2 User Data Structure

| Field | Source | Format |
|-------|--------|--------|
| `email` | Billing email | SHA256 hashed, lowercase |
| `phone` | Billing phone | SHA256 hashed, digits only |
| `ttclid` | Attribution data | Raw value |
| `ttp` | Attribution data (`_ttp`) | Raw value |
| `external_id` | Order ID | SHA256 hashed with wp_salt() |
| `ip` | `$_SERVER` | Raw IP address |
| `user_agent` | `$_SERVER` | Raw user agent string |

### 4.3 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wab_tiktok_enabled` | bool | `false` | Enable TikTok integration |
| `wab_tiktok_pixel_code` | string | - | TikTok Pixel Code (required) |
| `wab_tiktok_access_token` | string | - | Events API access token (required) |
| `wab_tiktok_test_event_code` | string | - | Test event code for Events Manager |

---

## 5. Error Handling

### 5.1 TikTok Error Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| 0 | Success | Event accepted |
| 40001 | Invalid parameter | Check payload format |
| 40002 | Invalid pixel code | Verify pixel code |
| 40003 | Invalid access token | Generate new token |
| 40004 | Unauthorized | Check permissions |
| 40100 | Rate limit exceeded | Retry with backoff |
| 50000 | Server error | Retry later |

### 5.2 Error Response Handling

```php
// TikTok returns 200 with error in body
if ($response['code'] === 200) {
    $body = json_decode($response['body'], true);
    if ($body['code'] !== 0) {
        // This is actually an error
        $error = sprintf('TikTok Error %d: %s', $body['code'], $body['message']);
    }
}
```

### 5.3 Logging

All sends logged via `WAB_Deduplication`:
- Success (`code === 0`): `log_success()`
- API error (`code !== 0`): `log_failure()` with TikTok error message
- HTTP error: `log_failure()` with HTTP details

Debug logs (when `wab_debug_mode` enabled):
- `[WAB] SUCCESS: Order #123 to tiktok - CompletePayment (HTTP 200)`
- `[WAB] FAILED: Order #123 to tiktok - CompletePayment (HTTP 200)` (TikTok error)

---

## 6. Security Considerations

- **Access Token:** Stored in WordPress options, passed via header
- **User Data Hashing:** Email and phone SHA256 hashed before transmission
- **External ID:** Order ID hashed with WordPress salt for privacy
- **HTTPS Only:** All API calls use HTTPS
- **IP/UA Collection:** Only collected server-side, passed to TikTok for matching

### 6.1 TikTok Data Requirements

TikTok requires specific formatting:
1. Email: lowercase before hashing
2. Phone: digits only (no formatting) before hashing
3. external_id: should be hashed, unique per user

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_is_configured_true | Both settings present | Returns true |
| test_is_configured_missing_pixel | No pixel code | Returns false |
| test_is_configured_missing_token | No access token | Returns false |
| test_prepare_payload_structure | Valid order | Has all required fields |
| test_prepare_payload_user_hashed | Check hashing | email/phone hashed |
| test_prepare_payload_ttclid_included | ttclid present | In user object |
| test_prepare_payload_no_ttclid | Direct order | No ttclid field |
| test_prepare_payload_ttp_included | _ttp in attribution | ttp in user object |
| test_prepare_payload_external_id_hashed | Check external_id | SHA256 with salt |
| test_prepare_payload_contents | Order with products | contents array populated |
| test_prepare_payload_event_id_stable | Same order twice | Same event_id |
| test_prepare_payload_page_url | Check page.url | Order received URL |
| test_send_success | API returns code=0 | success=true |
| test_send_tiktok_error | API returns code≠0 | success=false, error contains code |
| test_send_http_error | API returns 500 | success=false |
| test_send_with_test_code | Test code set | test_event_code in body |
| test_should_send_enabled_configured | All set | Returns true |
| test_should_send_disabled | Not enabled | Returns false |
| test_should_send_no_ttclid | Direct order | Returns true (supports without) |
| test_context_includes_ip | IP available | ip in context |
| test_context_includes_user_agent | UA available | user_agent in context |
| test_properties_includes_order_id | Check properties | order_id present |

### 7.2 Integration Tests

- Test with TikTok Events Manager Test Events
- Verify events appear in Events Manager
- Confirm deduplication with same event_id

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `src/integrations/class-wab-tiktok.php`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `src/integrations/class-wab-tiktok.php` | TikTok Events implementation |
| `tests/Unit/Integrations/TikTokTest.php` | Unit tests |

### 8.2 Token Management

TikTok access tokens:
- Do not expire automatically
- Generated in TikTok Ads Manager
- Revocable in TikTok Ads Manager
- One token per pixel

### 8.3 Event Naming

TikTok uses different event names than Meta:
- Purchase → `CompletePayment`
- ViewContent → `ViewContent`
- AddToCart → `AddToCart`

Current implementation only supports `CompletePayment`.

### 8.4 Known Limitations

- Only sends CompletePayment event type
- No support for custom events
- No support for Lead events
- external_id uses WordPress salt (may change on migration)

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial spec |
