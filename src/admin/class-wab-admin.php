<?php
/**
 * Admin class - handles admin pages and functionality.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Admin
 *
 * Manages the admin interface for the plugin.
 */
class WAB_Admin {

	/**
	 * Queue manager instance.
	 *
	 * @var WAB_Queue
	 */
	private WAB_Queue $queue;

	/**
	 * Constructor.
	 *
	 * @param WAB_Queue $queue Queue manager.
	 */
	public function __construct( WAB_Queue $queue ) {
		$this->queue = $queue;
	}

	/**
	 * Add admin menu pages.
	 */
	public function add_admin_menu(): void {
		// Main menu item.
		add_menu_page(
			__( 'Attribution Bridge', 'woo-attribution-bridge' ),
			__( 'Attribution', 'woo-attribution-bridge' ),
			'manage_woocommerce',
			'wab-dashboard',
			[ $this, 'render_dashboard_page' ],
			'dashicons-chart-area',
			56
		);

		// Dashboard (same as main).
		add_submenu_page(
			'wab-dashboard',
			__( 'Dashboard', 'woo-attribution-bridge' ),
			__( 'Dashboard', 'woo-attribution-bridge' ),
			'manage_woocommerce',
			'wab-dashboard',
			[ $this, 'render_dashboard_page' ]
		);

		// Settings.
		add_submenu_page(
			'wab-dashboard',
			__( 'Settings', 'woo-attribution-bridge' ),
			__( 'Settings', 'woo-attribution-bridge' ),
			'manage_woocommerce',
			'wab-settings',
			[ $this, 'render_settings_page' ]
		);

		// Queue.
		add_submenu_page(
			'wab-dashboard',
			__( 'Queue', 'woo-attribution-bridge' ),
			__( 'Queue', 'woo-attribution-bridge' ),
			'manage_woocommerce',
			'wab-queue',
			[ $this, 'render_queue_page' ]
		);

		// Logs.
		add_submenu_page(
			'wab-dashboard',
			__( 'Logs', 'woo-attribution-bridge' ),
			__( 'Logs', 'woo-attribution-bridge' ),
			'manage_woocommerce',
			'wab-logs',
			[ $this, 'render_logs_page' ]
		);
	}

	/**
	 * Register plugin settings.
	 */
	public function register_settings(): void {
		// General settings.
		register_setting( 'wab_general', 'wab_debug_mode' );
		register_setting( 'wab_general', 'wab_cookie_expiry' );
		register_setting( 'wab_general', 'wab_dedup_enabled' );
		register_setting( 'wab_general', 'wab_queue_enabled' );

		// Meta settings.
		register_setting( 'wab_integrations', 'wab_meta_enabled' );
		register_setting( 'wab_integrations', 'wab_meta_pixel_id' );
		register_setting( 'wab_integrations', 'wab_meta_access_token' );
		register_setting( 'wab_integrations', 'wab_meta_test_event_code' );

		// Google settings.
		register_setting( 'wab_integrations', 'wab_google_enabled' );
		register_setting( 'wab_integrations', 'wab_google_customer_id' );
		register_setting( 'wab_integrations', 'wab_google_conversion_action_id' );
		register_setting( 'wab_integrations', 'wab_google_access_token' );
		register_setting( 'wab_integrations', 'wab_google_refresh_token' );
		register_setting( 'wab_integrations', 'wab_google_client_id' );
		register_setting( 'wab_integrations', 'wab_google_client_secret' );
		register_setting( 'wab_integrations', 'wab_google_developer_token' );

		// TikTok settings.
		register_setting( 'wab_integrations', 'wab_tiktok_enabled' );
		register_setting( 'wab_integrations', 'wab_tiktok_pixel_code' );
		register_setting( 'wab_integrations', 'wab_tiktok_access_token' );
		register_setting( 'wab_integrations', 'wab_tiktok_test_event_code' );

		// Swetrix settings.
		register_setting( 'wab_integrations', 'wab_swetrix_enabled' );
		register_setting( 'wab_integrations', 'wab_swetrix_project_id' );
		register_setting( 'wab_integrations', 'wab_swetrix_api_url' );
	}

	/**
	 * Enqueue admin scripts and styles.
	 *
	 * @param string $hook_suffix Admin page hook suffix.
	 */
	public function enqueue_admin_scripts( string $hook_suffix ): void {
		// Only load on our pages.
		if ( strpos( $hook_suffix, 'wab-' ) === false ) {
			return;
		}

		wp_enqueue_style(
			'wab-admin',
			WAB_PLUGIN_URL . 'assets/css/wab-admin.css',
			[],
			WAB_VERSION
		);

		wp_enqueue_script(
			'wab-admin',
			WAB_PLUGIN_URL . 'assets/js/wab-admin.js',
			[ 'jquery' ],
			WAB_VERSION,
			true
		);

		wp_localize_script( 'wab-admin', 'wabAdmin', [
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce'   => wp_create_nonce( 'wab_admin' ),
		] );
	}

	/**
	 * Render the dashboard page.
	 */
	public function render_dashboard_page(): void {
		$dedup = new WAB_Deduplication();
		$stats = $dedup->get_stats( 'today' );
		$queue_stats = $this->queue->get_stats();

		include WAB_PLUGIN_DIR . 'admin/views/dashboard-page.php';
	}

	/**
	 * Render the settings page.
	 */
	public function render_settings_page(): void {
		// Get current tab.
		$current_tab = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'general'; // phpcs:ignore

		$tabs = [
			'general'      => __( 'General', 'woo-attribution-bridge' ),
			'meta'         => __( 'Meta', 'woo-attribution-bridge' ),
			'google'       => __( 'Google Ads', 'woo-attribution-bridge' ),
			'tiktok'       => __( 'TikTok', 'woo-attribution-bridge' ),
			'swetrix'      => __( 'Swetrix', 'woo-attribution-bridge' ),
		];

		include WAB_PLUGIN_DIR . 'admin/views/settings-page.php';
	}

	/**
	 * Render the queue page.
	 */
	public function render_queue_page(): void {
		$stats = $this->queue->get_stats();

		// Get pending items.
		global $wpdb;
		$table = $wpdb->prefix . 'wab_queue';
		$items = $wpdb->get_results(
			"SELECT * FROM {$table} WHERE status = 'pending' ORDER BY next_retry ASC LIMIT 50",
			ARRAY_A
		);

		include WAB_PLUGIN_DIR . 'admin/views/queue-page.php';
	}

	/**
	 * Render the logs page.
	 */
	public function render_logs_page(): void {
		$dedup = new WAB_Deduplication();

		// Get filter parameters.
		$integration = isset( $_GET['integration'] ) ? sanitize_key( $_GET['integration'] ) : ''; // phpcs:ignore
		$status      = isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : ''; // phpcs:ignore
		$page        = isset( $_GET['paged'] ) ? max( 1, intval( $_GET['paged'] ) ) : 1; // phpcs:ignore
		$per_page    = 50;
		$offset      = ( $page - 1 ) * $per_page;

		// Build query.
		global $wpdb;
		$table = $wpdb->prefix . 'wab_log';

		$where = '1=1';
		if ( $integration ) {
			$where .= $wpdb->prepare( ' AND integration = %s', $integration );
		}
		if ( $status ) {
			$where .= $wpdb->prepare( ' AND status = %s', $status );
		}

		$total = $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE {$where}" );
		$logs  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE {$where} ORDER BY created_at DESC LIMIT %d OFFSET %d",
				$per_page,
				$offset
			),
			ARRAY_A
		);

		$total_pages = ceil( $total / $per_page );

		include WAB_PLUGIN_DIR . 'admin/views/logs-page.php';
	}
}
