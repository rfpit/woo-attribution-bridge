# WAB-P-004 Meta Conversions API (CAPI)

> **Status:** Approved
> **Author:** Claude
> **Created:** 2026-01-12
> **Updated:** 2026-01-12

## 1. Overview

### 1.1 Purpose
Sends purchase conversion events to Meta (Facebook/Instagram) Conversions API for attribution and ad optimization. This enables server-side tracking that bypasses ad blockers and iOS privacy restrictions.

### 1.2 Scope
**Covers:**
- Sending Purchase events to Meta CAPI
- User data hashing per Meta requirements
- fbclid to fbc format conversion
- Enhanced matching with email, phone, address
- Test event code support for development
- Deduplication via stable event IDs

**Does NOT cover:**
- Other event types (ViewContent, AddToCart, etc.)
- Browser pixel implementation
- Custom conversions or custom events
- Meta Business SDK integration

### 1.3 Dependencies
- `WAB_Integration` base class
- `WAB_Deduplication` for event ID generation and logging
- WooCommerce order system
- Meta Marketing API v18.0

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Send Purchase events to Meta CAPI | Must |
| FR-002 | Hash user data (email, phone, name, address) per Meta specs | Must |
| FR-003 | Convert fbclid to fbc format | Must |
| FR-004 | Support sending without fbclid via enhanced matching | Must |
| FR-005 | Include order value, currency, and items | Must |
| FR-006 | Use stable event_id for deduplication | Must |
| FR-007 | Support test_event_code for Events Manager testing | Should |
| FR-008 | Include client IP and user agent | Should |
| FR-009 | Support fbp (browser pixel ID) if available | Should |
| FR-010 | Log success/failure with response details | Must |
| FR-011 | Return success status with response code | Must |
| FR-012 | Validate required settings before send | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | API call timeout | 30 seconds max |
| NFR-002 | Hash algorithm | SHA256 (Meta requirement) |
| NFR-003 | API version | v18.0 (keep updated) |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Meta CAPI Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WAB_Dispatcher                                                  │
│       │                                                          │
│       └─→ WAB_Meta::should_send()                               │
│           │   Check enabled, configured                          │
│           │   Meta supports sending without fbclid               │
│           ↓                                                      │
│       WAB_Meta::prepare_payload()                               │
│           │   ├── get_user_data() - hash email, phone, etc.    │
│           │   ├── get_order_items() - format products          │
│           │   ├── generate_stable_event_id()                   │
│           │   └── format_fbc() - convert fbclid                │
│           ↓                                                      │
│       WAB_Meta::send()                                          │
│           │   POST to graph.facebook.com                        │
│           │                                                      │
│           ├── 200: log_success() → return success              │
│           └── Error: log_failure() → return failure            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 API Endpoint

```
POST https://graph.facebook.com/v18.0/{pixel_id}/events?access_token={token}
Content-Type: application/json
```

### 3.3 Request Payload Structure

```json
{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1704067200,
    "event_id": "abc123_456_meta_Purchase",
    "event_source_url": "https://example.com",
    "action_source": "website",
    "user_data": {
      "em": ["sha256_hash_of_email"],
      "ph": ["sha256_hash_of_phone"],
      "fn": ["sha256_hash_of_first_name"],
      "ln": ["sha256_hash_of_last_name"],
      "ct": ["sha256_hash_of_city"],
      "st": ["sha256_hash_of_state"],
      "zp": ["sha256_hash_of_zip"],
      "country": ["gb"],
      "fbc": "fb.1.1704067200000.AbCdEf123",
      "fbp": "fb.1.1704067200000.987654321",
      "client_ip_address": "1.2.3.4",
      "client_user_agent": "Mozilla/5.0..."
    },
    "custom_data": {
      "currency": "GBP",
      "value": 99.99,
      "order_id": "12345",
      "content_type": "product",
      "contents": [{
        "id": "SKU123",
        "quantity": 2,
        "item_price": 49.99
      }],
      "num_items": 1
    }
  }],
  "test_event_code": "TEST12345"
}
```

### 3.4 fbc Format

Format: `fb.{subdomain_index}.{creation_time_ms}.{fbclid}`

Example:
- Input: `AbCdEf123`
- Output: `fb.1.1704067200000.AbCdEf123`

If already in fbc format (starts with `fb.`), pass through unchanged.

---

## 4. Public Interface

### 4.1 Methods

#### `is_configured(): bool`

**Description:** Check if Meta integration has required settings.

**Returns:** `true` if both pixel_id and access_token are set

---

#### `get_required_settings(): array`

**Description:** Get list of required WordPress options.

**Returns:** `['wab_meta_pixel_id', 'wab_meta_access_token']`

---

#### `prepare_payload(WC_Order $order, array $attribution): array`

**Description:** Prepare the CAPI request payload from order and attribution data.

**Parameters:**
- `$order` (WC_Order): WooCommerce order
- `$attribution` (array): Attribution data including fbclid, fbp, utm params

**Returns:** Array with `data` key containing event array

**Hashing:** All user data is SHA256 hashed and lowercased per Meta requirements.

---

#### `send(WC_Order $order, array $payload): array`

**Description:** Send prepared payload to Meta CAPI.

**Parameters:**
- `$order` (WC_Order): WooCommerce order (for logging)
- `$payload` (array): Prepared payload from `prepare_payload()`

**Returns:**
```php
[
    'success'       => bool,
    'response_code' => int,     // HTTP status code
    'response_body' => string,  // API response
    'error'         => string,  // Only on failure
]
```

---

### 4.2 Inherited Methods (from WAB_Integration)

| Method | Description |
|--------|-------------|
| `get_id(): string` | Returns 'meta' |
| `get_name(): string` | Returns 'Meta (Facebook/Instagram)' |
| `is_enabled(): bool` | Checks `wab_meta_enabled` option |
| `should_send($order, $attribution): bool` | Checks enabled & configured |
| `get_click_id($attribution): ?string` | Returns `$attribution['fbclid']` |
| `get_user_data($order): array` | Extracts and hashes order billing data |
| `get_order_items($order): array` | Formats order items with SKU, qty, price |

### 4.3 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wab_meta_enabled` | bool | `false` | Enable Meta integration |
| `wab_meta_pixel_id` | string | - | Meta Pixel ID (required) |
| `wab_meta_access_token` | string | - | CAPI access token (required) |
| `wab_meta_test_event_code` | string | - | Test event code for Events Manager |

---

## 5. Error Handling

### 5.1 Error Codes

| HTTP Code | Meaning | Resolution |
|-----------|---------|------------|
| 200 | Success | Event accepted |
| 400 | Bad Request | Check payload format |
| 401 | Unauthorized | Check access token |
| 403 | Forbidden | Check pixel permissions |
| 429 | Rate Limited | Retry with backoff |
| 500 | Server Error | Retry later |

### 5.2 Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| "Invalid pixel_id" | Wrong pixel ID | Verify in Meta Events Manager |
| "Invalid access token" | Token expired/invalid | Generate new token |
| "Event not accepted" | Missing required fields | Check user_data has em or fbc |

### 5.3 Logging

All sends are logged via `WAB_Deduplication`:
- Success: `log_success()` with full response
- Failure: `log_failure()` with error message

Debug logs (when `wab_debug_mode` enabled):
- `[WAB] SUCCESS: Order #123 to meta - Purchase (HTTP 200)`
- `[WAB] FAILED: Order #123 to meta - Purchase (HTTP 400)`

---

## 6. Security Considerations

- **Access Token:** Stored in WordPress options (database), never exposed to frontend
- **User Data Hashing:** All PII hashed with SHA256 before transmission
- **Data Minimization:** Only send data required for attribution
- **HTTPS Only:** All API calls use HTTPS
- **Token Scope:** Use System User token with `ads_management` permission
- **IP/UA Collection:** Only collected server-side, not stored

### 6.1 Meta Data Requirements

Meta requires specific hashing:
1. Lowercase all strings before hashing
2. Trim whitespace before hashing
3. Phone numbers: digits only, no formatting
4. Postal codes: remove spaces and special characters

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_is_configured_true | Both settings present | Returns true |
| test_is_configured_missing_pixel | No pixel ID | Returns false |
| test_is_configured_missing_token | No access token | Returns false |
| test_prepare_payload_structure | Valid order | Has data array with event |
| test_prepare_payload_user_data_hashed | Check hashing | All user_data fields hashed |
| test_prepare_payload_fbc_formatted | fbclid present | Converted to fbc format |
| test_prepare_payload_fbc_passthrough | Already fbc format | Unchanged |
| test_prepare_payload_no_fbclid | Direct order | No fbc in user_data |
| test_prepare_payload_fbp_included | fbp in attribution | Included in user_data |
| test_prepare_payload_order_items | Order with products | contents array populated |
| test_prepare_payload_event_id_stable | Same order twice | Same event_id |
| test_send_success | API returns 200 | success=true, logged |
| test_send_failure | API returns 400 | success=false, error set |
| test_send_with_test_code | Test code set | test_event_code in payload |
| test_should_send_enabled_configured | All set | Returns true |
| test_should_send_disabled | Not enabled | Returns false |
| test_should_send_no_fbclid | Direct order | Returns true (supports without) |
| test_user_data_email_lowercase | Mixed case email | Lowercased before hash |
| test_user_data_phone_digits_only | Phone with formatting | Digits only |
| test_user_data_optional_fields | Empty phone | ph not in payload |

### 7.2 Integration Tests

- Test with Meta Events Manager Test Events
- Verify events appear in Events Manager
- Confirm deduplication with same event_id

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `src/integrations/class-wab-meta.php`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `src/integrations/class-wab-meta.php` | Meta CAPI implementation |
| `src/includes/class-wab-integration.php` | Base integration class |
| `tests/Unit/Integrations/MetaTest.php` | Unit tests |

### 8.2 API Version Updates

Meta deprecates API versions periodically. Current version is v18.0.
- Check Meta changelog quarterly
- Update `API_VERSION` constant when needed
- Test thoroughly before updating in production

### 8.3 Known Limitations

- Only sends Purchase event type
- Does not support Advanced Matching via frontend pixel
- No support for data processing options (LDU)
- No support for data_processing_options_country/state

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial spec |
