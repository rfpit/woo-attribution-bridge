<?php
/**
 * Meta (Facebook/Instagram) Conversions API integration.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Meta
 *
 * Sends conversion events to Meta Conversions API (CAPI).
 *
 * @link https://developers.facebook.com/docs/marketing-api/conversions-api
 */
class WAB_Meta extends WAB_Integration {

	/**
	 * Integration ID.
	 *
	 * @var string
	 */
	protected string $id = 'meta';

	/**
	 * Integration name.
	 *
	 * @var string
	 */
	protected string $name = 'Meta (Facebook/Instagram)';

	/**
	 * Click ID parameter.
	 *
	 * @var string
	 */
	protected ?string $click_id_param = 'fbclid';

	/**
	 * API version.
	 *
	 * @var string
	 */
	private const API_VERSION = 'v18.0';

	/**
	 * Check if integration is properly configured.
	 *
	 * @return bool
	 */
	public function is_configured(): bool {
		return ! empty( get_option( 'wab_meta_pixel_id' ) )
			&& ! empty( get_option( 'wab_meta_access_token' ) );
	}

	/**
	 * Get required settings.
	 *
	 * @return array
	 */
	public function get_required_settings(): array {
		return [
			'wab_meta_pixel_id',
			'wab_meta_access_token',
		];
	}

	/**
	 * Meta supports sending without fbclid (via email/phone matching).
	 *
	 * @return bool
	 */
	protected function supports_sending_without_click_id(): bool {
		return true;
	}

	/**
	 * Prepare payload for Meta CAPI.
	 *
	 * @param WC_Order $order       WooCommerce order.
	 * @param array    $attribution Attribution data.
	 * @return array Prepared payload.
	 */
	public function prepare_payload( WC_Order $order, array $attribution ): array {
		$user_data     = $this->get_user_data( $order );
		$items         = $this->get_order_items( $order );
		$dedup         = new WAB_Deduplication();
		$event_id      = $dedup->generate_stable_event_id( $order->get_id(), $this->id, 'Purchase' );

		// Build user_data with hashed values as required by Meta.
		$meta_user_data = [
			'em'          => [ $user_data['email_hash'] ],
			'client_ip_address' => $this->get_client_ip(),
			'client_user_agent' => $this->get_user_agent(),
		];

		// Add optional hashed fields.
		if ( $user_data['phone_hash'] ) {
			$meta_user_data['ph'] = [ $user_data['phone_hash'] ];
		}
		if ( $user_data['fn_hash'] ) {
			$meta_user_data['fn'] = [ $user_data['fn_hash'] ];
		}
		if ( $user_data['ln_hash'] ) {
			$meta_user_data['ln'] = [ $user_data['ln_hash'] ];
		}
		if ( $user_data['ct_hash'] ) {
			$meta_user_data['ct'] = [ $user_data['ct_hash'] ];
		}
		if ( $user_data['st_hash'] ) {
			$meta_user_data['st'] = [ $user_data['st_hash'] ];
		}
		if ( $user_data['zip_hash'] ) {
			$meta_user_data['zp'] = [ $user_data['zip_hash'] ];
		}
		if ( $user_data['country'] ) {
			$meta_user_data['country'] = [ strtolower( $user_data['country'] ) ];
		}

		// Add fbclid if available.
		if ( ! empty( $attribution['fbclid'] ) ) {
			$meta_user_data['fbc'] = $this->format_fbc( $attribution['fbclid'] );
		}

		// Add fbp (browser pixel ID) if available.
		if ( ! empty( $attribution['fbp'] ) ) {
			$meta_user_data['fbp'] = $attribution['fbp'];
		}

		// Build custom_data.
		$custom_data = [
			'currency'       => $order->get_currency(),
			'value'          => (float) $order->get_total(),
			'order_id'       => (string) $order->get_id(),
			'content_type'   => 'product',
			'contents'       => array_map( function( $item ) {
				return [
					'id'       => $item['id'],
					'quantity' => $item['quantity'],
					'item_price' => $item['price'],
				];
			}, $items ),
			'num_items'      => count( $items ),
		];

		return [
			'data' => [
				[
					'event_name'   => 'Purchase',
					'event_time'   => $this->get_event_time(),
					'event_id'     => $event_id,
					'event_source_url' => home_url(),
					'action_source' => 'website',
					'user_data'    => $meta_user_data,
					'custom_data'  => $custom_data,
				],
			],
		];
	}

	/**
	 * Format fbclid into fbc format.
	 *
	 * fbc format: fb.{subdomain_index}.{creation_time}.{fbclid}
	 *
	 * @param string $fbclid Facebook click ID.
	 * @return string Formatted fbc value.
	 */
	private function format_fbc( string $fbclid ): string {
		// If already in fbc format, return as-is.
		if ( str_starts_with( $fbclid, 'fb.' ) ) {
			return $fbclid;
		}

		// Format: fb.1.{timestamp}.{fbclid}
		return sprintf( 'fb.1.%d.%s', time() * 1000, $fbclid );
	}

	/**
	 * Send conversion to Meta CAPI.
	 *
	 * @param WC_Order $order   WooCommerce order.
	 * @param array    $payload Prepared payload.
	 * @return array{success: bool, error?: string, response_code?: int, response_body?: string}
	 */
	public function send( WC_Order $order, array $payload ): array {
		$pixel_id     = get_option( 'wab_meta_pixel_id' );
		$access_token = get_option( 'wab_meta_access_token' );

		$url = sprintf(
			'https://graph.facebook.com/%s/%s/events?access_token=%s',
			self::API_VERSION,
			$pixel_id,
			$access_token
		);

		// Add test event code if in test mode.
		$test_event_code = get_option( 'wab_meta_test_event_code' );
		if ( ! empty( $test_event_code ) ) {
			$payload['test_event_code'] = $test_event_code;
		}

		$response = $this->http_post( $url, $payload );

		$dedup = new WAB_Deduplication();

		if ( $response['success'] ) {
			$dedup->log_success(
				$order->get_id(),
				$this->id,
				'Purchase',
				$payload['data'][0]['event_id'] ?? '',
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
			'Purchase',
			$payload['data'][0]['event_id'] ?? '',
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
