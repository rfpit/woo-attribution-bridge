<?php
/**
 * Public-facing functionality.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Public
 *
 * Handles public-facing functionality including script enqueuing.
 */
class WAB_Public {

	/**
	 * Cookie handler.
	 *
	 * @var WAB_Cookie
	 */
	private WAB_Cookie $cookie;

	/**
	 * Constructor.
	 *
	 * @param WAB_Cookie $cookie Cookie handler.
	 */
	public function __construct( WAB_Cookie $cookie ) {
		$this->cookie = $cookie;
	}

	/**
	 * Enqueue frontend scripts.
	 */
	public function enqueue_scripts(): void {
		// Don't load in admin.
		if ( is_admin() ) {
			return;
		}

		wp_enqueue_script(
			'wab-capture',
			WAB_PLUGIN_URL . 'assets/js/wab-capture.js',
			[],
			WAB_VERSION,
			true
		);

		// Pass configuration to JS.
		wp_localize_script( 'wab-capture', 'wabConfig', [
			'cookieName'   => $this->cookie->get_cookie_name(),
			'cookieExpiry' => $this->cookie->get_cookie_expiry(),
			'debug'        => (bool) get_option( 'wab_debug_mode', false ),
			'captureParams' => [
				'fbclid'  => (bool) get_option( 'wab_capture_fbclid', true ),
				'gclid'   => (bool) get_option( 'wab_capture_gclid', true ),
				'ttclid'  => (bool) get_option( 'wab_capture_ttclid', true ),
				'msclkid' => (bool) get_option( 'wab_capture_msclkid', true ),
				'utm'     => (bool) get_option( 'wab_capture_utm', true ),
			],
		] );

		// Enqueue journey tracking script if enabled.
		$this->enqueue_journey_script();
	}

	/**
	 * Enqueue journey tracking script.
	 */
	private function enqueue_journey_script(): void {
		// Check if journey tracking is enabled.
		if ( ! get_option( 'wab_journey_tracking_enabled', true ) ) {
			return;
		}

		wp_enqueue_script(
			'wab-journey',
			WAB_PLUGIN_URL . 'assets/js/wab-journey.js',
			[ 'wab-capture' ], // Depends on capture script for visitor ID.
			WAB_VERSION,
			true
		);

		// Pass configuration to JS.
		wp_localize_script( 'wab-journey', 'wabJourneyConfig', [
			'enabled'        => true,
			'restUrl'        => rest_url( 'wab/v1/journey' ),
			'nonce'          => wp_create_nonce( 'wp_rest' ),
			'sessionTimeout' => (int) get_option( 'wab_journey_session_timeout', 30 ),
			'debug'          => (bool) get_option( 'wab_debug_mode', false ),
		] );
	}
}
