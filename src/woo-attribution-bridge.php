<?php
/**
 * Plugin Name: WooCommerce Attribution Bridge
 * Plugin URI: https://github.com/rfp/woo-attribution-bridge
 * Description: First-party attribution tracking for WooCommerce with server-side conversion APIs.
 * Version: 1.0.0
 * Author: UruShop
 * Author URI: https://urushop.co.uk
 * License: GPL-2.0+
 * License URI: http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain: woo-attribution-bridge
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * WC requires at least: 8.0
 * WC tested up to: 9.0
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

// Plugin constants.
define( 'WAB_VERSION', '1.0.0' );
define( 'WAB_PLUGIN_FILE', __FILE__ );
define( 'WAB_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'WAB_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'WAB_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Check requirements before initializing.
 */
function wab_check_requirements(): bool {
	$errors = [];

	// PHP version check.
	if ( version_compare( PHP_VERSION, '8.0', '<' ) ) {
		$errors[] = sprintf(
			/* translators: %s: PHP version */
			__( 'WooCommerce Attribution Bridge requires PHP 8.0 or higher. You are running PHP %s.', 'woo-attribution-bridge' ),
			PHP_VERSION
		);
	}

	// WooCommerce check.
	if ( ! class_exists( 'WooCommerce' ) ) {
		$errors[] = __( 'WooCommerce Attribution Bridge requires WooCommerce to be installed and activated.', 'woo-attribution-bridge' );
	}

	if ( ! empty( $errors ) ) {
		add_action( 'admin_notices', function() use ( $errors ) {
			foreach ( $errors as $error ) {
				printf( '<div class="error"><p>%s</p></div>', esc_html( $error ) );
			}
		});
		return false;
	}

	return true;
}

/**
 * Initialize the plugin.
 */
function wab_init(): void {
	if ( ! wab_check_requirements() ) {
		return;
	}

	// Load core classes.
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-activator.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-deactivator.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-loader.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-cookie.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-deduplication.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-queue.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-integration.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-dispatcher.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-conversion.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-survey.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-rest-api.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-touchpoint-tracker.php';
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-identity-resolver.php';

	// Load integrations.
	require_once WAB_PLUGIN_DIR . 'integrations/class-wab-meta.php';
	require_once WAB_PLUGIN_DIR . 'integrations/class-wab-google-ads.php';
	require_once WAB_PLUGIN_DIR . 'integrations/class-wab-tiktok.php';
	require_once WAB_PLUGIN_DIR . 'integrations/class-wab-swetrix.php';

	// Load admin.
	if ( is_admin() ) {
		require_once WAB_PLUGIN_DIR . 'admin/class-wab-admin.php';
		require_once WAB_PLUGIN_DIR . 'admin/class-wab-settings.php';
	}

	// Load public.
	require_once WAB_PLUGIN_DIR . 'public/class-wab-public.php';

	// Initialize the loader.
	$loader = new WAB_Loader();
	$loader->run();
}

// Activation hook.
register_activation_hook( __FILE__, function() {
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-activator.php';
	WAB_Activator::activate();
});

// Deactivation hook.
register_deactivation_hook( __FILE__, function() {
	require_once WAB_PLUGIN_DIR . 'includes/class-wab-deactivator.php';
	WAB_Deactivator::deactivate();
});

// Hook into plugins_loaded to ensure WooCommerce is available.
add_action( 'plugins_loaded', 'wab_init', 20 );

// Declare HPOS compatibility.
add_action( 'before_woocommerce_init', function() {
	if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
	}
});
