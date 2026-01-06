<?php
/**
 * TikTok Events API integration.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_TikTok
 *
 * Sends conversion events to TikTok Events API.
 *
 * @link https://ads.tiktok.com/marketing_api/docs?id=1741601162187777
 */
class WAB_TikTok extends WAB_Integration {

	/**
	 * Integration ID.
	 *
	 * @var string
	 */
	protected string $id = 'tiktok';

	/**
	 * Integration name.
	 *
	 * @var string
	 */
	protected string $name = 'TikTok';

	/**
	 * Click ID parameter.
	 *
	 * @var string
	 */
	protected ?string $click_id_param = 'ttclid';

	/**
	 * API base URL.
	 *
	 * @var string
	 */
	private const API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

	/**
	 * Check if integration is properly configured.
	 *
	 * @return bool
	 */
	public function is_configured(): bool {
		return ! empty( get_option( 'wab_tiktok_pixel_code' ) )
			&& ! empty( get_option( 'wab_tiktok_access_token' ) );
	}

	/**
	 * Get required settings.
	 *
	 * @return array
	 */
	public function get_required_settings(): array {
		return [
			'wab_tiktok_pixel_code',
			'wab_tiktok_access_token',
		];
	}

	/**
	 * TikTok supports sending without ttclid via email/phone matching.
	 *
	 * @return bool
	 */
	protected function supports_sending_without_click_id(): bool {
		return true;
	}

	/**
	 * Prepare payload for TikTok Events API.
	 *
	 * @param WC_Order $order       WooCommerce order.
	 * @param array    $attribution Attribution data.
	 * @return array Prepared payload.
	 */
	public function prepare_payload( WC_Order $order, array $attribution ): array {
		$user_data  = $this->get_user_data( $order );
		$items      = $this->get_order_items( $order );
		$pixel_code = get_option( 'wab_tiktok_pixel_code' );
		$dedup      = new WAB_Deduplication();
		$event_id   = $dedup->generate_stable_event_id( $order->get_id(), $this->id, 'CompletePayment' );

		// Build user object.
		$user = [
			'email' => $user_data['email_hash'],
		];

		if ( $user_data['phone_hash'] ) {
			$user['phone'] = $user_data['phone_hash'];
		}

		// Add ttclid if available.
		if ( ! empty( $attribution['ttclid'] ) ) {
			$user['ttclid'] = $attribution['ttclid'];
		}

		// Add TikTok browser ID if available.
		if ( ! empty( $attribution['_ttp'] ) ) {
			$user['ttp'] = $attribution['_ttp'];
		}

		// Add external_id (order ID).
		$user['external_id'] = hash( 'sha256', (string) $order->get_id() . wp_salt() );

		// Add IP and user agent.
		$ip = $this->get_client_ip();
		$ua = $this->get_user_agent();

		if ( $ip ) {
			$user['ip'] = $ip;
		}
		if ( $ua ) {
			$user['user_agent'] = $ua;
		}

		// Build properties/contents.
		$contents = array_map( function( $item ) {
			return [
				'content_id'   => $item['id'],
				'content_name' => $item['name'],
				'content_type' => 'product',
				'quantity'     => $item['quantity'],
				'price'        => $item['price'],
			];
		}, $items );

		$properties = [
			'currency' => $order->get_currency(),
			'value'    => (float) $order->get_total(),
			'contents' => $contents,
			'content_type' => 'product',
		];

		// Add order_id as custom property.
		$properties['order_id'] = (string) $order->get_id();

		return [
			'pixel_code' => $pixel_code,
			'event'      => 'CompletePayment',
			'event_id'   => $event_id,
			'timestamp'  => (string) $this->get_event_time(),
			'context'    => [
				'page' => [
					'url' => $order->get_checkout_order_received_url(),
				],
				'user' => $user,
				'ip'   => $ip,
				'user_agent' => $ua,
			],
			'properties' => $properties,
		];
	}

	/**
	 * Send conversion to TikTok Events API.
	 *
	 * @param WC_Order $order   WooCommerce order.
	 * @param array    $payload Prepared payload.
	 * @return array{success: bool, error?: string, response_code?: int, response_body?: string}
	 */
	public function send( WC_Order $order, array $payload ): array {
		$access_token = get_option( 'wab_tiktok_access_token' );

		$url = self::API_BASE . '/pixel/track/';

		$headers = [
			'Access-Token' => $access_token,
		];

		// Wrap in data array as required by TikTok.
		$body = [
			'data' => [ $payload ],
		];

		// Add test event code if in test mode.
		$test_event_code = get_option( 'wab_tiktok_test_event_code' );
		if ( ! empty( $test_event_code ) ) {
			$body['test_event_code'] = $test_event_code;
		}

		$response = $this->http_post( $url, $body, $headers );

		$dedup = new WAB_Deduplication();

		// TikTok returns 200 with error codes in the response body.
		if ( $response['code'] === 200 ) {
			$body_decoded = json_decode( $response['body'], true );

			// Check for TikTok-specific error code.
			if ( isset( $body_decoded['code'] ) && $body_decoded['code'] !== 0 ) {
				$error = sprintf(
					'TikTok Error %d: %s',
					$body_decoded['code'],
					$body_decoded['message'] ?? 'Unknown error'
				);

				$dedup->log_failure(
					$order->get_id(),
					$this->id,
					'CompletePayment',
					$payload['event_id'] ?? '',
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

			// Success.
			$dedup->log_success(
				$order->get_id(),
				$this->id,
				'CompletePayment',
				$payload['event_id'] ?? '',
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
			'CompletePayment',
			$payload['event_id'] ?? '',
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
