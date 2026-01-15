<?php
/**
 * Dashboard integration - sends order data to the WAB dashboard.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Dashboard
 *
 * Sends conversion data to the central WAB dashboard.
 */
class WAB_Dashboard extends WAB_Integration {

	/**
	 * Integration ID.
	 *
	 * @var string
	 */
	protected string $id = 'dashboard';

	/**
	 * Integration name.
	 *
	 * @var string
	 */
	protected string $name = 'WAB Dashboard';

	/**
	 * No click ID required - dashboard receives all orders.
	 *
	 * @var string|null
	 */
	protected ?string $click_id_param = null;

	/**
	 * Check if integration is properly configured.
	 *
	 * @return bool
	 */
	public function is_configured(): bool {
		$api_key      = get_option( 'wab_api_key' );
		$dashboard_url = get_option( 'wab_dashboard_url' );

		return ! empty( $api_key ) && ! empty( $dashboard_url );
	}

	/**
	 * Get required settings.
	 *
	 * @return array
	 */
	public function get_required_settings(): array {
		return [
			'wab_api_key',
			'wab_dashboard_url',
		];
	}

	/**
	 * Dashboard doesn't use click IDs - it receives all orders.
	 *
	 * @return bool
	 */
	protected function supports_sending_without_click_id(): bool {
		return true;
	}

	/**
	 * Get the API key.
	 *
	 * @return string
	 */
	private function get_api_key(): string {
		return get_option( 'wab_api_key', '' );
	}

	/**
	 * Get the dashboard URL.
	 *
	 * @return string
	 */
	private function get_dashboard_url(): string {
		return rtrim( get_option( 'wab_dashboard_url', '' ), '/' );
	}

	/**
	 * Check if customer is new (no previous orders).
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return bool
	 */
	private function is_new_customer( WC_Order $order ): bool {
		$email = $order->get_billing_email();
		if ( empty( $email ) ) {
			return true;
		}

		$customer_orders = wc_get_orders( [
			'customer' => $email,
			'status'   => [ 'completed', 'processing' ],
			'limit'    => 2,
			'exclude'  => [ $order->get_id() ],
		] );

		return empty( $customer_orders );
	}

	/**
	 * Determine the event type based on order status.
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return string
	 */
	private function get_event_type( WC_Order $order ): string {
		$status = $order->get_status();

		if ( in_array( $status, [ 'completed' ], true ) ) {
			return 'order.completed';
		}

		if ( in_array( $status, [ 'processing', 'on-hold' ], true ) ) {
			return 'order.updated';
		}

		return 'order.created';
	}

	/**
	 * Prepare payload for dashboard webhook.
	 *
	 * @param WC_Order $order       WooCommerce order.
	 * @param array    $attribution Attribution data.
	 * @return array Prepared payload.
	 */
	public function prepare_payload( WC_Order $order, array $attribution ): array {
		$user_data  = $this->get_user_data( $order );
		$event_type = $this->get_event_type( $order );

		// Get survey response if available.
		$survey_response = $order->get_meta( '_wab_survey_response' );
		$survey_source   = $order->get_meta( '_wab_survey_source' );

		return [
			'event' => $event_type,
			'order' => [
				'external_id'         => (string) $order->get_id(),
				'order_number'        => $order->get_order_number(),
				'total'               => (float) $order->get_total(),
				'subtotal'            => (float) $order->get_subtotal(),
				'tax'                 => (float) $order->get_total_tax(),
				'shipping'            => (float) $order->get_shipping_total(),
				'discount'            => (float) $order->get_discount_total(),
				'currency'            => $order->get_currency(),
				'status'              => $order->get_status(),
				'customer_email_hash' => $user_data['email_hash'],
				'is_new_customer'     => $this->is_new_customer( $order ),
				'payment_method'      => $order->get_payment_method(),
				'attribution'         => ! empty( $attribution ) ? $attribution : null,
				'survey_response'     => $survey_response ?: null,
				'survey_source'       => $survey_source ?: null,
				'date_created'        => $order->get_date_created()->format( 'c' ),
				'date_completed'      => $order->get_date_completed()
					? $order->get_date_completed()->format( 'c' )
					: null,
			],
		];
	}

	/**
	 * Send order to dashboard webhook.
	 *
	 * @param WC_Order $order   WooCommerce order.
	 * @param array    $payload Prepared payload.
	 * @return array{success: bool, error?: string, response_code?: int, response_body?: string}
	 */
	public function send( WC_Order $order, array $payload ): array {
		$dashboard_url = $this->get_dashboard_url();
		$api_key       = $this->get_api_key();
		$url           = $dashboard_url . '/api/webhook/orders';

		$response = $this->http_post(
			$url,
			$payload,
			[
				'X-WAB-API-Key' => $api_key,
			]
		);

		$dedup    = new WAB_Deduplication();
		$event_id = $dedup->generate_stable_event_id( $order->get_id(), $this->id, $payload['event'] );

		if ( $response['success'] ) {
			$dedup->log_success(
				$order->get_id(),
				$this->id,
				$payload['event'],
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
			$payload['event'],
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
