# WAB-P-002 Conversion Core

> **Status:** Approved
> **Author:** Claude
> **Created:** 2026-01-12
> **Updated:** 2026-01-12

## 1. Overview

### 1.1 Purpose
Handles WooCommerce order events and triggers conversion dispatch to all enabled integrations. This is the central orchestrator that connects order lifecycle hooks to the attribution system.

### 1.2 Scope
**Covers:**
- Hooking into WooCommerce order creation and status changes
- Saving attribution data from cookies to order meta
- Triggering conversion dispatch on appropriate order statuses
- Identity linking between visitors and customers
- New customer detection
- Attribution summary generation

**Does NOT cover:**
- Actual API calls to platforms (handled by WAB_Dispatcher)
- Cookie capture logic (handled by WAB_Cookie)
- Queue management (handled by WAB_Queue)

### 1.3 Dependencies
- `WAB_Cookie` - For retrieving attribution data
- `WAB_Dispatcher` - For sending conversions to integrations
- `WAB_Identity_Resolver` - Optional, for cross-device identity linking
- WooCommerce order system

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Save attribution data to order meta on checkout | Must |
| FR-002 | Link visitor ID to customer email on order creation | Must |
| FR-003 | Trigger conversion on order processing status | Should |
| FR-004 | Trigger conversion on order completed status | Must |
| FR-005 | Prevent duplicate conversion sends for same order | Must |
| FR-006 | Allow manual conversion trigger with force option | Must |
| FR-007 | Detect new vs returning customers | Should |
| FR-008 | Provide attribution summary for orders | Should |
| FR-009 | Support filtering via `wab_send_on_processing` hook | Should |
| FR-010 | Log debug information when debug mode enabled | Could |
| FR-011 | Handle orders without attribution data (direct visits) | Must |
| FR-012 | Detect device type from user agent | Should |
| FR-013 | Store dispatch results in order meta | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Order hook execution under 100ms | < 100ms per hook |
| NFR-002 | No blocking API calls in order hooks | Dispatch must be async-capable |
| NFR-003 | Graceful degradation if dependencies missing | Continue without errors |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     WooCommerce Order Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  checkout_order_created     →  on_order_created()               │
│  (woocommerce_checkout_      │  - Save attribution to meta      │
│   order_created)             │  - Link visitor to customer      │
│                              │  - Set capture timestamp          │
│                              ↓                                   │
│  order_status_processing   →  on_order_processing()             │
│  (woocommerce_order_status_  │  - Check wab_send_on_processing  │
│   processing)                │  - Call send_conversion()        │
│                              ↓                                   │
│  order_status_completed    →  on_order_completed()              │
│  (woocommerce_order_status_  │  - Call send_conversion()        │
│   completed)                 ↓                                   │
│                                                                  │
│                          send_conversion()                       │
│                          │  - Check already sent                │
│                          │  - Get attribution data              │
│                          │  - Call dispatcher                   │
│                          │  - Store results in meta             │
│                          ↓                                       │
│                     WAB_Dispatcher                               │
│                     (sends to all integrations)                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Structures

```php
class WAB_Conversion {
    private WAB_Cookie $cookie;
    private WAB_Dispatcher $dispatcher;

    public function __construct(WAB_Cookie $cookie, WAB_Dispatcher $dispatcher);
    public function on_order_created(int $order_id, array $posted_data, WC_Order $order): void;
    public function on_order_processing(int $order_id): void;
    public function on_order_completed(int $order_id): void;
    public function manual_send(int $order_id, bool $force = false): array;
    public function is_new_customer(WC_Order $order): bool;
    public function get_attribution_summary(int $order_id): ?array;
}
```

### 3.3 Order Meta Keys

| Meta Key | Type | Description |
|----------|------|-------------|
| `_wab_attribution` | array | Full attribution data from cookie |
| `_wab_captured_at` | int | Unix timestamp when attribution was saved |
| `_wab_visitor_id` | string | Visitor ID for identity resolution |
| `_wab_conversions_sent` | int | Unix timestamp when conversions were sent |
| `_wab_dispatch_results` | array | Results from each integration |
| `_wab_no_attribution` | bool | True if order had no attribution data |

---

## 4. Public Interface

### 4.1 Methods

#### `__construct(WAB_Cookie $cookie, WAB_Dispatcher $dispatcher)`

**Description:** Initialize with required dependencies.

**Parameters:**
- `$cookie` (WAB_Cookie): Cookie handler for attribution data
- `$dispatcher` (WAB_Dispatcher): Dispatcher for sending conversions

---

#### `on_order_created(int $order_id, array $posted_data, WC_Order $order): void`

**Description:** Hook callback for `woocommerce_checkout_order_created`. Saves attribution data to order meta immediately on checkout.

**Parameters:**
- `$order_id` (int): WooCommerce order ID
- `$posted_data` (array): Posted checkout form data
- `$order` (WC_Order): WooCommerce order object

**Side Effects:**
- Saves `_wab_attribution` to order meta
- Saves `_wab_captured_at` timestamp
- Saves `_wab_visitor_id` to order meta
- Links visitor to customer email in identity table

---

#### `on_order_processing(int $order_id): void`

**Description:** Hook callback for `woocommerce_order_status_processing`. Triggers conversion if `wab_send_on_processing` filter returns true.

**Parameters:**
- `$order_id` (int): WooCommerce order ID

**Filters Used:**
- `wab_send_on_processing` (bool, default: true) - Disable with `add_filter('wab_send_on_processing', '__return_false')`

---

#### `on_order_completed(int $order_id): void`

**Description:** Hook callback for `woocommerce_order_status_completed`. Always triggers conversion (unless already sent).

**Parameters:**
- `$order_id` (int): WooCommerce order ID

---

#### `manual_send(int $order_id, bool $force = false): array`

**Description:** Manually trigger conversion for an order. Useful for admin retry functionality.

**Parameters:**
- `$order_id` (int): WooCommerce order ID
- `$force` (bool): If true, clears `_wab_conversions_sent` flag and resends

**Returns:** Array of results from dispatcher, or `['error' => 'Order not found']` if order doesn't exist

**Example:**
```php
$conversion = new WAB_Conversion($cookie, $dispatcher);
$results = $conversion->manual_send(123, true); // Force resend
```

---

#### `is_new_customer(WC_Order $order): bool`

**Description:** Check if this is the customer's first order based on billing email.

**Parameters:**
- `$order` (WC_Order): WooCommerce order object

**Returns:** `true` if no previous orders with same email, `false` otherwise

**Note:** Returns `true` if billing email is empty (assumes new customer).

---

#### `get_attribution_summary(int $order_id): ?array`

**Description:** Get a summary of attribution data and dispatch results for an order.

**Parameters:**
- `$order_id` (int): WooCommerce order ID

**Returns:** Array with attribution summary, or `null` if order not found or no attribution

**Return Structure:**
```php
[
    'source'           => string,      // 'meta', 'google', 'tiktok', 'utm:source', 'direct'
    'click_id'         => string|null, // Primary click ID if present
    'utm'              => array|null,  // UTM parameters
    'first_touch'      => int|null,    // Unix timestamp of first touch
    'last_touch'       => int|null,    // Unix timestamp of last touch
    'landing_page'     => string|null, // Initial landing page URL
    'referrer'         => string|null, // External referrer
    'conversions_sent' => int|null,    // Timestamp when sent
    'dispatch_results' => array|null,  // Results from each integration
    'is_new_customer'  => bool,        // True if first order
]
```

### 4.2 Events/Hooks

| Hook Name | Type | Parameters | Description |
|-----------|------|------------|-------------|
| `wab_send_on_processing` | Filter | `bool $send` | Control whether to send on processing status |

### 4.3 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wab_debug_mode` | bool | `false` | Enable debug logging to error_log |

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| E001 | Order not found | Invalid order ID passed | Verify order exists |
| E002 | Conversions already sent | Duplicate send attempt | Use force=true to resend |

### 5.2 Logging

- **Level:** Debug (only when `wab_debug_mode` is true)
- **Format:** `[WAB] Order #ID - Message`
- **Destination:** WordPress error_log (usually `wp-content/debug.log`)

**Log Messages:**
- Order created with attribution keys
- Visitor linked to email
- Conversions already sent (skipped)
- No attribution data (direct order)
- Send results (count sent, queued, total)

---

## 6. Security Considerations

- **Order Access:** Uses `wc_get_order()` which respects WooCommerce access controls
- **Email Hashing:** Customer emails are hashed before storing in identity table
- **No PII in Logs:** Only logs attribution keys (not values) and hashed email prefixes
- **Input Sanitization:** All $_SERVER values sanitized before use
- **GDPR:** Attribution data stored as order meta (deleted with order)

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_on_order_created_saves_attribution | Attribution saved to order meta | `_wab_attribution` set on order |
| test_on_order_created_sets_capture_timestamp | Timestamp recorded | `_wab_captured_at` is current time |
| test_on_order_created_links_visitor_to_email | Identity resolver called | Visitor linked in database |
| test_on_order_processing_sends_conversion | Conversion triggered | Dispatcher called |
| test_on_order_processing_respects_filter | Filter can disable | Dispatcher NOT called when filtered |
| test_on_order_completed_sends_conversion | Conversion triggered | Dispatcher called |
| test_prevents_duplicate_sends | Second call skipped | Dispatcher called only once |
| test_manual_send_without_force | Already sent order skipped | Empty results returned |
| test_manual_send_with_force | Force resends conversion | Dispatcher called again |
| test_manual_send_invalid_order | Non-existent order | Returns error array |
| test_is_new_customer_first_order | Customer's first order | Returns true |
| test_is_new_customer_returning | Customer has previous orders | Returns false |
| test_is_new_customer_empty_email | No billing email | Returns true (assume new) |
| test_get_attribution_summary_with_fbclid | Meta source detected | Source is 'meta' |
| test_get_attribution_summary_with_gclid | Google source detected | Source is 'google' |
| test_get_attribution_summary_with_utm | UTM source used | Source is 'utm:sourcename' |
| test_get_attribution_summary_direct | No click IDs or UTM | Source is 'direct' |
| test_get_attribution_summary_invalid_order | Order not found | Returns null |
| test_orders_without_attribution_still_dispatched | Direct order handled | Dispatcher called with empty attribution |
| test_detect_device_type_mobile | Mobile user agent | Returns 'mobile' |
| test_detect_device_type_tablet | Tablet user agent | Returns 'tablet' |
| test_detect_device_type_desktop | Desktop user agent | Returns 'desktop' |
| test_debug_logging_when_enabled | Debug mode on | error_log called |
| test_no_debug_logging_when_disabled | Debug mode off | error_log not called |

### 7.2 Integration Tests

- Test full order flow: checkout → processing → completed → verify dispatch
- Test with real WAB_Cookie and mock WAB_Dispatcher
- Test identity resolution with real database

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `src/includes/class-wab-conversion.php`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `src/includes/class-wab-conversion.php` | Main implementation |
| `tests/Unit/ConversionTest.php` | Unit tests |

### 8.2 Hook Registration

Hooks are registered in `WAB_Loader`:

```php
$this->loader->add_action('woocommerce_checkout_order_created', $conversion, 'on_order_created', 10, 3);
$this->loader->add_action('woocommerce_order_status_processing', $conversion, 'on_order_processing');
$this->loader->add_action('woocommerce_order_status_completed', $conversion, 'on_order_completed');
```

### 8.3 Known Limitations

- Device detection only runs at order creation time (doesn't update on order view)
- Identity linking requires `WAB_Identity_Resolver` class to exist
- `is_new_customer()` queries database (may be slow for stores with many orders)

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial spec |
