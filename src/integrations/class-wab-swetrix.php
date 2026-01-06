<?php
/**
 * Swetrix Analytics integration.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Swetrix
 *
 * Sends conversion events to Swetrix Analytics.
 * Can auto-detect settings from existing Swetrix WordPress plugin.
 *
 * @link https://docs.swetrix.com/events-api
 */
class WAB_Swetrix extends WAB_Integration {

	/**
	 * Integration ID.
	 *
	 * @var string
	 */
	protected string $id = 'swetrix';

	/**
	 * Integration name.
	 *
	 * @var string
	 */
	protected string $name = 'Swetrix';

	/**
	 * No click ID for Swetrix - it's general analytics.
	 *
	 * @var string|null
	 */
	protected ?string $click_id_param = null;

	/**
	 * Default API URL.
	 *
	 * @var string
	 */
	private const DEFAULT_API_URL = 'https://api.swetrix.com';

	/**
	 * Check if the Swetrix WordPress plugin is active.
	 *
	 * @return bool
	 */
	public static function is_plugin_active(): bool {
		// Check for common Swetrix plugin option names.
		$swetrix_options = [
			'swetrix_project_id',      // Official plugin.
			'swetrix_settings',        // Alternative structure.
			'swetrix_pid',             // Shorthand.
		];

		foreach ( $swetrix_options as $option ) {
			if ( get_option( $option ) ) {
				return true;
			}
		}

		// Also check if the plugin is in active plugins list.
		$active_plugins = get_option( 'active_plugins', [] );
		foreach ( $active_plugins as $plugin ) {
			if ( stripos( $plugin, 'swetrix' ) !== false ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Auto-detect project ID from existing Swetrix plugin.
	 *
	 * @return string|null Project ID or null if not found.
	 */
	public function auto_detect_project_id(): ?string {
		// Try common option names.
		$options = [
			'swetrix_project_id',
			'swetrix_pid',
		];

		foreach ( $options as $option ) {
			$value = get_option( $option );
			if ( ! empty( $value ) ) {
				return $value;
			}
		}

		// Try settings array.
		$settings = get_option( 'swetrix_settings' );
		if ( is_array( $settings ) && ! empty( $settings['project_id'] ) ) {
			return $settings['project_id'];
		}

		return null;
	}

	/**
	 * Check if integration is properly configured.
	 *
	 * @return bool
	 */
	public function is_configured(): bool {
		$project_id = $this->get_project_id();

		return ! empty( $project_id );
	}

	/**
	 * Get required settings.
	 *
	 * @return array
	 */
	public function get_required_settings(): array {
		return [
			'wab_swetrix_project_id', // Or auto-detected.
		];
	}

	/**
	 * Swetrix doesn't use click IDs - it's general event tracking.
	 *
	 * @return bool
	 */
	protected function supports_sending_without_click_id(): bool {
		return true;
	}

	/**
	 * Get the project ID (auto-detect or configured).
	 *
	 * @return string|null
	 */
	private function get_project_id(): ?string {
		// First check our own setting.
		$project_id = get_option( 'wab_swetrix_project_id' );
		if ( ! empty( $project_id ) ) {
			return $project_id;
		}

		// Try auto-detection.
		return $this->auto_detect_project_id();
	}

	/**
	 * Get the API URL (custom or default).
	 *
	 * @return string
	 */
	private function get_api_url(): string {
		$custom_url = get_option( 'wab_swetrix_api_url' );

		return ! empty( $custom_url ) ? rtrim( $custom_url, '/' ) : self::DEFAULT_API_URL;
	}

	/**
	 * Prepare payload for Swetrix Events API.
	 *
	 * @param WC_Order $order       WooCommerce order.
	 * @param array    $attribution Attribution data.
	 * @return array Prepared payload.
	 */
	public function prepare_payload( WC_Order $order, array $attribution ): array {
		$project_id = $this->get_project_id();
		$items      = $this->get_order_items( $order );

		// Build custom event data.
		$custom_data = [
			'order_id'     => $order->get_id(),
			'order_number' => $order->get_order_number(),
			'total'        => (float) $order->get_total(),
			'subtotal'     => (float) $order->get_subtotal(),
			'currency'     => $order->get_currency(),
			'items_count'  => count( $items ),
			'payment_method' => $order->get_payment_method(),
		];

		// Add attribution data.
		if ( ! empty( $attribution['utm'] ) ) {
			$custom_data['utm_source']   = $attribution['utm']['utm_source'] ?? null;
			$custom_data['utm_medium']   = $attribution['utm']['utm_medium'] ?? null;
			$custom_data['utm_campaign'] = $attribution['utm']['utm_campaign'] ?? null;
		}

		// Add click IDs if present.
		foreach ( [ 'fbclid', 'gclid', 'ttclid', 'msclkid' ] as $click_id ) {
			if ( ! empty( $attribution[ $click_id ] ) ) {
				$custom_data[ $click_id ] = 'present'; // Don't send actual ID for privacy.
			}
		}

		// Determine source.
		$source = 'direct';
		if ( ! empty( $attribution['fbclid'] ) ) {
			$source = 'meta';
		} elseif ( ! empty( $attribution['gclid'] ) ) {
			$source = 'google';
		} elseif ( ! empty( $attribution['ttclid'] ) ) {
			$source = 'tiktok';
		} elseif ( ! empty( $attribution['utm']['utm_source'] ) ) {
			$source = strtolower( $attribution['utm']['utm_source'] );
		}

		$custom_data['attribution_source'] = $source;

		return [
			'pid' => $project_id,
			'ev'  => 'purchase',
			'pg'  => $order->get_checkout_order_received_url(),
			'lc'  => substr( get_locale(), 0, 2 ),
			'ref' => $attribution['referrer'] ?? '',
			'meta' => $custom_data,
		];
	}

	/**
	 * Send conversion to Swetrix Events API.
	 *
	 * @param WC_Order $order   WooCommerce order.
	 * @param array    $payload Prepared payload.
	 * @return array{success: bool, error?: string, response_code?: int, response_body?: string}
	 */
	public function send( WC_Order $order, array $payload ): array {
		$api_url = $this->get_api_url();
		$url     = $api_url . '/log/custom';

		$response = $this->http_post( $url, $payload );

		$dedup    = new WAB_Deduplication();
		$event_id = $dedup->generate_stable_event_id( $order->get_id(), $this->id, 'purchase' );

		if ( $response['success'] ) {
			$dedup->log_success(
				$order->get_id(),
				$this->id,
				'purchase',
				$event_id,
				$response['code'],
				$response['body'],
				$payload
			);

			return [
				'success'       => true,
				'response_code' => $response['code'],
				'response_body' => $response['body'],
			];
		}

		$error = $response['error'] ?? 'HTTP ' . $response['code'] . ': ' . $response['body'];

		$dedup->log_failure(
			$order->get_id(),
			$this->id,
			'purchase',
			$event_id,
			$response['code'],
			$error,
			$payload
		);

		return [
			'success'       => false,
			'error'         => $error,
			'response_code' => $response['code'],
			'response_body' => $response['body'],
		];
	}
}
