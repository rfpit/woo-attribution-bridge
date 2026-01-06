<?php
/**
 * Identity Resolution Service.
 *
 * Links visitors across devices using email hashes and resolves
 * anonymous sessions to known customers for cross-device attribution.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Identity_Resolver
 *
 * Handles cross-device identity resolution and customer journey stitching.
 */
class WAB_Identity_Resolver {

	/**
	 * Get all visitor IDs associated with an email.
	 *
	 * @param string $email Customer email.
	 * @return array List of visitor IDs.
	 */
	public function get_visitors_by_email( string $email ): array {
		global $wpdb;

		$email_hash = $this->hash_email( $email );
		$table      = $wpdb->prefix . 'wab_identities';

		$results = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT DISTINCT visitor_id FROM {$table} WHERE email_hash = %s ORDER BY first_seen ASC",
				$email_hash
			)
		);

		return $results ?: [];
	}

	/**
	 * Get all touchpoints for a customer across all devices.
	 *
	 * @param string $email Customer email.
	 * @return array All touchpoints for this customer.
	 */
	public function get_customer_journey( string $email ): array {
		global $wpdb;

		$visitor_ids = $this->get_visitors_by_email( $email );

		if ( empty( $visitor_ids ) ) {
			return [];
		}

		$table        = $wpdb->prefix . 'wab_touchpoints';
		$placeholders = implode( ',', array_fill( 0, count( $visitor_ids ), '%s' ) );

		$touchpoints = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table}
				WHERE visitor_id IN ({$placeholders})
				ORDER BY created_at ASC",
				...$visitor_ids
			),
			ARRAY_A
		);

		return $touchpoints ?: [];
	}

	/**
	 * Calculate attribution across all customer devices.
	 *
	 * @param string $email Customer email.
	 * @return array Multi-touch attribution data.
	 */
	public function calculate_cross_device_attribution( string $email ): array {
		$journey = $this->get_customer_journey( $email );

		if ( empty( $journey ) ) {
			return [];
		}

		// Transform touchpoints into format expected by attribution models.
		$touchpoints = array_map( function ( $tp ) {
			$data = [
				'timestamp' => $tp['created_at'],
			];

			// Add click ID if present.
			if ( ! empty( $tp['click_id_type'] ) && ! empty( $tp['click_id'] ) ) {
				$data[ $tp['click_id_type'] ] = $tp['click_id'];
			}

			// Add UTM data if present.
			if ( ! empty( $tp['source'] ) ) {
				$data['utm_source'] = $tp['source'];
			}
			if ( ! empty( $tp['medium'] ) ) {
				$data['utm_medium'] = $tp['medium'];
			}
			if ( ! empty( $tp['campaign'] ) ) {
				$data['utm_campaign'] = $tp['campaign'];
			}

			// Add device info.
			$data['device_type'] = $this->detect_device_from_ua( $tp['user_agent'] ?? '' );
			$data['referrer']    = $tp['referrer'] ?? null;

			return $data;
		}, $journey );

		// Use touchpoint tracker to calculate attributions.
		$tracker = new WAB_Touchpoint_Tracker();
		return $tracker->calculate_attributions_from_array( $touchpoints );
	}

	/**
	 * Get identity graph for a customer.
	 *
	 * @param string $email Customer email.
	 * @return array Identity graph data.
	 */
	public function get_identity_graph( string $email ): array {
		global $wpdb;

		$email_hash = $this->hash_email( $email );
		$table      = $wpdb->prefix . 'wab_identities';

		$identities = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT visitor_id, device_type, first_seen, last_seen
				FROM {$table}
				WHERE email_hash = %s
				ORDER BY first_seen ASC",
				$email_hash
			),
			ARRAY_A
		);

		return [
			'email_hash'  => $email_hash,
			'identities'  => $identities ?: [],
			'device_count' => count( array_unique( array_column( $identities ?: [], 'device_type' ) ) ),
			'visitor_count' => count( $identities ?: [] ),
		];
	}

	/**
	 * Merge two visitors (when we discover they're the same person).
	 *
	 * @param string $primary_visitor   Primary visitor ID to keep.
	 * @param string $secondary_visitor Secondary visitor ID to merge.
	 * @return bool Success.
	 */
	public function merge_visitors( string $primary_visitor, string $secondary_visitor ): bool {
		global $wpdb;

		$identities_table  = $wpdb->prefix . 'wab_identities';
		$touchpoints_table = $wpdb->prefix . 'wab_touchpoints';

		// Start transaction.
		$wpdb->query( 'START TRANSACTION' );

		try {
			// Get primary visitor's email hash.
			$primary_email = $wpdb->get_var(
				$wpdb->prepare(
					"SELECT email_hash FROM {$identities_table} WHERE visitor_id = %s LIMIT 1",
					$primary_visitor
				)
			);

			if ( ! $primary_email ) {
				$wpdb->query( 'ROLLBACK' );
				return false;
			}

			// Update secondary visitor's identity to primary email.
			$wpdb->update(
				$identities_table,
				[ 'email_hash' => $primary_email ],
				[ 'visitor_id' => $secondary_visitor ],
				[ '%s' ],
				[ '%s' ]
			);

			$wpdb->query( 'COMMIT' );
			return true;

		} catch ( \Exception $e ) {
			$wpdb->query( 'ROLLBACK' );
			if ( get_option( 'wab_debug_mode', false ) ) {
				error_log( '[WAB] Merge visitors failed: ' . $e->getMessage() );
			}
			return false;
		}
	}

	/**
	 * Find potential duplicate identities that might be the same person.
	 *
	 * Looks for visitors with same device fingerprints or behavioral patterns.
	 *
	 * @param string $visitor_id Visitor ID to check.
	 * @return array Potential matches with confidence scores.
	 */
	public function find_potential_matches( string $visitor_id ): array {
		global $wpdb;

		$touchpoints_table = $wpdb->prefix . 'wab_touchpoints';
		$identities_table  = $wpdb->prefix . 'wab_identities';

		// Get visitor's touchpoints.
		$visitor_data = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT ip_hash, user_agent FROM {$touchpoints_table}
				WHERE visitor_id = %s
				LIMIT 10",
				$visitor_id
			),
			ARRAY_A
		);

		if ( empty( $visitor_data ) ) {
			return [];
		}

		$matches = [];

		// Find other visitors with same IP hash.
		$ip_hashes = array_unique( array_filter( array_column( $visitor_data, 'ip_hash' ) ) );

		if ( ! empty( $ip_hashes ) ) {
			$placeholders = implode( ',', array_fill( 0, count( $ip_hashes ), '%s' ) );

			$ip_matches = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT DISTINCT t.visitor_id, i.email_hash
					FROM {$touchpoints_table} t
					LEFT JOIN {$identities_table} i ON t.visitor_id = i.visitor_id
					WHERE t.ip_hash IN ({$placeholders})
					AND t.visitor_id != %s
					AND i.email_hash IS NOT NULL",
					...array_merge( $ip_hashes, [ $visitor_id ] )
				),
				ARRAY_A
			);

			foreach ( $ip_matches as $match ) {
				$matches[ $match['visitor_id'] ] = [
					'visitor_id'  => $match['visitor_id'],
					'email_hash'  => $match['email_hash'],
					'match_type'  => 'ip_hash',
					'confidence'  => 0.6,
				];
			}
		}

		return array_values( $matches );
	}

	/**
	 * Get customer insights from identity data.
	 *
	 * @param string $email Customer email.
	 * @return array Customer insights.
	 */
	public function get_customer_insights( string $email ): array {
		global $wpdb;

		$identity_graph  = $this->get_identity_graph( $email );
		$journey         = $this->get_customer_journey( $email );
		$touchpoints_table = $wpdb->prefix . 'wab_touchpoints';

		if ( empty( $journey ) ) {
			return [
				'first_touch_date' => null,
				'last_touch_date'  => null,
				'total_touchpoints' => 0,
				'devices_used'     => [],
				'channels_used'    => [],
				'avg_days_to_convert' => null,
			];
		}

		// Calculate insights.
		$first_touch = $journey[0];
		$last_touch  = end( $journey );

		$devices  = [];
		$channels = [];

		foreach ( $journey as $tp ) {
			if ( ! empty( $tp['user_agent'] ) ) {
				$device = $this->detect_device_from_ua( $tp['user_agent'] );
				$devices[ $device ] = ( $devices[ $device ] ?? 0 ) + 1;
			}

			$channel = $this->determine_channel( $tp );
			$channels[ $channel ] = ( $channels[ $channel ] ?? 0 ) + 1;
		}

		// Get order dates for this customer.
		$email_hash = $this->hash_email( $email );
		$orders_with_dates = wc_get_orders( [
			'meta_key'   => '_wab_visitor_id',
			'meta_value' => $identity_graph['identities'][0]['visitor_id'] ?? '',
			'limit'      => 10,
			'return'     => 'objects',
		] );

		$days_to_convert = [];
		$first_touch_time = strtotime( $first_touch['created_at'] );

		foreach ( $orders_with_dates as $order ) {
			$order_time = $order->get_date_created() ? $order->get_date_created()->getTimestamp() : null;
			if ( $order_time && $first_touch_time ) {
				$days_to_convert[] = ( $order_time - $first_touch_time ) / DAY_IN_SECONDS;
			}
		}

		return [
			'first_touch_date'    => $first_touch['created_at'],
			'last_touch_date'     => $last_touch['created_at'],
			'total_touchpoints'   => count( $journey ),
			'devices_used'        => $devices,
			'channels_used'       => $channels,
			'avg_days_to_convert' => ! empty( $days_to_convert ) ? round( array_sum( $days_to_convert ) / count( $days_to_convert ), 1 ) : null,
			'identity_graph'      => $identity_graph,
		];
	}

	/**
	 * Link a visitor to an email address.
	 *
	 * @param string $visitor_id Visitor ID.
	 * @param string $email      Customer email.
	 * @param string $device_type Device type.
	 * @return bool Success.
	 */
	public function link_visitor_to_email( string $visitor_id, string $email, string $device_type = 'unknown' ): bool {
		global $wpdb;

		if ( empty( $visitor_id ) || empty( $email ) ) {
			return false;
		}

		$email_hash = $this->hash_email( $email );
		$table      = $wpdb->prefix . 'wab_identities';

		// Use INSERT IGNORE to avoid duplicates.
		$result = $wpdb->query(
			$wpdb->prepare(
				"INSERT IGNORE INTO {$table} (email_hash, visitor_id, device_type) VALUES (%s, %s, %s)",
				$email_hash,
				$visitor_id,
				$device_type
			)
		);

		return $result !== false;
	}

	/**
	 * Hash an email for privacy.
	 *
	 * @param string $email Email address.
	 * @return string Hashed email.
	 */
	public function hash_email( string $email ): string {
		return hash( 'sha256', strtolower( trim( $email ) ) );
	}

	/**
	 * Detect device type from user agent.
	 *
	 * @param string $user_agent User agent string.
	 * @return string Device type.
	 */
	private function detect_device_from_ua( string $user_agent ): string {
		if ( empty( $user_agent ) ) {
			return 'unknown';
		}

		$ua = strtolower( $user_agent );

		if ( preg_match( '/(tablet|ipad|playbook)|(android(?!.*(mobi|opera mini)))/i', $ua ) ) {
			return 'tablet';
		}

		if ( preg_match( '/(mobile|iphone|ipod|android.*mobile|windows phone|blackberry|bb10)/i', $ua ) ) {
			return 'mobile';
		}

		return 'desktop';
	}

	/**
	 * Determine marketing channel from touchpoint.
	 *
	 * @param array $touchpoint Touchpoint data.
	 * @return string Channel name.
	 */
	private function determine_channel( array $touchpoint ): string {
		// Click ID based.
		if ( ! empty( $touchpoint['click_id_type'] ) ) {
			$click_id_map = [
				'gclid'     => 'Google Ads',
				'fbclid'    => 'Meta Ads',
				'ttclid'    => 'TikTok Ads',
				'msclkid'   => 'Microsoft Ads',
				'dclid'     => 'Google Display',
				'li_fat_id' => 'LinkedIn Ads',
			];
			return $click_id_map[ $touchpoint['click_id_type'] ] ?? 'Paid Unknown';
		}

		// UTM based.
		$source = strtolower( $touchpoint['source'] ?? '' );
		$medium = strtolower( $touchpoint['medium'] ?? '' );

		if ( in_array( $medium, [ 'cpc', 'ppc', 'paid', 'paidsearch' ], true ) ) {
			return 'Paid Search';
		}

		if ( in_array( $medium, [ 'social', 'social-media' ], true ) ) {
			return 'Social';
		}

		if ( in_array( $medium, [ 'email', 'e-mail' ], true ) ) {
			return 'Email';
		}

		if ( in_array( $medium, [ 'organic' ], true ) || $source === 'google' ) {
			return 'Organic Search';
		}

		if ( ! empty( $touchpoint['referrer'] ) ) {
			return 'Referral';
		}

		if ( $touchpoint['touchpoint_type'] === 'direct' ) {
			return 'Direct';
		}

		return 'Other';
	}

	/**
	 * Get all visitor IDs associated with an email hash.
	 *
	 * @param string $email_hash SHA-256 hash of customer email.
	 * @return array List of visitor IDs.
	 */
	public function get_visitors_by_hash( string $email_hash ): array {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_identities';

		$results = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT DISTINCT visitor_id FROM {$table} WHERE email_hash = %s ORDER BY first_seen ASC",
				$email_hash
			)
		);

		return $results ?: [];
	}

	/**
	 * Get identity graph for a customer by email hash.
	 *
	 * @param string $email_hash SHA-256 hash of customer email.
	 * @return array Identity graph data.
	 */
	public function get_identity_graph_by_hash( string $email_hash ): array {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_identities';

		$identities = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT visitor_id, device_type, first_seen, last_seen
				FROM {$table}
				WHERE email_hash = %s
				ORDER BY first_seen ASC",
				$email_hash
			),
			ARRAY_A
		);

		return [
			'email_hash'    => $email_hash,
			'visitors'      => $identities ?: [],
			'device_count'  => count( array_unique( array_column( $identities ?: [], 'device_type' ) ) ),
			'visitor_count' => count( $identities ?: [] ),
		];
	}

	/**
	 * Get customer journey by email hash.
	 *
	 * @param string $email_hash SHA-256 hash of customer email.
	 * @return array All touchpoints for this customer.
	 */
	public function get_customer_journey_by_hash( string $email_hash ): array {
		global $wpdb;

		$visitor_ids = $this->get_visitors_by_hash( $email_hash );

		if ( empty( $visitor_ids ) ) {
			return [];
		}

		$table        = $wpdb->prefix . 'wab_touchpoints';
		$placeholders = implode( ',', array_fill( 0, count( $visitor_ids ), '%s' ) );

		$touchpoints = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT t.*, i.device_type as identity_device
				FROM {$table} t
				LEFT JOIN {$wpdb->prefix}wab_identities i ON t.visitor_id = i.visitor_id
				WHERE t.visitor_id IN ({$placeholders})
				ORDER BY t.created_at ASC",
				...$visitor_ids
			),
			ARRAY_A
		);

		return $touchpoints ?: [];
	}

	/**
	 * Calculate cross-device attribution by email hash.
	 *
	 * @param string $email_hash SHA-256 hash of customer email.
	 * @return array Multi-touch attribution data.
	 */
	public function get_cross_device_attribution_by_hash( string $email_hash ): array {
		$journey = $this->get_customer_journey_by_hash( $email_hash );

		if ( empty( $journey ) ) {
			return [];
		}

		// Transform touchpoints into format expected by attribution models.
		$touchpoints = array_map( function ( $tp ) {
			$data = [
				'timestamp' => $tp['created_at'],
			];

			// Add click ID if present.
			if ( ! empty( $tp['click_id_type'] ) && ! empty( $tp['click_id'] ) ) {
				$data[ $tp['click_id_type'] ] = $tp['click_id'];
			}

			// Add UTM data if present.
			if ( ! empty( $tp['source'] ) ) {
				$data['utm_source'] = $tp['source'];
			}
			if ( ! empty( $tp['medium'] ) ) {
				$data['utm_medium'] = $tp['medium'];
			}
			if ( ! empty( $tp['campaign'] ) ) {
				$data['utm_campaign'] = $tp['campaign'];
			}

			// Add device info.
			$data['device_type'] = $tp['identity_device'] ?? $this->detect_device_from_ua( $tp['user_agent'] ?? '' );
			$data['referrer']    = $tp['referrer'] ?? null;

			return $data;
		}, $journey );

		// Use touchpoint tracker to calculate attributions.
		$tracker = new WAB_Touchpoint_Tracker();
		return $tracker->calculate_attributions_from_array( $touchpoints );
	}

	/**
	 * Get customer insights by email hash.
	 *
	 * @param string $email_hash SHA-256 hash of customer email.
	 * @return array Customer insights.
	 */
	public function get_customer_insights_by_hash( string $email_hash ): array {
		$identity_graph = $this->get_identity_graph_by_hash( $email_hash );
		$journey        = $this->get_customer_journey_by_hash( $email_hash );

		if ( empty( $journey ) ) {
			return [
				'first_touch_date'   => null,
				'last_touch_date'    => null,
				'total_touchpoints'  => 0,
				'devices_used'       => [],
				'channels_used'      => [],
				'journey_duration_days' => null,
			];
		}

		// Calculate insights.
		$first_touch = $journey[0];
		$last_touch  = end( $journey );

		$devices  = [];
		$channels = [];

		foreach ( $journey as $tp ) {
			$device = $tp['identity_device'] ?? $this->detect_device_from_ua( $tp['user_agent'] ?? '' );
			$devices[ $device ] = ( $devices[ $device ] ?? 0 ) + 1;

			$channel = $this->determine_channel( $tp );
			$channels[ $channel ] = ( $channels[ $channel ] ?? 0 ) + 1;
		}

		// Calculate journey duration.
		$first_time    = strtotime( $first_touch['created_at'] );
		$last_time     = strtotime( $last_touch['created_at'] );
		$duration_days = $first_time && $last_time
			? round( ( $last_time - $first_time ) / DAY_IN_SECONDS, 1 )
			: 0;

		return [
			'first_touch_date'      => $first_touch['created_at'],
			'last_touch_date'       => $last_touch['created_at'],
			'total_touchpoints'     => count( $journey ),
			'devices_used'          => $devices,
			'channels_used'         => $channels,
			'journey_duration_days' => $duration_days,
			'visitor_count'         => $identity_graph['visitor_count'],
			'device_count'          => $identity_graph['device_count'],
		];
	}

	/**
	 * Clean up old identity data.
	 *
	 * @param int $days_to_keep Days of data to retain.
	 * @return int Number of rows deleted.
	 */
	public function cleanup_old_data( int $days_to_keep = 365 ): int {
		global $wpdb;

		$identities_table  = $wpdb->prefix . 'wab_identities';
		$touchpoints_table = $wpdb->prefix . 'wab_touchpoints';

		$cutoff_date = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days_to_keep} days" ) );

		// Delete old touchpoints.
		$touchpoints_deleted = $wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$touchpoints_table} WHERE created_at < %s",
				$cutoff_date
			)
		);

		// Delete orphaned identities (no touchpoints remaining).
		$identities_deleted = $wpdb->query(
			"DELETE i FROM {$identities_table} i
			LEFT JOIN {$touchpoints_table} t ON i.visitor_id = t.visitor_id
			WHERE t.id IS NULL"
		);

		return (int) $touchpoints_deleted + (int) $identities_deleted;
	}
}
