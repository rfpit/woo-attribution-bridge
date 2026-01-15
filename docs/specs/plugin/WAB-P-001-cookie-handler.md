# WAB-P-001 Cookie Handler

> **Status:** Implemented
> **Author:** Claude (retrofitted from implementation)
> **Created:** 2026-01-12
> **Updated:** 2026-01-12

## 1. Overview

### 1.1 Purpose
The Cookie Handler captures ad platform click IDs and UTM parameters from incoming URLs, stores them in first-party cookies, and persists attribution data to WooCommerce orders at checkout. This enables server-side conversion tracking that survives ad blockers and iOS privacy restrictions.

### 1.2 Scope
**Covers:**
- Click ID extraction from URL parameters (fbclid, gclid, ttclid, msclkid, dclid, li_fat_id)
- UTM parameter extraction (utm_source, utm_medium, utm_campaign, utm_term, utm_content)
- First-party cookie storage with configurable expiry
- Visitor ID generation and persistence
- First-touch and last-touch attribution tracking
- Landing page and referrer capture
- Order meta persistence at checkout
- Touchpoint recording to database
- Identity graph linkage (visitor → email)

**Does NOT cover:**
- Server-side API calls to ad platforms (see WAB-P-004, WAB-P-005, WAB-P-006)
- Multi-touch attribution calculations (see WAB-P-003)
- Admin UI settings (see WAB-P-008)

### 1.3 Dependencies
- WordPress 6.0+
- WooCommerce 8.0+
- PHP 8.0+
- Database tables: `wp_wab_touchpoints`, `wp_wab_identities`

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Capture fbclid, gclid, ttclid, msclkid, dclid, li_fat_id from URL | Must |
| FR-002 | Capture utm_source, utm_medium, utm_campaign, utm_term, utm_content | Must |
| FR-003 | Store attribution data in first-party HttpOnly cookie | Must |
| FR-004 | Generate and persist unique visitor ID per browser | Must |
| FR-005 | Track first-touch attribution (first click ID seen) | Must |
| FR-006 | Track last-touch attribution (most recent click ID) | Must |
| FR-007 | Capture landing page URL on first visit | Should |
| FR-008 | Capture external referrer on first visit | Should |
| FR-009 | Save attribution data to order meta at checkout | Must |
| FR-010 | Record touchpoints to database for journey analysis | Should |
| FR-011 | Link visitor ID to email hash on order completion | Should |
| FR-012 | Allow per-click-ID enable/disable via settings | Could |
| FR-013 | Skip processing in admin and AJAX contexts | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Cookie size must be reasonable | < 4KB |
| NFR-002 | No external HTTP calls on page load | 0 external requests |
| NFR-003 | Cookie must survive browser sessions | 90 days default |
| NFR-004 | IP addresses must be hashed for privacy | SHA-256 with salt |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  User arrives   │────▶│   WAB_Cookie     │────▶│  Browser Cookie │
│  with ?fbclid=  │     │  capture_click_  │     │  wab_attribution│
└─────────────────┘     │      ids()       │     └─────────────────┘
                        └──────────────────┘
                                │
                                │ (on each visit)
                                ▼
                        ┌──────────────────┐
                        │  record_         │────▶ wp_wab_touchpoints
                        │  touchpoint()    │
                        └──────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Order placed   │────▶│   WAB_Cookie     │────▶│  Order meta:    │
│  (checkout)     │     │  save_to_order() │     │  _wab_attribution│
└─────────────────┘     └──────────────────┘     │  _wab_visitor_id │
                                │               │  _wab_fbclid     │
                                │               └─────────────────┘
                                ▼
                        ┌──────────────────┐
                        │  link_visitor_   │────▶ wp_wab_identities
                        │  to_email()      │
                        └──────────────────┘
```

### 3.2 Data Structures

```php
class WAB_Cookie {
    /**
     * Click ID parameter to platform mapping.
     */
    private const CLICK_ID_PARAMS = [
        'fbclid'    => 'meta',
        'gclid'     => 'google',
        'ttclid'    => 'tiktok',
        'msclkid'   => 'microsoft',
        'dclid'     => 'google_display',
        'li_fat_id' => 'linkedin',
    ];

    /**
     * UTM parameters to capture.
     */
    private const UTM_PARAMS = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
    ];
}
```

**Cookie Structure (JSON):**
```json
{
    "fbclid": "ABC123...",
    "gclid": "DEF456...",
    "first_touch": {
        "fbclid": "ABC123...",
        "timestamp": 1704067200
    },
    "last_touch": {
        "gclid": "DEF456...",
        "timestamp": 1704153600
    },
    "utm": {
        "utm_source": "facebook",
        "utm_medium": "cpc",
        "utm_campaign": "winter_sale"
    },
    "landing_page": "https://store.com/product?fbclid=ABC123",
    "referrer": "https://facebook.com"
}
```

### 3.3 Database Schema

```sql
-- Touchpoints table (created in WAB_Activator)
CREATE TABLE {prefix}wab_touchpoints (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    visitor_id VARCHAR(36) NOT NULL,
    session_id VARCHAR(36),
    touchpoint_type VARCHAR(50) NOT NULL,
    source VARCHAR(255),
    medium VARCHAR(255),
    campaign VARCHAR(255),
    click_id_type VARCHAR(20),
    click_id VARCHAR(255),
    landing_page TEXT,
    referrer TEXT,
    user_agent TEXT,
    ip_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_visitor (visitor_id),
    INDEX idx_created (created_at)
);

-- Identities table (created in WAB_Activator)
CREATE TABLE {prefix}wab_identities (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email_hash VARCHAR(64) NOT NULL,
    visitor_id VARCHAR(36) NOT NULL,
    device_type VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_identity (email_hash, visitor_id),
    INDEX idx_email (email_hash),
    INDEX idx_visitor (visitor_id)
);
```

---

## 4. Public Interface

### 4.1 Methods

#### `get_cookie_name(): string`

**Description:** Returns the attribution cookie name (configurable via settings).

**Returns:** Cookie name string (default: `wab_attribution`)

#### `get_visitor_cookie_name(): string`

**Description:** Returns the visitor ID cookie name.

**Returns:** `wab_visitor_id`

#### `get_cookie_expiry(): int`

**Description:** Returns cookie expiry in days.

**Returns:** Integer days (default: 90)

#### `capture_click_ids(): void`

**Description:** Main entry point. Extracts click IDs and UTM params from current URL, updates cookie with first/last touch, records touchpoint.

**Hooks into:** `template_redirect`

**Side effects:**
- Sets/updates `wab_attribution` cookie
- Sets `wab_visitor_id` cookie if not present
- Inserts row into `wp_wab_touchpoints` if click IDs found

#### `get_attribution_data(): array`

**Description:** Retrieves current attribution data from cookie.

**Returns:** Associative array of attribution data, or empty array if no cookie.

**Example:**
```php
$cookie = new WAB_Cookie();
$attribution = $cookie->get_attribution_data();
// ['fbclid' => 'ABC123', 'utm' => ['utm_source' => 'facebook'], ...]
```

#### `set_attribution_data(array $data): void`

**Description:** Stores attribution data in cookie.

**Parameters:**
- `$data` (array): Attribution data to store

#### `get_visitor_id(): ?string`

**Description:** Returns current visitor's UUID.

**Returns:** UUID string or null if not set.

#### `get_order_attribution(WC_Order $order): array`

**Description:** Gets attribution data for an order (from order meta or current cookie).

**Parameters:**
- `$order` (WC_Order): WooCommerce order object

**Returns:** Attribution data array

#### `save_to_order(WC_Order $order): void`

**Description:** Persists current attribution data to order meta.

**Parameters:**
- `$order` (WC_Order): WooCommerce order object

**Side effects:**
- Sets `_wab_attribution` order meta
- Sets `_wab_visitor_id` order meta
- Sets `_wab_{click_id}` for each captured click ID
- Inserts row into `wp_wab_identities`

#### `clear(): void`

**Description:** Removes attribution cookie.

### 4.2 WordPress Hooks Used

| Hook Name | Type | Priority | Description |
|-----------|------|----------|-------------|
| `template_redirect` | Action | 10 | Triggers `capture_click_ids()` |

### 4.3 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wab_cookie_name` | string | `wab_attribution` | Cookie name |
| `wab_cookie_expiry` | int | `90` | Cookie expiry in days |
| `wab_capture_fbclid` | bool | `true` | Capture Meta click ID |
| `wab_capture_gclid` | bool | `true` | Capture Google click ID |
| `wab_capture_ttclid` | bool | `true` | Capture TikTok click ID |
| `wab_capture_msclkid` | bool | `true` | Capture Microsoft click ID |
| `wab_capture_dclid` | bool | `true` | Capture Google Display click ID |
| `wab_capture_li_fat_id` | bool | `true` | Capture LinkedIn click ID |
| `wab_capture_utm` | bool | `true` | Capture UTM parameters |

---

## 5. Error Handling

### 5.1 Error Conditions

| Condition | Behavior | Logging |
|-----------|----------|---------|
| Invalid JSON in cookie | Return empty array | None (silent) |
| Missing visitor ID on touchpoint save | Skip insert | None |
| Database insert failure | Fail silently | wpdb error |
| Headers already sent | Cookie not set | None |

### 5.2 Graceful Degradation

- If cookies are disabled, attribution falls back to session
- If database tables don't exist, touchpoints/identity not recorded
- Plugin never breaks checkout or page loading

---

## 6. Security Considerations

- **HttpOnly cookies:** Attribution cookie is HttpOnly to prevent XSS access
- **Secure flag:** Set when site uses SSL
- **Input sanitization:** All URL parameters sanitized with `sanitize_text_field()`
- **IP hashing:** IP addresses hashed with SHA-256 + WordPress salt
- **Email hashing:** Emails hashed before storage in identity graph
- **No PII in cookies:** Only click IDs and UTM params, no personal data
- **GDPR compliance:** First-party data only, legitimate interest basis

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| `test_capture_fbclid` | URL with fbclid parameter | Cookie contains fbclid |
| `test_capture_multiple_click_ids` | URL with gclid and fbclid | Both stored in cookie |
| `test_capture_utm_params` | URL with all UTM params | utm array in cookie |
| `test_first_touch_preserved` | Second visit with different click ID | first_touch unchanged |
| `test_last_touch_updated` | Second visit with different click ID | last_touch updated |
| `test_visitor_id_generated` | First visit | UUID in visitor cookie |
| `test_visitor_id_preserved` | Return visit | Same UUID returned |
| `test_save_to_order` | Order with attribution | Order meta contains data |
| `test_skip_admin_context` | Admin page request | No cookie processing |
| `test_skip_ajax_context` | AJAX request | No cookie processing |
| `test_external_referrer_captured` | Visit from facebook.com | referrer stored |
| `test_internal_referrer_ignored` | Visit from same site | referrer not stored |
| `test_landing_page_captured` | First visit | landing_page stored |
| `test_landing_page_preserved` | Return visit | landing_page unchanged |
| `test_ip_hashed` | Touchpoint recorded | ip_hash is SHA-256 |
| `test_device_type_detection` | Mobile user agent | device_type = mobile |
| `test_identity_linked` | Order with email | identity row created |

### 7.2 Integration Tests

- Full flow: Visit with click ID → browse → checkout → verify order meta
- Cross-session: Visit → close browser → return → verify cookie persists
- Multi-touchpoint: Visit from Meta → later from Google → verify journey

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target file:** `src/includes/class-wab-cookie.php`
- **Test file:** `tests/Unit/CookieTest.php`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `src/includes/class-wab-cookie.php` | Main implementation |
| `tests/Unit/CookieTest.php` | Unit tests |

### 8.2 Hook Registration

Hooks are registered in `WAB_Loader::define_public_hooks()`:

```php
$this->loader->add_action('template_redirect', $cookie, 'capture_click_ids');
```

Order meta is saved via `WAB_Conversion` which calls `$cookie->save_to_order()`.

### 8.3 Known Limitations

- Cookie size limit (~4KB) means very long journeys may be truncated
- Session ID relies on PHP sessions which may not work with all caching setups
- Visitor ID is per-browser, not cross-device (see Identity Resolution spec)

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial spec (retrofitted from implementation) |
