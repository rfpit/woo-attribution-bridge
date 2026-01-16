<?php
/**
 * Plugin loader - orchestrates all hooks and initialization.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Loader
 *
 * Central hook registration and component initialization.
 */
class WAB_Loader {

	/**
	 * Cookie handler instance.
	 *
	 * @var WAB_Cookie
	 */
	private WAB_Cookie $cookie;

	/**
	 * Deduplication handler instance.
	 *
	 * @var WAB_Deduplication
	 */
	private WAB_Deduplication $dedup;

	/**
	 * Queue manager instance.
	 *
	 * @var WAB_Queue
	 */
	private WAB_Queue $queue;

	/**
	 * Dispatcher instance.
	 *
	 * @var WAB_Dispatcher
	 */
	private WAB_Dispatcher $dispatcher;

	/**
	 * Conversion handler instance.
	 *
	 * @var WAB_Conversion
	 */
	private WAB_Conversion $conversion;

	/**
	 * Public handler instance.
	 *
	 * @var WAB_Public
	 */
	private WAB_Public $public;

	/**
	 * Admin handler instance.
	 *
	 * @var WAB_Admin|null
	 */
	private ?WAB_Admin $admin = null;

	/**
	 * Touchpoint tracker instance.
	 *
	 * @var WAB_Touchpoint_Tracker
	 */
	private WAB_Touchpoint_Tracker $touchpoint_tracker;

	/**
	 * Identity resolver instance.
	 *
	 * @var WAB_Identity_Resolver
	 */
	private WAB_Identity_Resolver $identity_resolver;

	/**
	 * REST API handler instance.
	 *
	 * @var WAB_REST_API
	 */
	private WAB_REST_API $rest_api;

	/**
	 * Initialize the loader.
	 */
	public function __construct() {
		$this->init_components();
	}

	/**
	 * Initialize all components.
	 */
	private function init_components(): void {
		// Core components.
		$this->cookie = new WAB_Cookie();
		$this->dedup  = new WAB_Deduplication();
		$this->queue  = new WAB_Queue();

		// Initialize integrations.
		$integrations = $this->get_integrations();

		// Dispatcher receives dedup and queue instances.
		$this->dispatcher = new WAB_Dispatcher( $integrations, $this->dedup, $this->queue );

		// Conversion handler receives cookie and dispatcher.
		$this->conversion = new WAB_Conversion( $this->cookie, $this->dispatcher );

		// Public-facing functionality.
		$this->public = new WAB_Public( $this->cookie );

		// Admin functionality.
		if ( is_admin() ) {
			$this->admin = new WAB_Admin( $this->queue );
		}

		// Multi-touch attribution tracking.
		$this->touchpoint_tracker = new WAB_Touchpoint_Tracker();

		// Cross-device identity resolution.
		$this->identity_resolver = new WAB_Identity_Resolver();

		// REST API.
		$this->rest_api = new WAB_REST_API();
	}

	/**
	 * Get all available integrations.
	 *
	 * @return WAB_Integration[]
	 */
	private function get_integrations(): array {
		$integrations = [];

		// Meta (Facebook/Instagram).
		if ( get_option( 'wab_meta_enabled' ) ) {
			$integrations['meta'] = new WAB_Meta();
		}

		// Google Ads.
		if ( get_option( 'wab_google_enabled' ) ) {
			$integrations['google'] = new WAB_Google_Ads();
		}

		// TikTok.
		if ( get_option( 'wab_tiktok_enabled' ) ) {
			$integrations['tiktok'] = new WAB_TikTok();
		}

		// Swetrix (auto-detect existing plugin).
		if ( get_option( 'wab_swetrix_enabled' ) || WAB_Swetrix::is_plugin_active() ) {
			$integrations['swetrix'] = new WAB_Swetrix();
		}

		// Dashboard integration (sends to central WAB dashboard).
		if ( get_option( 'wab_dashboard_enabled' ) ) {
			$integrations['dashboard'] = new WAB_Dashboard();
		}

		return $integrations;
	}

	/**
	 * Run the loader - register all hooks.
	 */
	public function run(): void {
		// Register custom cron schedule.
		add_filter( 'cron_schedules', [ $this, 'add_cron_schedules' ] );

		// Cookie capture on frontend.
		add_action( 'template_redirect', [ $this->cookie, 'capture_click_ids' ] );

		// WooCommerce order hooks.
		add_action( 'woocommerce_checkout_order_processed', [ $this->conversion, 'on_order_created' ], 10, 3 );
		add_action( 'woocommerce_order_status_completed', [ $this->conversion, 'on_order_completed' ], 10, 1 );
		add_action( 'woocommerce_order_status_processing', [ $this->conversion, 'on_order_processing' ], 10, 1 );

		// Queue processing cron.
		add_action( 'wab_process_queue', [ $this->queue, 'process_pending' ] );
		add_action( 'wab_cleanup_old_logs', [ $this, 'cleanup_old_logs' ] );
		add_action( 'wab_cleanup_attribution_cache', [ 'WAB_Cookie', 'cleanup_attribution_cache' ] );

		// Enqueue frontend scripts.
		add_action( 'wp_enqueue_scripts', [ $this->public, 'enqueue_scripts' ] );

		// Multi-touch attribution tracking.
		$this->touchpoint_tracker->init();

		// REST API initialization.
		$this->rest_api->init();

		// Admin hooks.
		if ( is_admin() && $this->admin ) {
			add_action( 'admin_menu', [ $this->admin, 'add_admin_menu' ] );
			add_action( 'admin_init', [ $this->admin, 'register_settings' ] );
			add_action( 'admin_enqueue_scripts', [ $this->admin, 'enqueue_admin_scripts' ] );
		}

		// Plugin action links.
		add_filter( 'plugin_action_links_' . WAB_PLUGIN_BASENAME, [ $this, 'add_action_links' ] );
	}

	/**
	 * Add custom cron schedules.
	 *
	 * @param array $schedules Existing schedules.
	 * @return array Modified schedules.
	 */
	public function add_cron_schedules( array $schedules ): array {
		$schedules['wab_every_minute'] = [
			'interval' => 60,
			'display'  => __( 'Every Minute', 'woo-attribution-bridge' ),
		];

		return $schedules;
	}

	/**
	 * Cleanup old log entries.
	 */
	public function cleanup_old_logs(): void {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_log';
		$days  = apply_filters( 'wab_log_retention_days', 90 );

		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$table} WHERE created_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
				$days
			)
		);
	}

	/**
	 * Add plugin action links.
	 *
	 * @param array $links Existing links.
	 * @return array Modified links.
	 */
	public function add_action_links( array $links ): array {
		$settings_link = sprintf(
			'<a href="%s">%s</a>',
			admin_url( 'admin.php?page=wab-settings' ),
			__( 'Settings', 'woo-attribution-bridge' )
		);

		array_unshift( $links, $settings_link );

		return $links;
	}
}
