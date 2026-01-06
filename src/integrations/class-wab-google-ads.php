<?php
/**
 * Google Ads Offline Conversions API integration.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Google_Ads
 *
 * Sends conversion events to Google Ads via Offline Conversions API.
 *
 * @link https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
 */
class WAB_Google_Ads extends WAB_Integration {

	/**
	 * Integration ID.
	 *
	 * @var string
	 */
	protected string $id = 'google';

	/**
	 * Integration name.
	 *
	 * @var string
	 */
	protected string $name = 'Google Ads';

	/**
	 * Click ID parameter.
	 *
	 * @var string
	 */
	protected ?string $click_id_param = 'gclid';

	/**
	 * API version.
	 *
	 * @var string
	 */
	private const API_VERSION = 'v15';

	/**
	 * Check if integration is properly configured.
	 *
	 * @return bool
	 */
	public function is_configured(): bool {
		return ! empty( get_option( 'wab_google_customer_id' ) )
			&& ! empty( get_option( 'wab_google_conversion_action_id' ) )
			&& ! empty( get_option( 'wab_google_access_token' ) );
	}

	/**
	 * Get required settings.
	 *
	 * @return array
	 */
	public function get_required_settings(): array {
		return [
			'wab_google_customer_id',
			'wab_google_conversion_action_id',
			'wab_google_access_token',
		];
	}

	/**
	 * Google Ads requires gclid for click-based attribution.
	 * Enhanced conversions can work without, but we require click ID for now.
	 *
	 * @return bool
	 */
	protected function supports_sending_without_click_id(): bool {
		// Enable enhanced conversions if configured.
		return (bool) get_option( 'wab_google_enhanced_conversions', false );
	}

	/**
	 * Prepare payload for Google Ads Offline Conversions.
	 *
	 * @param WC_Order $order       WooCommerce order.
	 * @param array    $attribution Attribution data.
	 * @return array Prepared payload.
	 */
	public function prepare_payload( WC_Order $order, array $attribution ): array {
		$user_data   = $this->get_user_data( $order );
		$customer_id = get_option( 'wab_google_customer_id' );
		$conversion_action_id = get_option( 'wab_google_conversion_action_id' );

		// Convert customer ID to resource name (remove dashes if present).
		$customer_id_clean = str_replace( '-', '', $customer_id );
		$conversion_action = sprintf(
			'customers/%s/conversionActions/%s',
			$customer_id_clean,
			$conversion_action_id
		);

		$conversion = [
			'conversionAction' => $conversion_action,
			'conversionDateTime' => $this->format_google_datetime( $order->get_date_created() ),
			'conversionValue' => (float) $order->get_total(),
			'currencyCode' => $order->get_currency(),
			'orderId' => (string) $order->get_id(),
		];

		// Add gclid if available.
		if ( ! empty( $attribution['gclid'] ) ) {
			$conversion['gclid'] = $attribution['gclid'];
		}

		// Add enhanced conversion user identifiers if enabled.
		if ( get_option( 'wab_google_enhanced_conversions', false ) ) {
			$conversion['userIdentifiers'] = $this->build_user_identifiers( $user_data );
		}

		return [
			'conversions' => [ $conversion ],
			'partialFailure' => true,
		];
	}

	/**
	 * Format datetime for Google Ads API.
	 *
	 * @param WC_DateTime $date WooCommerce DateTime object.
	 * @return string Formatted datetime.
	 */
	private function format_google_datetime( WC_DateTime $date ): string {
		// Format: yyyy-MM-dd HH:mm:ss+|-HH:mm
		$timezone = $date->getTimezone()->getName();

		// Get offset in hours:minutes format.
		$offset = $date->format( 'P' );

		return $date->format( 'Y-m-d H:i:s' ) . $offset;
	}

	/**
	 * Build user identifiers for enhanced conversions.
	 *
	 * @param array $user_data User data from order.
	 * @return array User identifiers.
	 */
	private function build_user_identifiers( array $user_data ): array {
		$identifiers = [];

		// Email (hashed).
		if ( ! empty( $user_data['email'] ) ) {
			$identifiers[] = [
				'hashedEmail' => $user_data['email_hash'],
			];
		}

		// Phone (hashed with E.164 format ideally).
		if ( ! empty( $user_data['phone'] ) ) {
			$identifiers[] = [
				'hashedPhoneNumber' => $user_data['phone_hash'],
			];
		}

		// Address info.
		$address_info = [];
		if ( ! empty( $user_data['first_name'] ) ) {
			$address_info['hashedFirstName'] = $user_data['fn_hash'];
		}
		if ( ! empty( $user_data['last_name'] ) ) {
			$address_info['hashedLastName'] = $user_data['ln_hash'];
		}
		if ( ! empty( $user_data['city'] ) ) {
			$address_info['city'] = $user_data['city'];
		}
		if ( ! empty( $user_data['state'] ) ) {
			$address_info['state'] = $user_data['state'];
		}
		if ( ! empty( $user_data['postcode'] ) ) {
			$address_info['postalCode'] = $user_data['postcode'];
		}
		if ( ! empty( $user_data['country'] ) ) {
			$address_info['countryCode'] = $user_data['country'];
		}

		if ( ! empty( $address_info ) ) {
			$identifiers[] = [
				'addressInfo' => $address_info,
			];
		}

		return $identifiers;
	}

	/**
	 * Send conversion to Google Ads.
	 *
	 * @param WC_Order $order   WooCommerce order.
	 * @param array    $payload Prepared payload.
	 * @return array{success: bool, error?: string, response_code?: int, response_body?: string}
	 */
	public function send( WC_Order $order, array $payload ): array {
		$customer_id  = str_replace( '-', '', get_option( 'wab_google_customer_id' ) );
		$access_token = get_option( 'wab_google_access_token' );

		// Check if we need to refresh the token.
		$access_token = $this->maybe_refresh_token( $access_token );

		$url = sprintf(
			'https://googleads.googleapis.com/%s/customers/%s:uploadClickConversions',
			self::API_VERSION,
			$customer_id
		);

		$headers = [
			'Authorization' => 'Bearer ' . $access_token,
			'developer-token' => get_option( 'wab_google_developer_token' ),
		];

		// Add login customer ID if using manager account.
		$login_customer_id = get_option( 'wab_google_login_customer_id' );
		if ( ! empty( $login_customer_id ) ) {
			$headers['login-customer-id'] = str_replace( '-', '', $login_customer_id );
		}

		$response = $this->http_post( $url, $payload, $headers );

		$dedup = new WAB_Deduplication();
		$event_id = $dedup->generate_stable_event_id( $order->get_id(), $this->id, 'purchase' );

		if ( $response['success'] ) {
			// Check for partial failures in the response.
			$body = json_decode( $response['body'], true );
			if ( ! empty( $body['partialFailureError'] ) ) {
				$error = $body['partialFailureError']['message'] ?? 'Partial failure';

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

	/**
	 * Refresh OAuth token if needed.
	 *
	 * @param string $current_token Current access token.
	 * @return string Valid access token.
	 */
	private function maybe_refresh_token( string $current_token ): string {
		$expires_at = get_option( 'wab_google_token_expires_at', 0 );

		// If token hasn't expired (with 5-minute buffer), return it.
		if ( $expires_at > time() + 300 ) {
			return $current_token;
		}

		// Need to refresh.
		$refresh_token = get_option( 'wab_google_refresh_token' );
		$client_id     = get_option( 'wab_google_client_id' );
		$client_secret = get_option( 'wab_google_client_secret' );

		if ( empty( $refresh_token ) || empty( $client_id ) || empty( $client_secret ) ) {
			// Can't refresh, return current token and hope for the best.
			return $current_token;
		}

		$response = wp_remote_post( 'https://oauth2.googleapis.com/token', [
			'body' => [
				'client_id'     => $client_id,
				'client_secret' => $client_secret,
				'refresh_token' => $refresh_token,
				'grant_type'    => 'refresh_token',
			],
		] );

		if ( is_wp_error( $response ) ) {
			return $current_token;
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! empty( $body['access_token'] ) ) {
			update_option( 'wab_google_access_token', $body['access_token'] );
			update_option( 'wab_google_token_expires_at', time() + ( $body['expires_in'] ?? 3600 ) );

			return $body['access_token'];
		}

		return $current_token;
	}
}
