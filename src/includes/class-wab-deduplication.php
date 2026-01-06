<?php
/**
 * Deduplication handler to prevent duplicate conversion sends.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Deduplication
 *
 * Prevents sending the same conversion event multiple times to an integration.
 */
class WAB_Deduplication {

	/**
	 * Check if a conversion has already been sent.
	 *
	 * @param int    $order_id    WooCommerce order ID.
	 * @param string $integration Integration name (meta, google, tiktok, swetrix).
	 * @param string $event_type  Event type (purchase, add_to_cart, etc.).
	 * @return bool True if already sent, false if not.
	 */
	public function is_duplicate( int $order_id, string $integration, string $event_type = 'purchase' ): bool {
		if ( ! get_option( 'wab_dedup_enabled', true ) ) {
			return false;
		}

		global $wpdb;

		$table  = $wpdb->prefix . 'wab_log';
		$window = (int) get_option( 'wab_dedup_window', 3600 );

		// Check for successful send within the deduplication window.
		$result = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$table}
				WHERE order_id = %d
				AND integration = %s
				AND event_type = %s
				AND status = 'success'
				AND created_at > DATE_SUB(NOW(), INTERVAL %d SECOND)
				LIMIT 1",
				$order_id,
				$integration,
				$event_type,
				$window
			)
		);

		return $result !== null;
	}

	/**
	 * Check if an event should be skipped due to recent attempt.
	 *
	 * This is different from is_duplicate - it prevents rapid retries,
	 * not just duplicate successes.
	 *
	 * @param int    $order_id    WooCommerce order ID.
	 * @param string $integration Integration name.
	 * @param int    $cooldown    Cooldown period in seconds.
	 * @return bool True if should skip, false if okay to send.
	 */
	public function should_skip_recent_attempt( int $order_id, string $integration, int $cooldown = 60 ): bool {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_log';

		$result = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$table}
				WHERE order_id = %d
				AND integration = %s
				AND created_at > DATE_SUB(NOW(), INTERVAL %d SECOND)
				LIMIT 1",
				$order_id,
				$integration,
				$cooldown
			)
		);

		return $result !== null;
	}

	/**
	 * Generate a unique event ID for deduplication on the receiving platform.
	 *
	 * @param int    $order_id    WooCommerce order ID.
	 * @param string $integration Integration name.
	 * @param string $event_type  Event type.
	 * @return string Unique event ID.
	 */
	public function generate_event_id( int $order_id, string $integration, string $event_type = 'purchase' ): string {
		// Format: {site_id}_{order_id}_{integration}_{event_type}_{unique}
		$site_id = substr( md5( home_url() ), 0, 8 );

		// Use microtime + random for guaranteed uniqueness.
		$unique = sprintf( '%d%04x', time(), mt_rand( 0, 0xffff ) );

		return sprintf(
			'%s_%d_%s_%s_%s',
			$site_id,
			$order_id,
			$integration,
			$event_type,
			$unique
		);
	}

	/**
	 * Generate a stable event ID that doesn't change on retry.
	 *
	 * Used for platforms that use event_id for their own deduplication.
	 *
	 * @param int    $order_id    WooCommerce order ID.
	 * @param string $integration Integration name.
	 * @param string $event_type  Event type.
	 * @return string Stable event ID.
	 */
	public function generate_stable_event_id( int $order_id, string $integration, string $event_type = 'purchase' ): string {
		$site_id = substr( md5( home_url() ), 0, 8 );

		return sprintf(
			'%s_%d_%s_%s',
			$site_id,
			$order_id,
			$integration,
			$event_type
		);
	}

	/**
	 * Log a successful send.
	 *
	 * @param int    $order_id         WooCommerce order ID.
	 * @param string $integration      Integration name.
	 * @param string $event_type       Event type.
	 * @param string $event_id         Event ID sent.
	 * @param int    $response_code    HTTP response code.
	 * @param string $response_body    Response body.
	 * @param array  $attribution_data Attribution data sent.
	 */
	public function log_success(
		int $order_id,
		string $integration,
		string $event_type,
		string $event_id,
		int $response_code,
		string $response_body,
		array $attribution_data = []
	): void {
		$this->log( $order_id, $integration, $event_type, $event_id, 'success', $response_code, $response_body, $attribution_data );
	}

	/**
	 * Log a failed send.
	 *
	 * @param int    $order_id         WooCommerce order ID.
	 * @param string $integration      Integration name.
	 * @param string $event_type       Event type.
	 * @param string $event_id         Event ID sent.
	 * @param int    $response_code    HTTP response code.
	 * @param string $response_body    Response body (error message).
	 * @param array  $attribution_data Attribution data sent.
	 */
	public function log_failure(
		int $order_id,
		string $integration,
		string $event_type,
		string $event_id,
		int $response_code,
		string $response_body,
		array $attribution_data = []
	): void {
		$this->log( $order_id, $integration, $event_type, $event_id, 'failed', $response_code, $response_body, $attribution_data );
	}

	/**
	 * Log a conversion event.
	 *
	 * @param int    $order_id         WooCommerce order ID.
	 * @param string $integration      Integration name.
	 * @param string $event_type       Event type.
	 * @param string $event_id         Event ID.
	 * @param string $status           Status (success, failed, queued).
	 * @param int    $response_code    HTTP response code.
	 * @param string $response_body    Response body.
	 * @param array  $attribution_data Attribution data.
	 */
	private function log(
		int $order_id,
		string $integration,
		string $event_type,
		string $event_id,
		string $status,
		int $response_code,
		string $response_body,
		array $attribution_data
	): void {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_log';

		// Extract click IDs from attribution data.
		$click_ids = [];
		foreach ( [ 'fbclid', 'gclid', 'ttclid', 'msclkid' ] as $param ) {
			if ( isset( $attribution_data[ $param ] ) ) {
				$click_ids[ $param ] = $attribution_data[ $param ];
			}
		}

		$wpdb->insert(
			$table,
			[
				'order_id'         => $order_id,
				'integration'      => $integration,
				'event_type'       => $event_type,
				'event_id'         => $event_id,
				'status'           => $status,
				'response_code'    => $response_code,
				'response_body'    => mb_substr( $response_body, 0, 65535 ),
				'click_ids'        => wp_json_encode( $click_ids ),
				'attribution_data' => wp_json_encode( $attribution_data ),
			],
			[ '%d', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s' ]
		);

		// Debug logging.
		if ( get_option( 'wab_debug_mode', false ) ) {
			error_log( sprintf(
				'[WAB] %s: Order #%d to %s - %s (HTTP %d)',
				strtoupper( $status ),
				$order_id,
				$integration,
				$event_type,
				$response_code
			) );
		}
	}

	/**
	 * Get log entries for an order.
	 *
	 * @param int $order_id WooCommerce order ID.
	 * @return array Log entries.
	 */
	public function get_order_logs( int $order_id ): array {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_log';

		$results = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE order_id = %d ORDER BY created_at DESC",
				$order_id
			),
			ARRAY_A
		);

		return $results ?: [];
	}

	/**
	 * Get statistics for a time period.
	 *
	 * @param string $period Period (today, week, month, all).
	 * @return array Statistics.
	 */
	public function get_stats( string $period = 'today' ): array {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_log';

		$date_condition = match ( $period ) {
			'today' => 'DATE(created_at) = CURDATE()',
			'week'  => 'created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)',
			'month' => 'created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)',
			default => '1=1',
		};

		$stats = $wpdb->get_results(
			"SELECT
				integration,
				status,
				COUNT(*) as count
			FROM {$table}
			WHERE {$date_condition}
			GROUP BY integration, status",
			ARRAY_A
		);

		// Organize by integration.
		$organized = [];
		foreach ( $stats as $row ) {
			$integration = $row['integration'];
			if ( ! isset( $organized[ $integration ] ) ) {
				$organized[ $integration ] = [ 'success' => 0, 'failed' => 0, 'queued' => 0 ];
			}
			$organized[ $integration ][ $row['status'] ] = (int) $row['count'];
		}

		return $organized;
	}
}
