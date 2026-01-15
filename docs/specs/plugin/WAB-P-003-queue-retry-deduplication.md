# WAB-P-003 Queue, Retry & Deduplication

> **Status:** Approved
> **Author:** Claude
> **Created:** 2026-01-12
> **Updated:** 2026-01-12

## 1. Overview

### 1.1 Purpose
Provides reliable delivery of conversion events through a retry queue system and prevents duplicate sends through deduplication checks and logging. This module ensures that temporary API failures don't result in lost conversions.

### 1.2 Scope
**Covers:**
- Retry queue for failed conversion sends
- Exponential backoff retry scheduling
- Deduplication to prevent duplicate sends
- Event ID generation for platform-side deduplication
- Conversion logging with success/failure status
- Queue statistics and monitoring
- Cleanup of old records

**Does NOT cover:**
- Actual API calls to platforms (handled by integrations)
- Order event handling (handled by WAB_Conversion)
- Dispatcher orchestration (handled by WAB_Dispatcher)

### 1.3 Dependencies
- WordPress `$wpdb` for database operations
- WooCommerce `wc_get_order()` function
- Integration classes (WAB_Meta, WAB_Google_Ads, WAB_TikTok, WAB_Swetrix)
- Database tables: `wp_wab_queue`, `wp_wab_log`

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Queue failed conversions for later retry | Must |
| FR-002 | Process pending queue items via cron | Must |
| FR-003 | Implement exponential backoff retry schedule | Must |
| FR-004 | Mark items as failed after max attempts | Must |
| FR-005 | Check for duplicate sends before sending | Must |
| FR-006 | Generate unique event IDs for each send | Must |
| FR-007 | Generate stable event IDs for platform deduplication | Must |
| FR-008 | Log all send attempts (success and failure) | Must |
| FR-009 | Provide queue statistics by integration | Should |
| FR-010 | Allow manual retry of queue items | Should |
| FR-011 | Allow cancellation of pending queue items | Should |
| FR-012 | Clean up old completed/failed records | Should |
| FR-013 | Skip rapid retry attempts (cooldown) | Should |
| FR-014 | Configurable deduplication window | Should |
| FR-015 | Queue can be disabled via setting | Could |
| FR-016 | Configurable batch size for cron processing | Could |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Cron processing completes within 30 seconds | < 30s per batch |
| NFR-002 | Database queries are indexed | All WHERE clauses use indexes |
| NFR-003 | Log table supports high volume | Truncates response_body to 64KB |
| NFR-004 | Queue items persist across restarts | Stored in MySQL database |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Conversion Send Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WAB_Dispatcher                                                  │
│       │                                                          │
│       ├─→ WAB_Deduplication::is_duplicate()                     │
│       │   └── Check wab_log for recent success                  │
│       │                                                          │
│       ├─→ WAB_Deduplication::generate_stable_event_id()         │
│       │   └── Create event ID for platform dedup                │
│       │                                                          │
│       ├─→ Integration::send()                                   │
│       │   ├── Success → WAB_Deduplication::log_success()        │
│       │   └── Failure → WAB_Queue::add()                        │
│       │                 └── WAB_Deduplication::log_failure()    │
│       │                                                          │
│  Cron (wab_process_queue)                                        │
│       │                                                          │
│       └─→ WAB_Queue::process_pending()                          │
│           ├── Get pending items where next_retry <= NOW()        │
│           ├── For each item:                                     │
│           │   ├── Load integration class                         │
│           │   ├── Call send()                                    │
│           │   ├── Success → Mark completed                       │
│           │   └── Failure → Schedule next retry or mark failed  │
│           └── Return                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Retry Schedule

Default exponential backoff intervals:

| Attempt | Delay | Cumulative Time |
|---------|-------|-----------------|
| 1 | 1 minute | 1 min |
| 2 | 5 minutes | 6 min |
| 3 | 30 minutes | 36 min |
| 4 | 2 hours | 2h 36m |
| 5 | 12 hours | 14h 36m |

After 5 failed attempts, item is marked as `failed`.

### 3.3 Database Schema

```sql
-- Queue table (created in WAB_Activator)
CREATE TABLE wp_wab_queue (
    id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    order_id bigint(20) unsigned NOT NULL,
    integration varchar(50) NOT NULL,
    payload longtext NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'pending',
    attempts tinyint(3) unsigned NOT NULL DEFAULT 0,
    max_attempts tinyint(3) unsigned NOT NULL DEFAULT 5,
    next_retry datetime DEFAULT NULL,
    last_error text DEFAULT NULL,
    created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY order_id (order_id),
    KEY integration (integration),
    KEY status_next_retry (status, next_retry),
    KEY status (status)
);

-- Log table (created in WAB_Activator)
CREATE TABLE wp_wab_log (
    id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    order_id bigint(20) unsigned NOT NULL,
    integration varchar(50) NOT NULL,
    event_type varchar(50) NOT NULL DEFAULT 'purchase',
    event_id varchar(100) DEFAULT NULL,
    status varchar(20) NOT NULL,
    response_code smallint(5) unsigned DEFAULT NULL,
    response_body text DEFAULT NULL,
    click_ids text DEFAULT NULL,
    attribution_data text DEFAULT NULL,
    created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY order_id (order_id),
    KEY integration (integration),
    KEY event_id (event_id),
    KEY status (status),
    KEY created_at (created_at)
);
```

### 3.4 Status Values

**Queue Status:**
- `pending` - Waiting for next retry
- `completed` - Successfully sent
- `failed` - Exhausted all retries
- `cancelled` - Manually cancelled

**Log Status:**
- `success` - API call succeeded
- `failed` - API call failed
- `queued` - Added to retry queue

---

## 4. Public Interface

### 4.1 WAB_Queue Methods

#### `add(int $order_id, string $integration, array $payload): int|false`

**Description:** Add a failed conversion to the retry queue.

**Parameters:**
- `$order_id` (int): WooCommerce order ID
- `$integration` (string): Integration name (meta, google, tiktok, swetrix)
- `$payload` (array): Conversion data to retry

**Returns:** Queue item ID on success, `false` if queue is disabled or insert fails

---

#### `process_pending(): void`

**Description:** Process pending queue items ready for retry. Called by WordPress cron.

**Filters Used:**
- `wab_queue_batch_size` (int, default: 10) - Number of items to process per run

---

#### `get_stats(): array`

**Description:** Get queue statistics grouped by status and integration.

**Returns:**
```php
[
    'pending'   => int,
    'completed' => int,
    'failed'    => int,
    'by_integration' => [
        'meta' => ['pending' => int, 'completed' => int, 'failed' => int],
        'google' => [...],
    ]
]
```

---

#### `get_order_queue(int $order_id): array`

**Description:** Get all queue items for a specific order.

**Parameters:**
- `$order_id` (int): WooCommerce order ID

**Returns:** Array of queue items sorted by created_at DESC

---

#### `retry_now(int $queue_id): bool`

**Description:** Immediately process a specific pending queue item.

**Parameters:**
- `$queue_id` (int): Queue item ID

**Returns:** `true` if processed, `false` if not found or not pending

---

#### `cleanup(int $days = 30): int`

**Description:** Delete completed and failed items older than specified days.

**Parameters:**
- `$days` (int): Number of days to retain (default: 30)

**Returns:** Number of items deleted

---

#### `cancel(int $queue_id): bool`

**Description:** Cancel a pending queue item.

**Parameters:**
- `$queue_id` (int): Queue item ID

**Returns:** `true` if cancelled, `false` if not found or not pending

---

### 4.2 WAB_Deduplication Methods

#### `is_duplicate(int $order_id, string $integration, string $event_type = 'purchase'): bool`

**Description:** Check if a successful send exists within the deduplication window.

**Parameters:**
- `$order_id` (int): WooCommerce order ID
- `$integration` (string): Integration name
- `$event_type` (string): Event type (default: 'purchase')

**Returns:** `true` if duplicate, `false` if okay to send

---

#### `should_skip_recent_attempt(int $order_id, string $integration, int $cooldown = 60): bool`

**Description:** Check if any send attempt (success or failure) occurred recently. Prevents rapid retries.

**Parameters:**
- `$order_id` (int): WooCommerce order ID
- `$integration` (string): Integration name
- `$cooldown` (int): Cooldown period in seconds (default: 60)

**Returns:** `true` if should skip, `false` if okay to send

---

#### `generate_event_id(int $order_id, string $integration, string $event_type = 'purchase'): string`

**Description:** Generate a unique event ID for logging. Changes on each call.

**Returns:** Format: `{site_id}_{order_id}_{integration}_{event_type}_{timestamp}{random}`

---

#### `generate_stable_event_id(int $order_id, string $integration, string $event_type = 'purchase'): string`

**Description:** Generate a stable event ID that doesn't change on retry. Used for platform-side deduplication.

**Returns:** Format: `{site_id}_{order_id}_{integration}_{event_type}`

---

#### `log_success(...): void`

**Description:** Log a successful API send.

**Parameters:**
- `$order_id` (int)
- `$integration` (string)
- `$event_type` (string)
- `$event_id` (string)
- `$response_code` (int)
- `$response_body` (string)
- `$attribution_data` (array, optional)

---

#### `log_failure(...): void`

**Description:** Log a failed API send.

**Parameters:** Same as `log_success()`

---

#### `get_order_logs(int $order_id): array`

**Description:** Get all log entries for an order.

**Returns:** Array of log entries sorted by created_at DESC

---

#### `get_stats(string $period = 'today'): array`

**Description:** Get log statistics for a time period.

**Parameters:**
- `$period` (string): 'today', 'week', 'month', or 'all'

**Returns:**
```php
[
    'meta'   => ['success' => int, 'failed' => int, 'queued' => int],
    'google' => [...],
]
```

---

### 4.3 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wab_queue_enabled` | bool | `true` | Enable/disable retry queue |
| `wab_queue_max_attempts` | int | `5` | Maximum retry attempts |
| `wab_queue_retry_intervals` | array | `[60,300,1800,7200,43200]` | Retry delays in seconds |
| `wab_dedup_enabled` | bool | `true` | Enable/disable deduplication |
| `wab_dedup_window` | int | `3600` | Deduplication window in seconds |
| `wab_debug_mode` | bool | `false` | Enable debug logging |

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| E001 | Order not found | Order deleted after queue add | Item marked failed |
| E002 | Integration not found | Invalid integration name | Item marked failed |
| E003 | Max attempts reached | All retries exhausted | Item marked failed |
| E004 | Queue disabled | `wab_queue_enabled` is false | Returns false from add() |

### 5.2 Logging

- **Level:** Debug (only when `wab_debug_mode` is true)
- **Format:** `[WAB] STATUS: Order #ID to integration - event_type (HTTP code)`
- **Example:** `[WAB] SUCCESS: Order #123 to meta - purchase (HTTP 200)`

---

## 6. Security Considerations

- **SQL Injection:** All queries use `$wpdb->prepare()`
- **Response Body Truncation:** Limited to 64KB to prevent storage abuse
- **No Sensitive Data in Logs:** Click IDs extracted separately, full attribution stored as JSON
- **Integration Class Loading:** Only loads known classes from hardcoded map
- **Payload Storage:** JSON-encoded in database, decoded only when processing

---

## 7. Testing Requirements

### 7.1 Unit Tests - WAB_Queue

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_add_to_queue | Add item to queue | Returns queue ID |
| test_add_disabled | Queue disabled | Returns false |
| test_add_calculates_next_retry | First retry scheduled | Uses first interval |
| test_process_pending_empty | No pending items | Returns without error |
| test_process_pending_success | Item succeeds | Status becomes completed |
| test_process_pending_failure | Item fails | Attempts incremented, next_retry updated |
| test_process_pending_max_attempts | Max attempts reached | Status becomes failed |
| test_retry_intervals_exponential | Check retry timing | Uses correct interval for attempt |
| test_get_stats | Statistics query | Returns organized array |
| test_get_order_queue | Query by order | Returns matching items |
| test_retry_now_pending | Retry pending item | Processes and returns true |
| test_retry_now_not_pending | Retry non-pending | Returns false |
| test_cleanup_old_records | Delete old items | Returns count deleted |
| test_cancel_pending | Cancel pending item | Status becomes cancelled |
| test_cancel_not_pending | Cancel completed item | Returns false |
| test_get_integration_mapping | Valid integration | Returns instance |
| test_get_integration_unknown | Unknown integration | Returns null |

### 7.2 Unit Tests - WAB_Deduplication

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_is_duplicate_true | Recent success exists | Returns true |
| test_is_duplicate_false | No recent success | Returns false |
| test_is_duplicate_disabled | Dedup disabled | Returns false |
| test_is_duplicate_outside_window | Success outside window | Returns false |
| test_should_skip_recent_attempt | Recent attempt exists | Returns true |
| test_should_skip_no_recent | No recent attempt | Returns false |
| test_generate_event_id_unique | Generate multiple IDs | All different |
| test_generate_event_id_format | Check ID format | Matches expected pattern |
| test_generate_stable_event_id | Generate stable ID | Same on multiple calls |
| test_log_success | Log successful send | Row inserted with status=success |
| test_log_failure | Log failed send | Row inserted with status=failed |
| test_log_extracts_click_ids | Click IDs extracted | click_ids column populated |
| test_log_truncates_response | Long response body | Truncated to 64KB |
| test_get_order_logs | Query logs | Returns all logs for order |
| test_get_stats_today | Today's stats | Filters by date |
| test_get_stats_all | All time stats | No date filter |

### 7.3 Integration Tests

- Full flow: Add to queue → Cron runs → Item processed → Logged
- Deduplication prevents second send after success
- Retry escalates through all intervals then fails

### 7.4 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `src/includes/class-wab-queue.php`
  - `src/includes/class-wab-deduplication.php`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `src/includes/class-wab-queue.php` | Queue implementation |
| `src/includes/class-wab-deduplication.php` | Deduplication implementation |
| `tests/Unit/QueueTest.php` | Queue unit tests |
| `tests/Unit/DeduplicationTest.php` | Deduplication unit tests |

### 8.2 Cron Registration

Registered in `WAB_Activator::schedule_cron_events()`:

```php
wp_schedule_event(time(), 'wab_every_minute', 'wab_process_queue');
wp_schedule_event(time(), 'daily', 'wab_cleanup_old_logs');
```

Custom cron interval registered in main plugin file:

```php
add_filter('cron_schedules', function($schedules) {
    $schedules['wab_every_minute'] = [
        'interval' => 60,
        'display'  => 'Every Minute'
    ];
    return $schedules;
});
```

### 8.3 Known Limitations

- Queue processing is synchronous (one item at a time)
- No distributed locking (may process same item twice on overlapping crons)
- Cleanup runs daily, not continuously
- Event ID randomness uses `mt_rand()` (not cryptographically secure)

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-12 | Initial spec |
