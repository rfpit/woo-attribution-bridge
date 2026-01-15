# WAB-P-005 Google Ads Offline Conversions

> **Status:** Approved
> **Author:** Claude
> **Created:** 2026-01-12
> **Updated:** 2026-01-12

## 1. Overview

### 1.1 Purpose
Sends purchase conversion events to Google Ads via the Offline Conversions API. This enables server-side tracking that improves Google's ad optimization by providing reliable conversion data that survives ad blockers and browser privacy restrictions.

### 1.2 Scope
**Covers:**
- Uploading click conversions via gclid
- Enhanced conversions with hashed user data
- OAuth token management and refresh
- Manager account (MCC) support
- Partial failure handling

**Does NOT cover:**
- Call conversions
- Store sales conversions
- Conversion adjustments
- GA4 Measurement Protocol (separate integration)

### 1.3 Dependencies
- `WAB_Integration` base class
- `WAB_Deduplication` for logging
- WooCommerce order system
- Google Ads API v15
- OAuth 2.0 for authentication

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Send click conversions with gclid | Must |
| FR-002 | Support enhanced conversions without gclid | Should |
| FR-003 | Include order value and currency | Must |
| FR-004 | Include order ID for deduplication | Must |
| FR-005 | Format datetime per Google requirements | Must |
| FR-006 | Hash user data for enhanced conversions | Must |
| FR-007 | Handle OAuth token refresh automatically | Must |
| FR-008 | Support manager account authentication | Should |
| FR-009 | Handle partial failure responses | Must |
| FR-010 | Log success/failure with response details | Must |
| FR-011 | Validate required settings before send | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | API call timeout | 30 seconds max |
| NFR-002 | Token refresh buffer | 5 minutes before expiry |
| NFR-003 | API version | v15 (keep updated) |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Google Ads Integration Flow                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WAB_Dispatcher                                                  │
│       │                                                          │
│       └─→ WAB_Google_Ads::should_send()                         │
│           │   Check enabled, configured                          │
│           │   Requires gclid unless enhanced_conversions=true   │
│           ↓                                                      │
│       WAB_Google_Ads::prepare_payload()                         │
│           │   ├── Format conversion datetime                    │
│           │   ├── Build conversion resource name                │
│           │   └── Add userIdentifiers if enhanced               │
│           ↓                                                      │
│       WAB_Google_Ads::send()                                    │
│           │   ├── maybe_refresh_token()                         │
│           │   └── POST to uploadClickConversions               │
│           │                                                      │
│           ├── 200 (no partial failure): log_success()          │
│           ├── 200 (partial failure): log_failure()             │
│           └── Error: log_failure()                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 API Endpoint

```
POST https://googleads.googleapis.com/v15/customers/{customer_id}:uploadClickConversions
Content-Type: application/json
Authorization: Bearer {access_token}
developer-token: {developer_token}
login-customer-id: {manager_customer_id}  # Optional, for MCC
```

### 3.3 Request Payload Structure

```json
{
  "conversions": [{
    "conversionAction": "customers/1234567890/conversionActions/987654321",
    "conversionDateTime": "2024-01-15 10:30:00+00:00",
    "conversionValue": 99.99,
    "currencyCode": "GBP",
    "orderId": "12345",
    "gclid": "CjwKCAiA-...",
    "userIdentifiers": [
      {"hashedEmail": "sha256_hash"},
      {"hashedPhoneNumber": "sha256_hash"},
      {"addressInfo": {
        "hashedFirstName": "sha256_hash",
        "hashedLastName": "sha256_hash",
        "city": "london",
        "state": "greater london",
        "postalCode": "sw1a1aa",
        "countryCode": "GB"
      }}
    ]
  }],
  "partialFailure": true
}
```

### 3.4 Datetime Format

Format: `yyyy-MM-dd HH:mm:ss+|-HH:mm`

Example: `2024-01-15 10:30:00+00:00`

Uses order creation date with timezone offset.

### 3.5 Conversion Action Resource Name

Format: `customers/{customer_id}/conversionActions/{action_id}`

Customer ID must have dashes removed (e.g., `123-456-7890` → `1234567890`).

---

## 4. Public Interface

### 4.1 Methods

#### `is_configured(): bool`

**Description:** Check if Google Ads integration has required settings.

**Returns:** `true` if customer_id, conversion_action_id, and access_token are set

---

#### `get_required_settings(): array`

**Description:** Get list of required WordPress options.

**Returns:**
```php
[
    'wab_google_customer_id',
    'wab_google_conversion_action_id',
    'wab_google_access_token',
]
```

---

#### `prepare_payload(WC_Order $order, array $attribution): array`

**Description:** Prepare the upload click conversions payload.

**Parameters:**
- `$order` (WC_Order): WooCommerce order
- `$attribution` (array): Attribution data including gclid

**Returns:** Array with `conversions` and `partialFailure` keys

---

#### `send(WC_Order $order, array $payload): array`

**Description:** Send conversion to Google Ads API.

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

**Note:** A 200 response with `partialFailureError` is treated as failure.

---

### 4.2 Private Methods

#### `format_google_datetime(WC_DateTime $date): string`

Formats WooCommerce datetime to Google's required format with timezone.

#### `build_user_identifiers(array $user_data): array`

Builds userIdentifiers array for enhanced conversions.

#### `maybe_refresh_token(string $current_token): string`

Checks token expiry and refreshes if needed (5-minute buffer).

---

### 4.3 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wab_google_enabled` | bool | `false` | Enable Google Ads integration |
| `wab_google_customer_id` | string | - | Google Ads customer ID (required) |
| `wab_google_conversion_action_id` | string | - | Conversion action ID (required) |
| `wab_google_access_token` | string | - | OAuth access token (required) |
| `wab_google_refresh_token` | string | - | OAuth refresh token |
| `wab_google_client_id` | string | - | OAuth client ID |
| `wab_google_client_secret` | string | - | OAuth client secret |
| `wab_google_token_expires_at` | int | `0` | Token expiry timestamp |
| `wab_google_developer_token` | string | - | API developer token |
| `wab_google_login_customer_id` | string | - | Manager account ID (MCC) |
| `wab_google_enhanced_conversions` | bool | `false` | Enable enhanced conversions |

---

## 5. Error Handling

### 5.1 HTTP Error Codes

| HTTP Code | Meaning | Resolution |
|-----------|---------|------------|
| 200 | Success | Check for partialFailureError |
| 401 | Unauthorized | Token expired, will auto-refresh |
| 403 | Forbidden | Check permissions/developer token |
| 400 | Bad Request | Check payload format |
| 429 | Rate Limited | Retry with backoff |

### 5.2 Partial Failure

Google Ads API returns 200 even if individual conversions fail. Check response for:

```json
{
  "partialFailureError": {
    "code": 3,
    "message": "CONVERSION_ACTION_DOES_NOT_EXIST: The conversion action specified...",
    "details": [...]
  }
}
```

If `partialFailureError` is present, treat as failure.

### 5.3 Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| CONVERSION_ACTION_DOES_NOT_EXIST | Invalid action ID | Verify in Google Ads UI |
| GCLID_DATE_TIME_PAIR_ALREADY_EXISTS | Duplicate | Skip, already recorded |
| INVALID_GCLID_FORMAT | Bad gclid | Verify capture logic |
| CUSTOMER_NOT_FOUND | Wrong customer ID | Verify customer ID |
| AUTHENTICATION_ERROR | Bad token | Token refresh should handle |

### 5.4 Logging

All sends logged via `WAB_Deduplication`:
- Success without partial failure: `log_success()`
- Success with partial failure: `log_failure()` with error message
- HTTP error: `log_failure()` with error details

---

## 6. Security Considerations

- **OAuth Tokens:** Stored in WordPress options, auto-refresh implemented
- **Client Secret:** Stored in options, not exposed to frontend
- **Developer Token:** Required for API access, keep confidential
- **User Data Hashing:** SHA256 for enhanced conversion PII
- **HTTPS Only:** All API calls use HTTPS
- **MCC Support:** Optional separate login-customer-id for agency setups

### 6.1 Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Check token_expires_at > now + 300 (5 min buffer)          │
│     └─→ If valid, use current token                            │
│                                                                  │
│  2. If expired, POST to oauth2.googleapis.com/token            │
│     ├── client_id                                               │
│     ├── client_secret                                           │
│     ├── refresh_token                                           │
│     └── grant_type=refresh_token                                │
│                                                                  │
│  3. Update wab_google_access_token                             │
│  4. Update wab_google_token_expires_at                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_is_configured_true | All settings present | Returns true |
| test_is_configured_missing_customer_id | No customer ID | Returns false |
| test_is_configured_missing_action_id | No conversion action | Returns false |
| test_is_configured_missing_token | No access token | Returns false |
| test_prepare_payload_structure | Valid order | Has conversions array |
| test_prepare_payload_conversion_action_format | Check resource name | Correct format |
| test_prepare_payload_customer_id_dashes_removed | ID with dashes | Dashes stripped |
| test_prepare_payload_datetime_format | Order datetime | Correct timezone format |
| test_prepare_payload_gclid_included | gclid present | In conversion object |
| test_prepare_payload_no_gclid | Direct order | No gclid field |
| test_prepare_payload_enhanced_conversions | Enhanced enabled | userIdentifiers added |
| test_prepare_payload_user_identifiers_hashed | Check hashing | Correct SHA256 hashes |
| test_send_success | API returns 200 | success=true |
| test_send_partial_failure | 200 with partialFailureError | success=false |
| test_send_http_error | API returns 400 | success=false |
| test_should_send_with_gclid | gclid present | Returns true |
| test_should_send_without_gclid | No gclid, no enhanced | Returns false |
| test_should_send_enhanced_no_gclid | No gclid, enhanced=true | Returns true |
| test_token_refresh_not_needed | Valid token | Returns same token |
| test_token_refresh_needed | Expired token | Returns new token |
| test_token_refresh_no_credentials | Missing client_secret | Returns original |
| test_format_datetime_with_timezone | Various timezones | Correct format |

### 7.2 Integration Tests

- Test with Google Ads API in test mode
- Verify conversions appear in Google Ads reports
- Test token refresh cycle

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `src/integrations/class-wab-google-ads.php`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `src/integrations/class-wab-google-ads.php` | Google Ads implementation |
| `tests/Unit/Integrations/GoogleAdsTest.php` | Unit tests |

### 8.2 API Version Updates

Google Ads API versions are deprecated regularly:
- Current version: v15
- Check Google Ads API changelog quarterly
- Update `API_VERSION` constant when needed
- Test thoroughly before updating in production

### 8.3 OAuth Setup

To use this integration, you need:
1. Google Cloud project with Google Ads API enabled
2. OAuth 2.0 credentials (client ID and secret)
3. Developer token from Google Ads (apply for access)
4. Complete OAuth flow to get refresh token

### 8.4 Known Limitations

- Only uploads click conversions (not call or store sales)
- No conversion adjustments support
- No attribution model selection (uses Google Ads account default)
- Enhanced conversions require separate configuration in Google Ads

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial spec |
