<?php
/**
 * Queue manager for retry mechanism.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Queue
 *
 * Manages the retry queue for failed conversion sends.
 */
class WAB_Queue {

	/**
	 * Default retry intervals in seconds.
	 * 1 min, 5 min, 30 min, 2 hours, 12 hours
	 *
	 * @var array
	 */
	private const DEFAULT_RETRY_INTERVALS = [ 60, 300, 1800, 7200, 43200 ];

	/**
	 * Get retry intervals from settings.
	 *
	 * @return array
	 */
	private function get_retry_intervals(): array {
		$intervals = get_option( 'wab_queue_retry_intervals', self::DEFAULT_RETRY_INTERVALS );

		return is_array( $intervals ) ? $intervals : self::DEFAULT_RETRY_INTERVALS;
	}

	/**
	 * Add a job to the queue.
	 *
	 * @param int    $order_id    WooCommerce order ID.
	 * @param string $integration Integration name.
	 * @param array  $payload     Data to send.
	 * @return int|false Queue ID or false on failure.
	 */
	public function add( int $order_id, string $integration, array $payload ): int|false {
		if ( ! get_option( 'wab_queue_enabled', true ) ) {
			return false;
		}

		global $wpdb;

		$table        = $wpdb->prefix . 'wab_queue';
		$max_attempts = (int) get_option( 'wab_queue_max_attempts', 5 );
		$intervals    = $this->get_retry_intervals();

		// First retry after first interval.
		$next_retry = gmdate( 'Y-m-d H:i:s', time() + ( $intervals[0] ?? 60 ) );

		$result = $wpdb->insert(
			$table,
			[
				'order_id'     => $order_id,
				'integration'  => $integration,
				'payload'      => wp_json_encode( $payload ),
				'status'       => 'pending',
				'attempts'     => 0,
				'max_attempts' => $max_attempts,
				'next_retry'   => $next_retry,
			],
			[ '%d', '%s', '%s', '%s', '%d', '%d', '%s' ]
		);

		if ( $result === false ) {
			return false;
		}

		return $wpdb->insert_id;
	}

	/**
	 * Process pending queue items.
	 *
	 * Called by cron job.
	 */
	public function process_pending(): void {
		if ( ! get_option( 'wab_queue_enabled', true ) ) {
			return;
		}

		global $wpdb;

		$table = $wpdb->prefix . 'wab_queue';
		$limit = apply_filters( 'wab_queue_batch_size', 10 );

		// Get pending items ready for retry.
		$items = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table}
				WHERE status = 'pending'
				AND next_retry <= NOW()
				ORDER BY next_retry ASC
				LIMIT %d",
				$limit
			),
			ARRAY_A
		);

		if ( empty( $items ) ) {
			return;
		}

		foreach ( $items as $item ) {
			$this->process_item( $item );
		}
	}

	/**
	 * Process a single queue item.
	 *
	 * @param array $item Queue item data.
	 */
	private function process_item( array $item ): void {
		global $wpdb;

		$table       = $wpdb->prefix . 'wab_queue';
		$order_id    = (int) $item['order_id'];
		$integration = $item['integration'];
		$payload     = json_decode( $item['payload'], true );
		$attempts    = (int) $item['attempts'] + 1;
		$max_attempts = (int) $item['max_attempts'];

		// Get the order.
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			$this->mark_failed( $item['id'], 'Order not found' );
			return;
		}

		// Get the integration instance.
		$integration_instance = $this->get_integration( $integration );
		if ( ! $integration_instance ) {
			$this->mark_failed( $item['id'], 'Integration not found: ' . $integration );
			return;
		}

		// Attempt to send.
		$result = $integration_instance->send( $order, $payload );

		if ( $result['success'] ) {
			// Mark as completed.
			$wpdb->update(
				$table,
				[
					'status'   => 'completed',
					'attempts' => $attempts,
				],
				[ 'id' => $item['id'] ],
				[ '%s', '%d' ],
				[ '%d' ]
			);
		} else {
			// Check if we've exhausted retries.
			if ( $attempts >= $max_attempts ) {
				$this->mark_failed( $item['id'], $result['error'] ?? 'Max attempts reached' );
			} else {
				// Schedule next retry.
				$intervals  = $this->get_retry_intervals();
				$next_delay = $intervals[ $attempts ] ?? end( $intervals );
				$next_retry = gmdate( 'Y-m-d H:i:s', time() + $next_delay );

				$wpdb->update(
					$table,
					[
						'attempts'   => $attempts,
						'next_retry' => $next_retry,
						'last_error' => $result['error'] ?? 'Unknown error',
					],
					[ 'id' => $item['id'] ],
					[ '%d', '%s', '%s' ],
					[ '%d' ]
				);
			}
		}
	}

	/**
	 * Mark a queue item as failed.
	 *
	 * @param int    $queue_id Queue item ID.
	 * @param string $error    Error message.
	 */
	private function mark_failed( int $queue_id, string $error ): void {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_queue';

		$wpdb->update(
			$table,
			[
				'status'     => 'failed',
				'last_error' => $error,
			],
			[ 'id' => $queue_id ],
			[ '%s', '%s' ],
			[ '%d' ]
		);
	}

	/**
	 * Get an integration instance by name.
	 *
	 * @param string $name Integration name.
	 * @return WAB_Integration|null
	 */
	private function get_integration( string $name ): ?WAB_Integration {
		$class_map = [
			'meta'    => 'WAB_Meta',
			'google'  => 'WAB_Google_Ads',
			'tiktok'  => 'WAB_TikTok',
			'swetrix' => 'WAB_Swetrix',
		];

		if ( ! isset( $class_map[ $name ] ) || ! class_exists( $class_map[ $name ] ) ) {
			return null;
		}

		return new $class_map[ $name ]();
	}

	/**
	 * Get queue statistics.
	 *
	 * @return array Statistics.
	 */
	public function get_stats(): array {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_queue';

		$stats = $wpdb->get_results(
			"SELECT
				integration,
				status,
				COUNT(*) as count
			FROM {$table}
			GROUP BY integration, status",
			ARRAY_A
		);

		$organized = [
			'pending'   => 0,
			'completed' => 0,
			'failed'    => 0,
			'by_integration' => [],
		];

		foreach ( $stats as $row ) {
			$status      = $row['status'];
			$integration = $row['integration'];
			$count       = (int) $row['count'];

			$organized[ $status ] = ( $organized[ $status ] ?? 0 ) + $count;

			if ( ! isset( $organized['by_integration'][ $integration ] ) ) {
				$organized['by_integration'][ $integration ] = [
					'pending'   => 0,
					'completed' => 0,
					'failed'    => 0,
				];
			}
			$organized['by_integration'][ $integration ][ $status ] = $count;
		}

		return $organized;
	}

	/**
	 * Get pending items for an order.
	 *
	 * @param int $order_id WooCommerce order ID.
	 * @return array Queue items.
	 */
	public function get_order_queue( int $order_id ): array {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_queue';

		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE order_id = %d ORDER BY created_at DESC",
				$order_id
			),
			ARRAY_A
		) ?: [];
	}

	/**
	 * Retry a specific queue item immediately.
	 *
	 * @param int $queue_id Queue item ID.
	 * @return bool Success.
	 */
	public function retry_now( int $queue_id ): bool {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_queue';

		$item = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $queue_id ),
			ARRAY_A
		);

		if ( ! $item || $item['status'] !== 'pending' ) {
			return false;
		}

		$this->process_item( $item );

		return true;
	}

	/**
	 * Clear completed items older than specified days.
	 *
	 * @param int $days Number of days to keep.
	 * @return int Number of items deleted.
	 */
	public function cleanup( int $days = 30 ): int {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_queue';

		return $wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$table}
				WHERE status IN ('completed', 'failed')
				AND created_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
				$days
			)
		);
	}

	/**
	 * Cancel a pending queue item.
	 *
	 * @param int $queue_id Queue item ID.
	 * @return bool Success.
	 */
	public function cancel( int $queue_id ): bool {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_queue';

		$result = $wpdb->update(
			$table,
			[ 'status' => 'cancelled' ],
			[
				'id'     => $queue_id,
				'status' => 'pending',
			],
			[ '%s' ],
			[ '%d', '%s' ]
		);

		return $result !== false;
	}
}
