<?php
/**
 * Journey Tracker - Captures and stores customer journey data
 *
 * Tracks page views, cart events, and sessions to build complete customer journeys.
 * This enables showing entry points and referrers even for "direct" orders.
 *
 * @package WooAttributionBridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class WAB_Journey_Tracker
 *
 * Handles customer journey tracking including page views, cart events, and sessions.
 */
class WAB_Journey_Tracker {

	/**
	 * Session timeout in minutes (default 30).
	 *
	 * @var int
	 */
	private int $session_timeout;

	/**
	 * Maximum page views per session.
	 *
	 * @var int
	 */
	private int $max_pages_per_session;

	/**
	 * Data retention in days.
	 *
	 * @var int
	 */
	private int $retention_days;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->session_timeout       = (int) get_option( 'wab_journey_session_timeout', 30 );
		$this->max_pages_per_session = (int) get_option( 'wab_journey_max_pages_per_session', 50 );
		$this->retention_days        = (int) get_option( 'wab_journey_retention_days', 90 );
	}

	/**
	 * Initialize hooks.
	 */
	public function init(): void {
		// Register REST API endpoint.
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );

		// Attach journey to order on creation.
		add_action( 'woocommerce_checkout_order_created', array( $this, 'attach_journey_to_order' ), 20 );

		// Register cleanup cron handler.
		add_action( 'wab_cleanup_old_journeys', array( $this, 'cleanup_old_journeys' ) );
	}

	/**
	 * Register REST API routes.
	 */
	public function register_rest_routes(): void {
		register_rest_route(
			'wab/v1',
			'/journey',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'handle_journey_request' ),
				'permission_callback' => '__return_true', // Public endpoint, validated by nonce.
			)
		);
	}

	/**
	 * Handle incoming journey tracking requests.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response Response.
	 */
	public function handle_journey_request( WP_REST_Request $request ): WP_REST_Response {
		// Check if journey tracking is enabled.
		if ( ! $this->is_enabled() ) {
			return new WP_REST_Response( array( 'success' => false, 'error' => 'disabled' ), 200 );
		}

		$action = $request->get_param( 'action' );

		if ( 'page_view' === $action ) {
			return $this->handle_page_view( $request );
		} elseif ( 'cart_event' === $action ) {
			return $this->handle_cart_event( $request );
		}

		return new WP_REST_Response( array( 'success' => false, 'error' => 'invalid_action' ), 400 );
	}

	/**
	 * Handle page view tracking.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response Response.
	 */
	private function handle_page_view( WP_REST_Request $request ): WP_REST_Response {
		$session_id     = sanitize_text_field( $request->get_param( 'session_id' ) );
		$visitor_id     = sanitize_text_field( $request->get_param( 'visitor_id' ) );
		$page_url       = esc_url_raw( $request->get_param( 'page_url' ) );
		$page_type      = sanitize_key( $request->get_param( 'page_type' ) );
		$page_title     = sanitize_text_field( $request->get_param( 'page_title' ) );
		$product_id     = absint( $request->get_param( 'product_id' ) );
		$entry_referrer = esc_url_raw( $request->get_param( 'entry_referrer' ) );

		if ( empty( $session_id ) ) {
			return new WP_REST_Response( array( 'success' => false, 'error' => 'missing_session_id' ), 400 );
		}

		// Ensure session exists.
		$session = $this->get_or_create_session( $session_id, $visitor_id, $page_url, $entry_referrer );

		if ( ! $session ) {
			return new WP_REST_Response( array( 'success' => false, 'error' => 'session_error' ), 500 );
		}

		// Check page view limit.
		if ( $session['page_count'] >= $this->max_pages_per_session ) {
			return new WP_REST_Response(
				array(
					'success'    => true,
					'session_id' => $session_id,
					'limited'    => true,
				),
				200
			);
		}

		// Track the page view.
		$result = $this->track_page_view(
			$session_id,
			array(
				'page_url'   => $page_url,
				'page_type'  => $page_type ?: 'other',
				'page_title' => $page_title,
				'product_id' => $product_id ?: null,
			)
		);

		if ( ! $result ) {
			return new WP_REST_Response( array( 'success' => false, 'error' => 'tracking_error' ), 500 );
		}

		return new WP_REST_Response(
			array(
				'success'    => true,
				'session_id' => $session_id,
				'page_count' => $session['page_count'] + 1,
			),
			200
		);
	}

	/**
	 * Handle cart event tracking.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response Response.
	 */
	private function handle_cart_event( WP_REST_Request $request ): WP_REST_Response {
		$session_id = sanitize_text_field( $request->get_param( 'session_id' ) );
		$event_type = sanitize_key( $request->get_param( 'event_type' ) );
		$product_id = absint( $request->get_param( 'product_id' ) );
		$quantity   = absint( $request->get_param( 'quantity' ) ) ?: 1;

		if ( empty( $session_id ) || empty( $event_type ) ) {
			return new WP_REST_Response( array( 'success' => false, 'error' => 'missing_params' ), 400 );
		}

		$valid_events = array( 'add_to_cart', 'remove_from_cart', 'checkout_start' );
		if ( ! in_array( $event_type, $valid_events, true ) ) {
			return new WP_REST_Response( array( 'success' => false, 'error' => 'invalid_event_type' ), 400 );
		}

		$result = $this->track_cart_event( $session_id, $event_type, $product_id, $quantity );

		if ( ! $result ) {
			return new WP_REST_Response( array( 'success' => false, 'error' => 'tracking_error' ), 500 );
		}

		return new WP_REST_Response( array( 'success' => true ), 200 );
	}

	/**
	 * Check if journey tracking is enabled.
	 *
	 * @return bool
	 */
	public function is_enabled(): bool {
		return (bool) get_option( 'wab_journey_tracking_enabled', true );
	}

	/**
	 * Get or create a session.
	 *
	 * @param string      $session_id     Session ID.
	 * @param string|null $visitor_id     Visitor ID (optional).
	 * @param string|null $entry_page     Entry page URL (for new sessions).
	 * @param string|null $entry_referrer Entry referrer (for new sessions).
	 * @return array|false Session data or false on error.
	 */
	public function get_or_create_session( string $session_id, ?string $visitor_id = null, ?string $entry_page = null, ?string $entry_referrer = null ) {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_sessions';

		// Check if session exists.
		$session = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE session_id = %s",
				$session_id
			),
			ARRAY_A
		);

		$now = current_time( 'mysql', true );

		if ( $session ) {
			// Check if session has timed out.
			$last_activity = strtotime( $session['last_activity'] );
			$timeout       = $this->session_timeout * MINUTE_IN_SECONDS;

			if ( ( time() - $last_activity ) > $timeout ) {
				// Session timed out - create new one.
				$session_id = $this->generate_session_id();
			} else {
				// Update last activity.
				$wpdb->update(
					$table,
					array( 'last_activity' => $now ),
					array( 'id' => $session['id'] ),
					array( '%s' ),
					array( '%d' )
				);

				$session['last_activity'] = $now;
				return $session;
			}
		}

		// Create new session.
		$has_attribution = $this->check_has_attribution( $visitor_id );

		$result = $wpdb->insert(
			$table,
			array(
				'session_id'      => $session_id,
				'visitor_id'      => $visitor_id ?: '',
				'started_at'      => $now,
				'last_activity'   => $now,
				'entry_page'      => $entry_page ? substr( $entry_page, 0, 512 ) : null,
				'entry_referrer'  => $entry_referrer ? substr( $entry_referrer, 0, 512 ) : null,
				'page_count'      => 0,
				'has_attribution' => $has_attribution ? 1 : 0,
			),
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d' )
		);

		if ( ! $result ) {
			return false;
		}

		return array(
			'id'              => $wpdb->insert_id,
			'session_id'      => $session_id,
			'visitor_id'      => $visitor_id ?: '',
			'started_at'      => $now,
			'last_activity'   => $now,
			'entry_page'      => $entry_page,
			'entry_referrer'  => $entry_referrer,
			'page_count'      => 0,
			'has_attribution' => $has_attribution ? 1 : 0,
		);
	}

	/**
	 * Check if visitor has attribution data.
	 *
	 * @param string|null $visitor_id Visitor ID.
	 * @return bool
	 */
	private function check_has_attribution( ?string $visitor_id ): bool {
		if ( empty( $visitor_id ) ) {
			return false;
		}

		global $wpdb;

		$touchpoints_table = $wpdb->prefix . 'wab_touchpoints';

		$count = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$touchpoints_table} WHERE visitor_id = %s",
				$visitor_id
			)
		);

		return $count > 0;
	}

	/**
	 * Track a page view.
	 *
	 * @param string $session_id Session ID.
	 * @param array  $page_data  Page data.
	 * @return bool Success.
	 */
	public function track_page_view( string $session_id, array $page_data ): bool {
		global $wpdb;

		$page_views_table = $wpdb->prefix . 'wab_page_views';
		$sessions_table   = $wpdb->prefix . 'wab_sessions';

		$now = current_time( 'mysql', true );

		// Insert page view.
		$result = $wpdb->insert(
			$page_views_table,
			array(
				'session_id' => $session_id,
				'page_url'   => substr( $page_data['page_url'] ?? '', 0, 512 ),
				'page_type'  => $page_data['page_type'] ?? 'other',
				'page_title' => substr( $page_data['page_title'] ?? '', 0, 255 ),
				'product_id' => $page_data['product_id'] ?: null,
				'viewed_at'  => $now,
			),
			array( '%s', '%s', '%s', '%s', '%d', '%s' )
		);

		if ( ! $result ) {
			return false;
		}

		// Update session page count and last activity.
		$wpdb->query(
			$wpdb->prepare(
				"UPDATE {$sessions_table} SET page_count = page_count + 1, last_activity = %s WHERE session_id = %s",
				$now,
				$session_id
			)
		);

		return true;
	}

	/**
	 * Track a cart event.
	 *
	 * @param string $session_id Session ID.
	 * @param string $event_type Event type.
	 * @param int    $product_id Product ID.
	 * @param int    $quantity   Quantity.
	 * @return bool Success.
	 */
	public function track_cart_event( string $session_id, string $event_type, int $product_id, int $quantity = 1 ): bool {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_cart_events';
		$now   = current_time( 'mysql', true );

		$result = $wpdb->insert(
			$table,
			array(
				'session_id' => $session_id,
				'event_type' => $event_type,
				'product_id' => $product_id,
				'quantity'   => $quantity,
				'created_at' => $now,
			),
			array( '%s', '%s', '%d', '%d', '%s' )
		);

		// Also update session last activity.
		if ( $result ) {
			$sessions_table = $wpdb->prefix . 'wab_sessions';
			$wpdb->query(
				$wpdb->prepare(
					"UPDATE {$sessions_table} SET last_activity = %s WHERE session_id = %s",
					$now,
					$session_id
				)
			);
		}

		return (bool) $result;
	}

	/**
	 * Get session journey data.
	 *
	 * @param string $session_id Session ID.
	 * @return array|null Journey data or null if not found.
	 */
	public function get_session_journey( string $session_id ): ?array {
		global $wpdb;

		$sessions_table    = $wpdb->prefix . 'wab_sessions';
		$page_views_table  = $wpdb->prefix . 'wab_page_views';
		$cart_events_table = $wpdb->prefix . 'wab_cart_events';

		// Get session.
		$session = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$sessions_table} WHERE session_id = %s",
				$session_id
			),
			ARRAY_A
		);

		if ( ! $session ) {
			return null;
		}

		// Get page views.
		$page_views = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT page_url, page_type, page_title, product_id, viewed_at
				FROM {$page_views_table}
				WHERE session_id = %s
				ORDER BY viewed_at ASC
				LIMIT %d",
				$session_id,
				$this->max_pages_per_session
			),
			ARRAY_A
		);

		// Get cart events.
		$cart_events = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT event_type, product_id, quantity, created_at
				FROM {$cart_events_table}
				WHERE session_id = %s
				ORDER BY created_at ASC",
				$session_id
			),
			ARRAY_A
		);

		return array(
			'session'     => $session,
			'page_views'  => $page_views ?: array(),
			'cart_events' => $cart_events ?: array(),
		);
	}

	/**
	 * Get visitor's recent sessions.
	 *
	 * @param string $visitor_id Visitor ID.
	 * @param int    $limit      Maximum sessions to return.
	 * @return array Sessions with journey data.
	 */
	public function get_visitor_sessions( string $visitor_id, int $limit = 5 ): array {
		global $wpdb;

		$sessions_table = $wpdb->prefix . 'wab_sessions';

		$sessions = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT session_id FROM {$sessions_table}
				WHERE visitor_id = %s
				ORDER BY started_at DESC
				LIMIT %d",
				$visitor_id,
				$limit
			),
			ARRAY_A
		);

		$result = array();
		foreach ( $sessions as $session ) {
			$journey = $this->get_session_journey( $session['session_id'] );
			if ( $journey ) {
				$result[] = $journey;
			}
		}

		return $result;
	}

	/**
	 * Attach journey data to an order.
	 *
	 * @param WC_Order $order WooCommerce order.
	 */
	public function attach_journey_to_order( $order ): void {
		if ( ! $this->is_enabled() ) {
			return;
		}

		// Get session ID from cookie.
		$session_id = isset( $_COOKIE['wab_session'] ) ? sanitize_text_field( wp_unslash( $_COOKIE['wab_session'] ) ) : null;

		if ( ! $session_id ) {
			return;
		}

		$journey = $this->get_session_journey( $session_id );

		if ( ! $journey ) {
			return;
		}

		// Also get previous sessions if we have a visitor ID.
		$visitor_id       = $journey['session']['visitor_id'] ?? null;
		$previous_sessions = array();

		if ( $visitor_id ) {
			$all_sessions = $this->get_visitor_sessions( $visitor_id, 5 );
			// Remove current session from the list.
			$previous_sessions = array_filter(
				$all_sessions,
				function ( $s ) use ( $session_id ) {
					return ( $s['session']['session_id'] ?? '' ) !== $session_id;
				}
			);
		}

		// Calculate journey metrics.
		$metrics = $this->calculate_journey_metrics( $journey, $previous_sessions );

		// Store journey data.
		$journey_data = array(
			'current_session'    => $journey,
			'previous_sessions'  => array_values( $previous_sessions ),
			'metrics'            => $metrics,
		);

		$order->update_meta_data( '_wab_journey', $journey_data );
		$order->save();
	}

	/**
	 * Calculate journey metrics.
	 *
	 * @param array $current_journey   Current session journey.
	 * @param array $previous_sessions Previous sessions.
	 * @return array Metrics.
	 */
	private function calculate_journey_metrics( array $current_journey, array $previous_sessions ): array {
		$session    = $current_journey['session'] ?? array();
		$page_views = $current_journey['page_views'] ?? array();

		// Total sessions including current.
		$total_sessions = count( $previous_sessions ) + 1;

		// Total page views across all sessions.
		$total_page_views = count( $page_views );
		foreach ( $previous_sessions as $prev ) {
			$total_page_views += count( $prev['page_views'] ?? array() );
		}

		// Products viewed.
		$products_viewed = array();
		foreach ( $page_views as $pv ) {
			if ( ! empty( $pv['product_id'] ) ) {
				$products_viewed[] = $pv['product_id'];
			}
		}
		foreach ( $previous_sessions as $prev ) {
			foreach ( $prev['page_views'] ?? array() as $pv ) {
				if ( ! empty( $pv['product_id'] ) ) {
					$products_viewed[] = $pv['product_id'];
				}
			}
		}
		$products_viewed = array_unique( $products_viewed );

		// First visit timestamp.
		$first_visit = $session['started_at'] ?? null;
		if ( ! empty( $previous_sessions ) ) {
			// Get earliest session.
			$earliest = end( $previous_sessions );
			if ( ! empty( $earliest['session']['started_at'] ) ) {
				$first_visit = $earliest['session']['started_at'];
			}
		}

		// Time to purchase (seconds from first visit to now).
		$time_to_purchase = null;
		if ( $first_visit ) {
			$time_to_purchase = time() - strtotime( $first_visit );
		}

		return array(
			'total_sessions'           => $total_sessions,
			'total_page_views'         => $total_page_views,
			'products_viewed'          => count( $products_viewed ),
			'products_viewed_ids'      => array_values( $products_viewed ),
			'time_to_purchase_seconds' => $time_to_purchase,
			'first_visit'              => $first_visit,
			'entry_page'               => $session['entry_page'] ?? null,
			'entry_referrer'           => $session['entry_referrer'] ?? null,
		);
	}

	/**
	 * Cleanup old journey data.
	 *
	 * Removes sessions and page views older than retention period.
	 * Also limits page views per session.
	 */
	public function cleanup_old_journeys(): void {
		global $wpdb;

		$sessions_table    = $wpdb->prefix . 'wab_sessions';
		$page_views_table  = $wpdb->prefix . 'wab_page_views';
		$cart_events_table = $wpdb->prefix . 'wab_cart_events';

		$cutoff = gmdate( 'Y-m-d H:i:s', strtotime( "-{$this->retention_days} days" ) );

		// Delete old page views.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$page_views_table} WHERE viewed_at < %s",
				$cutoff
			)
		);

		// Delete old cart events.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$cart_events_table} WHERE created_at < %s",
				$cutoff
			)
		);

		// Delete old sessions.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$sessions_table} WHERE started_at < %s",
				$cutoff
			)
		);

		// Limit page views per session (keep most recent).
		$sessions_with_excess = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT session_id, COUNT(*) as count FROM {$page_views_table}
				GROUP BY session_id HAVING count > %d",
				$this->max_pages_per_session
			),
			ARRAY_A
		);

		foreach ( $sessions_with_excess as $session ) {
			$excess = $session['count'] - $this->max_pages_per_session;
			// Delete oldest page views for this session.
			$wpdb->query(
				$wpdb->prepare(
					"DELETE FROM {$page_views_table}
					WHERE session_id = %s
					ORDER BY viewed_at ASC
					LIMIT %d",
					$session['session_id'],
					$excess
				)
			);
		}
	}

	/**
	 * Generate a unique session ID.
	 *
	 * @return string Session ID.
	 */
	private function generate_session_id(): string {
		return 'sess_' . bin2hex( random_bytes( 16 ) );
	}

	/**
	 * Get journey data for an order.
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return array|null Journey data or null.
	 */
	public static function get_order_journey( $order ): ?array {
		$journey = $order->get_meta( '_wab_journey' );
		return is_array( $journey ) ? $journey : null;
	}
}
