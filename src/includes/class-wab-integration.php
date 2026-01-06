<?php
/**
 * Abstract base class for all integrations.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Integration
 *
 * Abstract base class that all integrations must extend.
 * Provides a consistent interface for sending conversions.
 */
abstract class WAB_Integration {

	/**
	 * Integration identifier.
	 *
	 * @var string
	 */
	protected string $id;

	/**
	 * Human-readable name.
	 *
	 * @var string
	 */
	protected string $name;

	/**
	 * Click ID parameter this integration uses.
	 *
	 * @var string|null
	 */
	protected ?string $click_id_param = null;

	/**
	 * Get the integration ID.
	 *
	 * @return string
	 */
	public function get_id(): string {
		return $this->id;
	}

	/**
	 * Get the integration name.
	 *
	 * @return string
	 */
	public function get_name(): string {
		return $this->name;
	}

	/**
	 * Check if integration is enabled.
	 *
	 * @return bool
	 */
	public function is_enabled(): bool {
		return (bool) get_option( 'wab_' . $this->id . '_enabled', false );
	}

	/**
	 * Check if integration is properly configured.
	 *
	 * @return bool
	 */
	abstract public function is_configured(): bool;

	/**
	 * Get required settings for this integration.
	 *
	 * @return array Array of setting keys.
	 */
	abstract public function get_required_settings(): array;

	/**
	 * Get the click ID from attribution data.
	 *
	 * @param array $attribution Attribution data.
	 * @return string|null Click ID or null if not found.
	 */
	public function get_click_id( array $attribution ): ?string {
		if ( $this->click_id_param === null ) {
			return null;
		}

		return $attribution[ $this->click_id_param ] ?? null;
	}

	/**
	 * Check if this conversion is relevant for this integration.
	 *
	 * @param WC_Order $order       WooCommerce order.
	 * @param array    $attribution Attribution data.
	 * @return bool True if conversion should be sent.
	 */
	public function should_send( WC_Order $order, array $attribution ): bool {
		// Must be enabled.
		if ( ! $this->is_enabled() ) {
			return false;
		}

		// Must be configured.
		if ( ! $this->is_configured() ) {
			return false;
		}

		// If integration uses a click ID, it should be present.
		if ( $this->click_id_param !== null && empty( $this->get_click_id( $attribution ) ) ) {
			// Check if we should send without click ID (some integrations support this).
			return $this->supports_sending_without_click_id();
		}

		return true;
	}

	/**
	 * Check if integration supports sending without a click ID.
	 *
	 * Override in subclasses if needed.
	 *
	 * @return bool
	 */
	protected function supports_sending_without_click_id(): bool {
		return false;
	}

	/**
	 * Send a conversion event.
	 *
	 * @param WC_Order $order   WooCommerce order.
	 * @param array    $payload Prepared payload data.
	 * @return array{success: bool, error?: string, response_code?: int, response_body?: string}
	 */
	abstract public function send( WC_Order $order, array $payload ): array;

	/**
	 * Prepare the payload for sending.
	 *
	 * @param WC_Order $order       WooCommerce order.
	 * @param array    $attribution Attribution data.
	 * @return array Prepared payload.
	 */
	abstract public function prepare_payload( WC_Order $order, array $attribution ): array;

	/**
	 * Get user data from order for enhanced matching.
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return array User data array.
	 */
	protected function get_user_data( WC_Order $order ): array {
		$email    = strtolower( trim( $order->get_billing_email() ) );
		$phone    = preg_replace( '/[^0-9]/', '', $order->get_billing_phone() );
		$country  = $order->get_billing_country();
		$city     = strtolower( trim( $order->get_billing_city() ) );
		$state    = strtolower( trim( $order->get_billing_state() ) );
		$postcode = strtolower( preg_replace( '/[^a-z0-9]/i', '', $order->get_billing_postcode() ) );

		// First name and last name.
		$first_name = strtolower( trim( $order->get_billing_first_name() ) );
		$last_name  = strtolower( trim( $order->get_billing_last_name() ) );

		return [
			'email'       => $email,
			'email_hash'  => hash( 'sha256', $email ),
			'phone'       => $phone,
			'phone_hash'  => $phone ? hash( 'sha256', $phone ) : null,
			'first_name'  => $first_name,
			'fn_hash'     => $first_name ? hash( 'sha256', $first_name ) : null,
			'last_name'   => $last_name,
			'ln_hash'     => $last_name ? hash( 'sha256', $last_name ) : null,
			'country'     => $country,
			'city'        => $city,
			'ct_hash'     => $city ? hash( 'sha256', $city ) : null,
			'state'       => $state,
			'st_hash'     => $state ? hash( 'sha256', $state ) : null,
			'postcode'    => $postcode,
			'zip_hash'    => $postcode ? hash( 'sha256', $postcode ) : null,
		];
	}

	/**
	 * Get order items formatted for conversion data.
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return array Array of items.
	 */
	protected function get_order_items( WC_Order $order ): array {
		$items = [];

		foreach ( $order->get_items() as $item ) {
			/** @var WC_Order_Item_Product $item */
			$product = $item->get_product();

			if ( ! $product ) {
				continue;
			}

			$items[] = [
				'id'         => $product->get_sku() ?: (string) $product->get_id(),
				'name'       => $item->get_name(),
				'quantity'   => $item->get_quantity(),
				'price'      => (float) ( $item->get_total() / max( 1, $item->get_quantity() ) ),
				'category'   => $this->get_product_category( $product ),
				'brand'      => $this->get_product_brand( $product ),
			];
		}

		return $items;
	}

	/**
	 * Get primary category for a product.
	 *
	 * @param WC_Product $product WooCommerce product.
	 * @return string Category name or empty string.
	 */
	protected function get_product_category( WC_Product $product ): string {
		$categories = get_the_terms( $product->get_id(), 'product_cat' );

		if ( empty( $categories ) || is_wp_error( $categories ) ) {
			return '';
		}

		// Return the first category.
		return $categories[0]->name;
	}

	/**
	 * Get brand for a product.
	 *
	 * @param WC_Product $product WooCommerce product.
	 * @return string Brand name or empty string.
	 */
	protected function get_product_brand( WC_Product $product ): string {
		// Check common brand taxonomies/attributes.
		$brand_sources = [
			'pa_brand',        // WooCommerce attribute.
			'product_brand',   // Common taxonomy.
			'pwb-brand',       // Perfect WooCommerce Brands plugin.
		];

		foreach ( $brand_sources as $source ) {
			// Check if it's an attribute.
			$brand = $product->get_attribute( str_replace( 'pa_', '', $source ) );
			if ( $brand ) {
				return $brand;
			}

			// Check if it's a taxonomy.
			$terms = get_the_terms( $product->get_id(), $source );
			if ( ! empty( $terms ) && ! is_wp_error( $terms ) ) {
				return $terms[0]->name;
			}
		}

		return '';
	}

	/**
	 * Make an HTTP POST request.
	 *
	 * @param string $url     Endpoint URL.
	 * @param array  $body    Request body.
	 * @param array  $headers Request headers.
	 * @return array{success: bool, code: int, body: string, error?: string}
	 */
	protected function http_post( string $url, array $body, array $headers = [] ): array {
		$default_headers = [
			'Content-Type' => 'application/json',
		];

		$response = wp_remote_post( $url, [
			'headers' => array_merge( $default_headers, $headers ),
			'body'    => wp_json_encode( $body ),
			'timeout' => 30,
		] );

		if ( is_wp_error( $response ) ) {
			return [
				'success' => false,
				'code'    => 0,
				'body'    => '',
				'error'   => $response->get_error_message(),
			];
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );

		return [
			'success' => $code >= 200 && $code < 300,
			'code'    => $code,
			'body'    => $body,
		];
	}

	/**
	 * Get client IP address.
	 *
	 * @return string IP address.
	 */
	protected function get_client_ip(): string {
		if ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
			$ip = sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) );
			return explode( ',', $ip )[0];
		}

		if ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
			return sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) );
		}

		return '';
	}

	/**
	 * Get user agent.
	 *
	 * @return string User agent.
	 */
	protected function get_user_agent(): string {
		return isset( $_SERVER['HTTP_USER_AGENT'] )
			? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) )
			: '';
	}

	/**
	 * Get timestamp in the format required by most APIs.
	 *
	 * @return int Unix timestamp.
	 */
	protected function get_event_time(): int {
		return time();
	}

	/**
	 * Validate that all required settings are present.
	 *
	 * @return array{valid: bool, missing: array}
	 */
	public function validate_settings(): array {
		$required = $this->get_required_settings();
		$missing  = [];

		foreach ( $required as $setting ) {
			$value = get_option( $setting );
			if ( empty( $value ) ) {
				$missing[] = $setting;
			}
		}

		return [
			'valid'   => empty( $missing ),
			'missing' => $missing,
		];
	}
}
