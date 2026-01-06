<?php
/**
 * Post-purchase survey handler.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Survey
 *
 * Handles post-purchase attribution surveys on the thank-you page.
 */
class WAB_Survey {

	/**
	 * Database table name.
	 *
	 * @var string
	 */
	private string $table_name;

	/**
	 * Constructor.
	 */
	public function __construct() {
		global $wpdb;
		$this->table_name = $wpdb->prefix . 'wab_surveys';
	}

	/**
	 * Initialize survey hooks.
	 */
	public function init(): void {
		// Display survey on thank-you page.
		add_action( 'woocommerce_thankyou', [ $this, 'display_survey' ], 20 );

		// AJAX handlers.
		add_action( 'wp_ajax_wab_submit_survey', [ $this, 'ajax_submit_survey' ] );
		add_action( 'wp_ajax_nopriv_wab_submit_survey', [ $this, 'ajax_submit_survey' ] );

		// Register shortcode for FunnelKit and other builders.
		add_shortcode( 'wab_survey', [ $this, 'shortcode_survey' ] );

		// Enqueue assets.
		add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_assets' ] );
	}

	/**
	 * Check if survey is enabled.
	 *
	 * @return bool
	 */
	public function is_enabled(): bool {
		return (bool) get_option( 'wab_survey_enabled', true );
	}

	/**
	 * Check if customer is new (first order).
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return bool True if new customer.
	 */
	public function is_new_customer( WC_Order $order ): bool {
		$email = $order->get_billing_email();
		if ( empty( $email ) ) {
			return true;
		}

		$orders = wc_get_orders( [
			'billing_email' => $email,
			'limit'         => 2,
			'orderby'       => 'date',
			'order'         => 'ASC',
			'status'        => [ 'completed', 'processing', 'on-hold' ],
		] );

		return count( $orders ) <= 1;
	}

	/**
	 * Check if survey was already submitted for this order.
	 *
	 * @param int $order_id Order ID.
	 * @return bool True if already submitted.
	 */
	public function has_response( int $order_id ): bool {
		global $wpdb;

		$count = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$this->table_name} WHERE order_id = %d",
				$order_id
			)
		);

		return $count > 0;
	}

	/**
	 * Check if survey should be displayed.
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return bool True if survey should show.
	 */
	public function should_display( WC_Order $order ): bool {
		// Must be enabled.
		if ( ! $this->is_enabled() ) {
			return false;
		}

		// Already responded.
		if ( $this->has_response( $order->get_id() ) ) {
			return false;
		}

		// Check new customer only setting.
		if ( get_option( 'wab_survey_new_only', true ) && ! $this->is_new_customer( $order ) ) {
			return false;
		}

		// Allow filtering.
		return apply_filters( 'wab_survey_should_display', true, $order );
	}

	/**
	 * Get survey question.
	 *
	 * @return string
	 */
	public function get_question(): string {
		return get_option( 'wab_survey_question', 'How did you hear about us?' );
	}

	/**
	 * Get survey options.
	 *
	 * @return array Array of key => label.
	 */
	public function get_options(): array {
		$default = [
			'facebook'   => 'Facebook / Instagram',
			'google'     => 'Google Search',
			'tiktok'     => 'TikTok',
			'youtube'    => 'YouTube',
			'friend'     => 'Friend / Family',
			'podcast'    => 'Podcast',
			'influencer' => 'Influencer',
			'other'      => 'Other',
		];

		return get_option( 'wab_survey_options', $default );
	}

	/**
	 * Get source mapping (survey response to attribution source).
	 *
	 * @return array
	 */
	public function get_source_mapping(): array {
		$default = [
			'facebook'   => 'meta',
			'google'     => 'google',
			'tiktok'     => 'tiktok',
			'youtube'    => 'google',
			'friend'     => 'referral',
			'podcast'    => 'podcast',
			'influencer' => 'influencer',
			'other'      => 'other',
		];

		return apply_filters( 'wab_survey_source_mapping', $default );
	}

	/**
	 * Display survey on thank-you page.
	 *
	 * @param int $order_id Order ID.
	 */
	public function display_survey( int $order_id ): void {
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}

		if ( ! $this->should_display( $order ) ) {
			return;
		}

		echo $this->render_survey( $order ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Shortcode handler for survey display.
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string HTML output.
	 */
	public function shortcode_survey( array $atts = [] ): string {
		$atts = shortcode_atts( [
			'order_id' => 0,
		], $atts, 'wab_survey' );

		$order_id = absint( $atts['order_id'] );

		// Try to get order ID from query var if not provided.
		if ( ! $order_id ) {
			$order_id = absint( get_query_var( 'order-received' ) );
		}

		// FunnelKit integration - check for fkcart order ID.
		if ( ! $order_id && function_exists( 'WFFN_Core' ) ) {
			$order_id = absint( WC()->session->get( 'wffn_funnel_order_id' ) );
		}

		if ( ! $order_id ) {
			return '';
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return '';
		}

		if ( ! $this->should_display( $order ) ) {
			return '';
		}

		return $this->render_survey( $order );
	}

	/**
	 * Render the survey HTML.
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return string HTML output.
	 */
	public function render_survey( WC_Order $order ): string {
		$question      = $this->get_question();
		$options       = $this->get_options();
		$order_id      = $order->get_id();
		$nonce         = wp_create_nonce( 'wab_survey_' . $order_id );
		$show_coupon   = (bool) get_option( 'wab_survey_show_coupon', false );
		$coupon_code   = get_option( 'wab_survey_coupon_code', '' );
		$coupon_text   = get_option( 'wab_survey_coupon_text', 'Thanks! Use code %s for 10% off your next order.' );

		ob_start();
		?>
		<div id="wab-survey" class="wab-survey" data-order-id="<?php echo esc_attr( $order_id ); ?>" data-nonce="<?php echo esc_attr( $nonce ); ?>">
			<div class="wab-survey-inner">
				<h3 class="wab-survey-title"><?php echo esc_html( $question ); ?></h3>

				<div class="wab-survey-options">
					<?php foreach ( $options as $key => $label ) : ?>
						<button type="button"
							class="wab-survey-option"
							data-value="<?php echo esc_attr( $key ); ?>"
							<?php echo $key === 'other' ? 'data-has-other="true"' : ''; ?>>
							<?php echo esc_html( $label ); ?>
						</button>
					<?php endforeach; ?>
				</div>

				<div class="wab-survey-other" style="display: none;">
					<input type="text"
						id="wab-survey-other-input"
						class="wab-survey-other-input"
						placeholder="<?php esc_attr_e( 'Please specify...', 'woo-attribution-bridge' ); ?>"
						maxlength="200">
					<button type="button" class="wab-survey-submit-other">
						<?php esc_html_e( 'Submit', 'woo-attribution-bridge' ); ?>
					</button>
				</div>

				<div class="wab-survey-thanks" style="display: none;">
					<p class="wab-survey-thanks-message">
						<?php esc_html_e( 'Thank you for your feedback!', 'woo-attribution-bridge' ); ?>
					</p>
					<?php if ( $show_coupon && $coupon_code ) : ?>
						<p class="wab-survey-coupon">
							<?php echo esc_html( sprintf( $coupon_text, $coupon_code ) ); ?>
						</p>
					<?php endif; ?>
				</div>

				<div class="wab-survey-error" style="display: none;">
					<p><?php esc_html_e( 'Something went wrong. Please try again.', 'woo-attribution-bridge' ); ?></p>
				</div>
			</div>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Enqueue survey assets.
	 */
	public function enqueue_assets(): void {
		if ( ! $this->is_enabled() ) {
			return;
		}

		// Only load on thank-you page or pages with our shortcode.
		if ( ! is_wc_endpoint_url( 'order-received' ) && ! $this->page_has_shortcode() ) {
			return;
		}

		wp_enqueue_style(
			'wab-survey',
			WAB_PLUGIN_URL . 'assets/css/wab-survey.css',
			[],
			WAB_VERSION
		);

		wp_enqueue_script(
			'wab-survey',
			WAB_PLUGIN_URL . 'assets/js/wab-survey.js',
			[],
			WAB_VERSION,
			true
		);

		wp_localize_script( 'wab-survey', 'wabSurvey', [
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
		] );
	}

	/**
	 * Check if current page has our shortcode.
	 *
	 * @return bool
	 */
	private function page_has_shortcode(): bool {
		global $post;

		if ( ! $post ) {
			return false;
		}

		return has_shortcode( $post->post_content, 'wab_survey' );
	}

	/**
	 * Handle AJAX survey submission.
	 */
	public function ajax_submit_survey(): void {
		// Verify request.
		$order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
		$nonce    = isset( $_POST['nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['nonce'] ) ) : '';
		$response = isset( $_POST['response'] ) ? sanitize_text_field( wp_unslash( $_POST['response'] ) ) : '';
		$other    = isset( $_POST['other'] ) ? sanitize_text_field( wp_unslash( $_POST['other'] ) ) : '';

		// Validate nonce.
		if ( ! wp_verify_nonce( $nonce, 'wab_survey_' . $order_id ) ) {
			wp_send_json_error( [ 'message' => 'Invalid security token.' ], 403 );
		}

		// Validate inputs.
		if ( ! $order_id || ! $response ) {
			wp_send_json_error( [ 'message' => 'Missing required fields.' ], 400 );
		}

		// Get order.
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( [ 'message' => 'Order not found.' ], 404 );
		}

		// Check if already submitted.
		if ( $this->has_response( $order_id ) ) {
			wp_send_json_error( [ 'message' => 'Survey already submitted.' ], 400 );
		}

		// Save response.
		$result = $this->save_response( $order, $response, $other );

		if ( $result ) {
			// Return coupon info if enabled.
			$show_coupon = (bool) get_option( 'wab_survey_show_coupon', false );
			$coupon_code = get_option( 'wab_survey_coupon_code', '' );

			wp_send_json_success( [
				'message'     => 'Thank you for your feedback!',
				'show_coupon' => $show_coupon && ! empty( $coupon_code ),
				'coupon_code' => $show_coupon ? $coupon_code : '',
			] );
		} else {
			wp_send_json_error( [ 'message' => 'Failed to save response.' ], 500 );
		}
	}

	/**
	 * Save survey response to database.
	 *
	 * @param WC_Order $order    WooCommerce order.
	 * @param string   $response Selected response key.
	 * @param string   $other    Other text (if response is 'other').
	 * @return bool|int False on failure, insert ID on success.
	 */
	public function save_response( WC_Order $order, string $response, string $other = '' ): bool|int {
		global $wpdb;

		$email_hash = hash( 'sha256', strtolower( trim( $order->get_billing_email() ) ) );
		$mapping    = $this->get_source_mapping();
		$source     = $mapping[ $response ] ?? 'unknown';

		$result = $wpdb->insert(
			$this->table_name,
			[
				'order_id'       => $order->get_id(),
				'email_hash'     => $email_hash,
				'response'       => $response,
				'response_other' => $other ?: null,
				'source_mapped'  => $source,
				'created_at'     => current_time( 'mysql' ),
			],
			[ '%d', '%s', '%s', '%s', '%s', '%s' ]
		);

		if ( $result === false ) {
			return false;
		}

		// Also store in order meta for easy access.
		$order->update_meta_data( '_wab_survey_response', $response );
		$order->update_meta_data( '_wab_survey_source', $source );
		if ( $other ) {
			$order->update_meta_data( '_wab_survey_other', $other );
		}
		$order->save();

		// Fire action for other integrations.
		do_action( 'wab_survey_response_saved', $order, $response, $source, $other );

		return $wpdb->insert_id;
	}

	/**
	 * Get response for an order.
	 *
	 * @param int $order_id Order ID.
	 * @return array|null Response data or null.
	 */
	public function get_response( int $order_id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$this->table_name} WHERE order_id = %d",
				$order_id
			),
			ARRAY_A
		);

		return $row ?: null;
	}

	/**
	 * Get survey statistics.
	 *
	 * @param string $period Period: 'day', 'week', 'month', 'year', 'all'.
	 * @return array Statistics array.
	 */
	public function get_stats( string $period = 'month' ): array {
		global $wpdb;

		$date_condition = $this->get_date_condition( $period );

		// Get total responses.
		$total = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$this->table_name} WHERE 1=1 {$date_condition}"
		);

		// Get breakdown by response.
		$by_response = $wpdb->get_results(
			"SELECT response, COUNT(*) as count
			 FROM {$this->table_name}
			 WHERE 1=1 {$date_condition}
			 GROUP BY response
			 ORDER BY count DESC",
			ARRAY_A
		);

		// Get breakdown by mapped source.
		$by_source = $wpdb->get_results(
			"SELECT source_mapped, COUNT(*) as count
			 FROM {$this->table_name}
			 WHERE 1=1 {$date_condition}
			 GROUP BY source_mapped
			 ORDER BY count DESC",
			ARRAY_A
		);

		// Calculate percentages.
		$response_breakdown = [];
		foreach ( $by_response as $row ) {
			$response_breakdown[ $row['response'] ] = [
				'count'      => (int) $row['count'],
				'percentage' => $total > 0 ? round( ( $row['count'] / $total ) * 100, 1 ) : 0,
			];
		}

		$source_breakdown = [];
		foreach ( $by_source as $row ) {
			$source_breakdown[ $row['source_mapped'] ] = [
				'count'      => (int) $row['count'],
				'percentage' => $total > 0 ? round( ( $row['count'] / $total ) * 100, 1 ) : 0,
			];
		}

		return [
			'total'       => $total,
			'by_response' => $response_breakdown,
			'by_source'   => $source_breakdown,
			'period'      => $period,
		];
	}

	/**
	 * Get date condition SQL for stats queries.
	 *
	 * @param string $period Period.
	 * @return string SQL WHERE condition.
	 */
	private function get_date_condition( string $period ): string {
		return match ( $period ) {
			'day'   => "AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)",
			'week'  => "AND created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)",
			'month' => "AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)",
			'year'  => "AND created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)",
			default => '',
		};
	}

	/**
	 * Get recent responses.
	 *
	 * @param int $limit Number of responses.
	 * @return array Recent responses.
	 */
	public function get_recent_responses( int $limit = 10 ): array {
		global $wpdb;

		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT s.*, o.ID as order_exists
				 FROM {$this->table_name} s
				 LEFT JOIN {$wpdb->posts} o ON s.order_id = o.ID
				 ORDER BY s.created_at DESC
				 LIMIT %d",
				$limit
			),
			ARRAY_A
		) ?: [];
	}

	/**
	 * Delete old survey responses.
	 *
	 * @param int $days_old Delete responses older than this many days.
	 * @return int Number of deleted rows.
	 */
	public function cleanup( int $days_old = 365 ): int {
		global $wpdb;

		return (int) $wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$this->table_name} WHERE created_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
				$days_old
			)
		);
	}
}
