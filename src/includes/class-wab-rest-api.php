<?php
/**
 * REST API handler for WooCommerce Attribution Bridge.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_REST_API
 *
 * Provides REST API endpoints for external dashboard integration.
 */
class WAB_REST_API {

	/**
	 * API namespace.
	 *
	 * @var string
	 */
	private const NAMESPACE = 'wab/v1';

	/**
	 * Rate limit window in seconds.
	 *
	 * @var int
	 */
	private const RATE_LIMIT_WINDOW = 60;

	/**
	 * Rate limit max requests per window.
	 *
	 * @var int
	 */
	private const RATE_LIMIT_MAX = 60;

	/**
	 * Initialize REST API.
	 */
	public function init(): void {
		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
	}

	/**
	 * Register REST API routes.
	 */
	public function register_routes(): void {
		// Orders endpoint.
		register_rest_route( self::NAMESPACE, '/orders', [
			'methods'             => 'GET',
			'callback'            => [ $this, 'get_orders' ],
			'permission_callback' => [ $this, 'check_api_key' ],
			'args'                => $this->get_orders_args(),
		] );

		// Single order endpoint.
		register_rest_route( self::NAMESPACE, '/orders/(?P<id>\d+)', [
			'methods'             => 'GET',
			'callback'            => [ $this, 'get_order' ],
			'permission_callback' => [ $this, 'check_api_key' ],
			'args'                => [
				'id' => [
					'required'          => true,
					'validate_callback' => function( $param ) {
						return is_numeric( $param );
					},
				],
			],
		] );

		// Customers endpoint.
		register_rest_route( self::NAMESPACE, '/customers', [
			'methods'             => 'GET',
			'callback'            => [ $this, 'get_customers' ],
			'permission_callback' => [ $this, 'check_api_key' ],
			'args'                => $this->get_customers_args(),
		] );

		// Attribution summary endpoint.
		register_rest_route( self::NAMESPACE, '/attribution', [
			'methods'             => 'GET',
			'callback'            => [ $this, 'get_attribution' ],
			'permission_callback' => [ $this, 'check_api_key' ],
			'args'                => $this->get_period_args(),
		] );

		// Survey responses endpoint.
		register_rest_route( self::NAMESPACE, '/surveys', [
			'methods'             => 'GET',
			'callback'            => [ $this, 'get_surveys' ],
			'permission_callback' => [ $this, 'check_api_key' ],
			'args'                => $this->get_surveys_args(),
		] );

		// Touchpoints endpoint.
		register_rest_route( self::NAMESPACE, '/touchpoints', [
			'methods'             => 'GET',
			'callback'            => [ $this, 'get_touchpoints' ],
			'permission_callback' => [ $this, 'check_api_key' ],
			'args'                => $this->get_touchpoints_args(),
		] );

		// Identity endpoint.
		register_rest_route( self::NAMESPACE, '/identity/(?P<email_hash>[a-f0-9]{64})', [
			'methods'             => 'GET',
			'callback'            => [ $this, 'get_identity' ],
			'permission_callback' => [ $this, 'check_api_key' ],
			'args'                => [
				'email_hash' => [
					'required'          => true,
					'validate_callback' => function( $param ) {
						return preg_match( '/^[a-f0-9]{64}$/', $param );
					},
				],
			],
		] );

		// Dashboard connection handshake.
		register_rest_route( self::NAMESPACE, '/connect', [
			'methods'             => 'POST',
			'callback'            => [ $this, 'connect' ],
			'permission_callback' => [ $this, 'check_api_key' ],
		] );

		// Health check (no auth required).
		register_rest_route( self::NAMESPACE, '/health', [
			'methods'             => 'GET',
			'callback'            => [ $this, 'health_check' ],
			'permission_callback' => '__return_true',
		] );
	}

	/**
	 * Check API key authentication.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return bool|WP_Error True if valid, WP_Error otherwise.
	 */
	public function check_api_key( WP_REST_Request $request ) {
		// Check rate limiting first.
		$rate_check = $this->check_rate_limit( $request );
		if ( is_wp_error( $rate_check ) ) {
			return $rate_check;
		}

		// Get API key from header or query param.
		$api_key = $request->get_header( 'X-WAB-API-Key' );
		if ( ! $api_key ) {
			$api_key = $request->get_param( 'api_key' );
		}

		if ( empty( $api_key ) ) {
			return new WP_Error(
				'wab_missing_api_key',
				__( 'API key is required.', 'woo-attribution-bridge' ),
				[ 'status' => 401 ]
			);
		}

		// Validate API key.
		$stored_key = get_option( 'wab_api_key' );
		if ( empty( $stored_key ) || ! hash_equals( $stored_key, $api_key ) ) {
			return new WP_Error(
				'wab_invalid_api_key',
				__( 'Invalid API key.', 'woo-attribution-bridge' ),
				[ 'status' => 401 ]
			);
		}

		return true;
	}

	/**
	 * Check rate limiting.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return bool|WP_Error True if within limits, WP_Error if exceeded.
	 */
	private function check_rate_limit( WP_REST_Request $request ): bool|WP_Error {
		$ip = $this->get_client_ip();
		$transient_key = 'wab_rate_' . md5( $ip );

		$current = get_transient( $transient_key );
		if ( $current === false ) {
			set_transient( $transient_key, 1, self::RATE_LIMIT_WINDOW );
			return true;
		}

		if ( (int) $current >= self::RATE_LIMIT_MAX ) {
			return new WP_Error(
				'wab_rate_limit_exceeded',
				__( 'Rate limit exceeded. Please try again later.', 'woo-attribution-bridge' ),
				[ 'status' => 429 ]
			);
		}

		set_transient( $transient_key, $current + 1, self::RATE_LIMIT_WINDOW );
		return true;
	}

	/**
	 * Get orders endpoint.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function get_orders( WP_REST_Request $request ): WP_REST_Response {
		$args = [
			'limit'      => $request->get_param( 'limit' ) ?? 100,
			'offset'     => $request->get_param( 'offset' ) ?? 0,
			'status'     => $request->get_param( 'status' ) ?? [ 'completed', 'processing' ],
			'orderby'    => 'date',
			'order'      => 'DESC',
		];

		// Date filtering.
		$since = $request->get_param( 'since' );
		if ( $since ) {
			$args['date_after'] = $since;
		}

		$until = $request->get_param( 'until' );
		if ( $until ) {
			$args['date_before'] = $until;
		}

		$orders = wc_get_orders( $args );
		$data = array_map( [ $this, 'format_order' ], $orders );

		return new WP_REST_Response( [
			'orders'   => $data,
			'total'    => count( $data ),
			'limit'    => (int) $args['limit'],
			'offset'   => (int) $args['offset'],
			'has_more' => count( $data ) === (int) $args['limit'],
		] );
	}

	/**
	 * Get single order endpoint.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_order( WP_REST_Request $request ) {
		$order_id = (int) $request->get_param( 'id' );
		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			return new WP_Error(
				'wab_order_not_found',
				__( 'Order not found.', 'woo-attribution-bridge' ),
				[ 'status' => 404 ]
			);
		}

		return new WP_REST_Response( [
			'order' => $this->format_order( $order ),
		] );
	}

	/**
	 * Get customers endpoint.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function get_customers( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;

		$limit  = $request->get_param( 'limit' ) ?? 100;
		$offset = $request->get_param( 'offset' ) ?? 0;

		// Get unique customers from orders.
		$customers = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT
					meta_email.meta_value as email,
					MIN(posts.post_date) as first_order_date,
					MAX(posts.post_date) as last_order_date,
					COUNT(DISTINCT posts.ID) as order_count,
					SUM(meta_total.meta_value) as total_spent
				FROM {$wpdb->posts} posts
				INNER JOIN {$wpdb->postmeta} meta_email ON posts.ID = meta_email.post_id AND meta_email.meta_key = '_billing_email'
				INNER JOIN {$wpdb->postmeta} meta_total ON posts.ID = meta_total.post_id AND meta_total.meta_key = '_order_total'
				WHERE posts.post_type = 'shop_order'
				AND posts.post_status IN ('wc-completed', 'wc-processing')
				AND meta_email.meta_value != ''
				GROUP BY meta_email.meta_value
				ORDER BY last_order_date DESC
				LIMIT %d OFFSET %d",
				$limit,
				$offset
			),
			ARRAY_A
		);

		$data = array_map( function( $customer ) {
			return [
				'email_hash'       => hash( 'sha256', strtolower( trim( $customer['email'] ) ) ),
				'first_order_date' => $customer['first_order_date'],
				'last_order_date'  => $customer['last_order_date'],
				'order_count'      => (int) $customer['order_count'],
				'total_spent'      => (float) $customer['total_spent'],
				'is_repeat'        => (int) $customer['order_count'] > 1,
			];
		}, $customers ?: [] );

		return new WP_REST_Response( [
			'customers' => $data,
			'total'     => count( $data ),
			'limit'     => (int) $limit,
			'offset'    => (int) $offset,
			'has_more'  => count( $data ) === (int) $limit,
		] );
	}

	/**
	 * Get attribution summary endpoint.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function get_attribution( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;

		$period = $request->get_param( 'period' ) ?? 'month';
		$date_condition = $this->get_date_condition( $period );

		// Get attribution breakdown.
		$click_attribution = $wpdb->get_results(
			"SELECT
				CASE
					WHEN meta.meta_value LIKE '%fbclid%' THEN 'meta'
					WHEN meta.meta_value LIKE '%gclid%' THEN 'google'
					WHEN meta.meta_value LIKE '%ttclid%' THEN 'tiktok'
					WHEN meta.meta_value LIKE '%msclkid%' THEN 'microsoft'
					ELSE 'unknown'
				END as source,
				COUNT(*) as order_count,
				SUM(total.meta_value) as revenue
			FROM {$wpdb->posts} posts
			INNER JOIN {$wpdb->postmeta} meta ON posts.ID = meta.post_id AND meta.meta_key = '_wab_attribution'
			INNER JOIN {$wpdb->postmeta} total ON posts.ID = total.post_id AND total.meta_key = '_order_total'
			WHERE posts.post_type = 'shop_order'
			AND posts.post_status IN ('wc-completed', 'wc-processing')
			{$date_condition}
			GROUP BY source
			ORDER BY revenue DESC",
			ARRAY_A
		);

		// Get survey attribution.
		$survey_table = $wpdb->prefix . 'wab_surveys';
		$survey_attribution = $wpdb->get_results(
			"SELECT
				s.source_mapped as source,
				COUNT(*) as survey_count
			FROM {$survey_table} s
			INNER JOIN {$wpdb->posts} posts ON s.order_id = posts.ID
			WHERE posts.post_status IN ('wc-completed', 'wc-processing')
			{$date_condition}
			GROUP BY s.source_mapped
			ORDER BY survey_count DESC",
			ARRAY_A
		);

		// Get totals.
		$totals = $wpdb->get_row(
			"SELECT
				COUNT(*) as total_orders,
				SUM(total.meta_value) as total_revenue,
				COUNT(CASE WHEN meta.meta_value IS NOT NULL THEN 1 END) as attributed_orders
			FROM {$wpdb->posts} posts
			LEFT JOIN {$wpdb->postmeta} meta ON posts.ID = meta.post_id AND meta.meta_key = '_wab_attribution'
			INNER JOIN {$wpdb->postmeta} total ON posts.ID = total.post_id AND total.meta_key = '_order_total'
			WHERE posts.post_type = 'shop_order'
			AND posts.post_status IN ('wc-completed', 'wc-processing')
			{$date_condition}",
			ARRAY_A
		);

		return new WP_REST_Response( [
			'period'              => $period,
			'totals'              => [
				'orders'            => (int) ( $totals['total_orders'] ?? 0 ),
				'revenue'           => (float) ( $totals['total_revenue'] ?? 0 ),
				'attributed_orders' => (int) ( $totals['attributed_orders'] ?? 0 ),
				'attribution_rate'  => $totals['total_orders'] > 0
					? round( ( $totals['attributed_orders'] / $totals['total_orders'] ) * 100, 1 )
					: 0,
			],
			'by_click_id'         => $click_attribution ?: [],
			'by_survey'           => $survey_attribution ?: [],
		] );
	}

	/**
	 * Get surveys endpoint.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function get_surveys( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;

		$limit  = $request->get_param( 'limit' ) ?? 100;
		$offset = $request->get_param( 'offset' ) ?? 0;
		$period = $request->get_param( 'period' ) ?? 'all';

		$date_condition = $this->get_date_condition( $period, 's.created_at' );
		$survey_table = $wpdb->prefix . 'wab_surveys';

		$surveys = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT s.*, total.meta_value as order_total
				FROM {$survey_table} s
				LEFT JOIN {$wpdb->postmeta} total ON s.order_id = total.post_id AND total.meta_key = '_order_total'
				WHERE 1=1 {$date_condition}
				ORDER BY s.created_at DESC
				LIMIT %d OFFSET %d",
				$limit,
				$offset
			),
			ARRAY_A
		);

		$data = array_map( function( $survey ) {
			return [
				'id'            => (int) $survey['id'],
				'order_id'      => (int) $survey['order_id'],
				'response'      => $survey['response'],
				'response_other' => $survey['response_other'],
				'source_mapped' => $survey['source_mapped'],
				'order_total'   => (float) ( $survey['order_total'] ?? 0 ),
				'created_at'    => $survey['created_at'],
			];
		}, $surveys ?: [] );

		return new WP_REST_Response( [
			'surveys'  => $data,
			'total'    => count( $data ),
			'limit'    => (int) $limit,
			'offset'   => (int) $offset,
			'has_more' => count( $data ) === (int) $limit,
		] );
	}

	/**
	 * Get touchpoints endpoint.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function get_touchpoints( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;

		$limit      = $request->get_param( 'limit' ) ?? 100;
		$offset     = $request->get_param( 'offset' ) ?? 0;
		$visitor_id = $request->get_param( 'visitor_id' );

		$table = $wpdb->prefix . 'wab_touchpoints';
		$where = '1=1';
		$params = [];

		if ( $visitor_id ) {
			$where .= ' AND visitor_id = %s';
			$params[] = $visitor_id;
		}

		$params[] = $limit;
		$params[] = $offset;

		$touchpoints = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table}
				WHERE {$where}
				ORDER BY created_at DESC
				LIMIT %d OFFSET %d",
				...$params
			),
			ARRAY_A
		);

		return new WP_REST_Response( [
			'touchpoints' => $touchpoints ?: [],
			'total'       => count( $touchpoints ?: [] ),
			'limit'       => (int) $limit,
			'offset'      => (int) $offset,
			'has_more'    => count( $touchpoints ?: [] ) === (int) $limit,
		] );
	}

	/**
	 * Connect endpoint for dashboard handshake.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function connect( WP_REST_Request $request ): WP_REST_Response {
		// Verify the connection and return site info.
		return new WP_REST_Response( [
			'connected'   => true,
			'site_url'    => home_url(),
			'site_name'   => get_bloginfo( 'name' ),
			'wab_version' => defined( 'WAB_VERSION' ) ? WAB_VERSION : '1.0.0',
			'wc_version'  => defined( 'WC_VERSION' ) ? WC_VERSION : 'unknown',
			'php_version' => PHP_VERSION,
			'timezone'    => wp_timezone_string(),
			'currency'    => get_woocommerce_currency(),
			'integrations' => $this->get_active_integrations(),
		] );
	}

	/**
	 * Get identity endpoint - returns cross-device identity data.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_identity( WP_REST_Request $request ) {
		$email_hash = $request->get_param( 'email_hash' );

		if ( ! class_exists( 'WAB_Identity_Resolver' ) ) {
			return new WP_Error(
				'wab_identity_unavailable',
				__( 'Identity resolution is not available.', 'woo-attribution-bridge' ),
				[ 'status' => 500 ]
			);
		}

		$resolver = new \WAB_Identity_Resolver();

		// Get identity graph for this email hash.
		$identity = $resolver->get_identity_graph_by_hash( $email_hash );

		if ( empty( $identity ) || empty( $identity['visitors'] ) ) {
			return new WP_Error(
				'wab_identity_not_found',
				__( 'No identity data found for this email hash.', 'woo-attribution-bridge' ),
				[ 'status' => 404 ]
			);
		}

		// Get customer journey across all devices.
		$journey = $resolver->get_customer_journey_by_hash( $email_hash );

		// Get cross-device attribution.
		$attribution = $resolver->get_cross_device_attribution_by_hash( $email_hash );

		// Get customer insights.
		$insights = $resolver->get_customer_insights_by_hash( $email_hash );

		return new WP_REST_Response( [
			'email_hash'   => $email_hash,
			'identity'     => $identity,
			'journey'      => $journey,
			'attribution'  => $attribution,
			'insights'     => $insights,
			'generated_at' => current_time( 'c' ),
		] );
	}

	/**
	 * Health check endpoint.
	 *
	 * Returns detailed status including table verification, integration status,
	 * and queue statistics. Returns 503 if system is in degraded state.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public function health_check( WP_REST_Request $request ): WP_REST_Response {
		$wab_version = defined( 'WAB_VERSION' ) ? WAB_VERSION : '1.0.0';
		$db_version = get_option( 'wab_version', '' );

		// Check table status.
		$tables = [];
		$missing_tables = [];

		if ( class_exists( 'WAB_Upgrader' ) ) {
			foreach ( WAB_Upgrader::REQUIRED_TABLES as $table ) {
				$exists = WAB_Upgrader::table_exists( $table );
				$tables[ $table ] = $exists;
				if ( ! $exists ) {
					$missing_tables[] = $table;
				}
			}
		}

		// Determine status.
		$is_healthy = empty( $missing_tables );
		$status = $is_healthy ? 'healthy' : 'degraded';

		// Build response data.
		$data = [
			'status'         => $status,
			'wab_version'    => $wab_version,
			'db_version'     => $db_version,
			'tables'         => $tables,
			'missing_tables' => $missing_tables,
			'integrations'   => $this->get_integration_status(),
			'timestamp'      => current_time( 'c' ),
		];

		// Add queue stats if queue table exists.
		if ( ! in_array( 'wab_queue', $missing_tables, true ) ) {
			$data['queue'] = $this->get_queue_stats();
		}

		// Allow filtering of health check data.
		$data = apply_filters( 'wab_health_check_data', $data );

		$response = new WP_REST_Response( $data );

		// Set HTTP status code based on health.
		if ( ! $is_healthy ) {
			$response->set_status( 503 );
		}

		return $response;
	}

	/**
	 * Get integration status for health check.
	 *
	 * @return array Integration status.
	 */
	private function get_integration_status(): array {
		return [
			'meta'    => [
				'enabled'    => (bool) get_option( 'wab_meta_enabled' ),
				'configured' => $this->is_meta_configured(),
			],
			'google'  => [
				'enabled'    => (bool) get_option( 'wab_google_enabled' ),
				'configured' => $this->is_google_configured(),
			],
			'tiktok'  => [
				'enabled'    => (bool) get_option( 'wab_tiktok_enabled' ),
				'configured' => $this->is_tiktok_configured(),
			],
			'swetrix' => [
				'enabled'    => (bool) get_option( 'wab_swetrix_enabled' ),
				'configured' => $this->is_swetrix_configured(),
			],
		];
	}

	/**
	 * Check if Meta integration is configured.
	 *
	 * @return bool True if configured.
	 */
	private function is_meta_configured(): bool {
		return ! empty( get_option( 'wab_meta_pixel_id' ) )
			&& ! empty( get_option( 'wab_meta_access_token' ) );
	}

	/**
	 * Check if Google integration is configured.
	 *
	 * @return bool True if configured.
	 */
	private function is_google_configured(): bool {
		return ! empty( get_option( 'wab_google_customer_id' ) )
			&& ! empty( get_option( 'wab_google_conversion_action_id' ) );
	}

	/**
	 * Check if TikTok integration is configured.
	 *
	 * @return bool True if configured.
	 */
	private function is_tiktok_configured(): bool {
		return ! empty( get_option( 'wab_tiktok_pixel_code' ) )
			&& ! empty( get_option( 'wab_tiktok_access_token' ) );
	}

	/**
	 * Check if Swetrix integration is configured.
	 *
	 * @return bool True if configured.
	 */
	private function is_swetrix_configured(): bool {
		return ! empty( get_option( 'wab_swetrix_project_id' ) );
	}

	/**
	 * Get queue statistics for health check.
	 *
	 * @return array Queue stats.
	 */
	private function get_queue_stats(): array {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_queue';

		$pending = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$table} WHERE status = %s",
				'pending'
			)
		);

		$failed = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$table} WHERE status = %s",
				'failed'
			)
		);

		return [
			'pending' => $pending,
			'failed'  => $failed,
		];
	}

	/**
	 * Format order for API response.
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return array Formatted order data.
	 */
	private function format_order( WC_Order $order ): array {
		$attribution = $order->get_meta( '_wab_attribution' );
		$survey = $order->get_meta( '_wab_survey_response' );

		return [
			'id'              => $order->get_id(),
			'number'          => $order->get_order_number(),
			'status'          => $order->get_status(),
			'total'           => (float) $order->get_total(),
			'subtotal'        => (float) $order->get_subtotal(),
			'tax'             => (float) $order->get_total_tax(),
			'shipping'        => (float) $order->get_shipping_total(),
			'discount'        => (float) $order->get_total_discount(),
			'currency'        => $order->get_currency(),
			'payment_method'  => $order->get_payment_method(),
			'date_created'    => $order->get_date_created() ? $order->get_date_created()->format( 'c' ) : null,
			'date_completed'  => $order->get_date_completed() ? $order->get_date_completed()->format( 'c' ) : null,
			'customer'        => [
				'email_hash'  => hash( 'sha256', strtolower( trim( $order->get_billing_email() ) ) ),
				'is_new'      => $this->is_new_customer( $order ),
				'country'     => $order->get_billing_country(),
			],
			'attribution'     => $attribution ? ( is_string( $attribution ) ? json_decode( $attribution, true ) : $attribution ) : null,
			'survey_response' => $survey ?: null,
			'survey_source'   => $order->get_meta( '_wab_survey_source' ) ?: null,
			'items'           => $this->format_items( $order ),
			'item_count'      => $order->get_item_count(),
		];
	}

	/**
	 * Format order items.
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return array Formatted items.
	 */
	private function format_items( WC_Order $order ): array {
		$items = [];

		foreach ( $order->get_items() as $item ) {
			$product = $item->get_product();
			$items[] = [
				'id'       => $product ? ( $product->get_sku() ?: (string) $product->get_id() ) : 'unknown',
				'name'     => $item->get_name(),
				'quantity' => $item->get_quantity(),
				'total'    => (float) $item->get_total(),
				'price'    => (float) ( $item->get_total() / max( 1, $item->get_quantity() ) ),
			];
		}

		return $items;
	}

	/**
	 * Check if customer is new.
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return bool True if new customer.
	 */
	private function is_new_customer( WC_Order $order ): bool {
		$email = $order->get_billing_email();
		if ( empty( $email ) ) {
			return true;
		}

		$orders = wc_get_orders( [
			'billing_email' => $email,
			'limit'         => 2,
			'orderby'       => 'date',
			'order'         => 'ASC',
			'status'        => [ 'completed', 'processing' ],
		] );

		if ( count( $orders ) <= 1 ) {
			return true;
		}

		// Check if this is the first order.
		return $orders[0]->get_id() === $order->get_id();
	}

	/**
	 * Get active integrations.
	 *
	 * @return array Active integrations list.
	 */
	private function get_active_integrations(): array {
		$integrations = [];

		if ( get_option( 'wab_meta_enabled' ) ) {
			$integrations[] = 'meta';
		}
		if ( get_option( 'wab_google_enabled' ) ) {
			$integrations[] = 'google';
		}
		if ( get_option( 'wab_tiktok_enabled' ) ) {
			$integrations[] = 'tiktok';
		}
		if ( get_option( 'wab_swetrix_enabled' ) ) {
			$integrations[] = 'swetrix';
		}

		return $integrations;
	}

	/**
	 * Get date condition SQL.
	 *
	 * @param string $period Period.
	 * @param string $column Column name.
	 * @return string SQL condition.
	 */
	private function get_date_condition( string $period, string $column = 'posts.post_date' ): string {
		return match ( $period ) {
			'day'   => "AND {$column} >= DATE_SUB(NOW(), INTERVAL 1 DAY)",
			'week'  => "AND {$column} >= DATE_SUB(NOW(), INTERVAL 1 WEEK)",
			'month' => "AND {$column} >= DATE_SUB(NOW(), INTERVAL 1 MONTH)",
			'year'  => "AND {$column} >= DATE_SUB(NOW(), INTERVAL 1 YEAR)",
			default => '',
		};
	}

	/**
	 * Get client IP address.
	 *
	 * @return string IP address.
	 */
	private function get_client_ip(): string {
		$headers = [
			'HTTP_X_FORWARDED_FOR',
			'HTTP_X_REAL_IP',
			'REMOTE_ADDR',
		];

		foreach ( $headers as $header ) {
			if ( ! empty( $_SERVER[ $header ] ) ) {
				$ip = sanitize_text_field( wp_unslash( $_SERVER[ $header ] ) );
				return explode( ',', $ip )[0];
			}
		}

		return '127.0.0.1';
	}

	/**
	 * Get orders endpoint arguments.
	 *
	 * @return array Arguments definition.
	 */
	private function get_orders_args(): array {
		return [
			'limit' => [
				'default'           => 100,
				'validate_callback' => function( $param ) {
					return is_numeric( $param ) && $param > 0 && $param <= 500;
				},
			],
			'offset' => [
				'default'           => 0,
				'validate_callback' => function( $param ) {
					return is_numeric( $param ) && $param >= 0;
				},
			],
			'since' => [
				'validate_callback' => function( $param ) {
					return strtotime( $param ) !== false;
				},
			],
			'until' => [
				'validate_callback' => function( $param ) {
					return strtotime( $param ) !== false;
				},
			],
			'status' => [
				'default' => [ 'completed', 'processing' ],
			],
		];
	}

	/**
	 * Get customers endpoint arguments.
	 *
	 * @return array Arguments definition.
	 */
	private function get_customers_args(): array {
		return [
			'limit' => [
				'default'           => 100,
				'validate_callback' => function( $param ) {
					return is_numeric( $param ) && $param > 0 && $param <= 500;
				},
			],
			'offset' => [
				'default'           => 0,
				'validate_callback' => function( $param ) {
					return is_numeric( $param ) && $param >= 0;
				},
			],
		];
	}

	/**
	 * Get period arguments.
	 *
	 * @return array Arguments definition.
	 */
	private function get_period_args(): array {
		return [
			'period' => [
				'default'           => 'month',
				'validate_callback' => function( $param ) {
					return in_array( $param, [ 'day', 'week', 'month', 'year', 'all' ], true );
				},
			],
		];
	}

	/**
	 * Get surveys endpoint arguments.
	 *
	 * @return array Arguments definition.
	 */
	private function get_surveys_args(): array {
		return array_merge( $this->get_customers_args(), $this->get_period_args() );
	}

	/**
	 * Get touchpoints endpoint arguments.
	 *
	 * @return array Arguments definition.
	 */
	private function get_touchpoints_args(): array {
		return array_merge( $this->get_customers_args(), [
			'visitor_id' => [
				'validate_callback' => function( $param ) {
					return is_string( $param ) && strlen( $param ) <= 64;
				},
			],
		] );
	}

	/**
	 * Generate a new API key.
	 *
	 * @return string Generated API key.
	 */
	public static function generate_api_key(): string {
		return wp_generate_password( 32, false );
	}

	/**
	 * Regenerate and save a new API key.
	 *
	 * @return string New API key.
	 */
	public static function regenerate_api_key(): string {
		$key = self::generate_api_key();
		update_option( 'wab_api_key', $key );
		return $key;
	}
}
