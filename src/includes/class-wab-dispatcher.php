<?php
/**
 * Dispatcher - routes conversions to all enabled integrations.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Dispatcher
 *
 * Handles sending conversion data to all configured integrations
 * with deduplication and retry queue support.
 */
class WAB_Dispatcher {

	/**
	 * Registered integrations.
	 *
	 * @var WAB_Integration[]
	 */
	private array $integrations;

	/**
	 * Deduplication handler.
	 *
	 * @var WAB_Deduplication
	 */
	private WAB_Deduplication $dedup;

	/**
	 * Queue manager.
	 *
	 * @var WAB_Queue
	 */
	private WAB_Queue $queue;

	/**
	 * Constructor.
	 *
	 * @param WAB_Integration[] $integrations Array of integration instances.
	 * @param WAB_Deduplication $dedup       Deduplication handler.
	 * @param WAB_Queue         $queue       Queue manager.
	 */
	public function __construct( array $integrations, WAB_Deduplication $dedup, WAB_Queue $queue ) {
		$this->integrations = $integrations;
		$this->dedup        = $dedup;
		$this->queue        = $queue;
	}

	/**
	 * Dispatch conversion to all enabled integrations.
	 *
	 * @param WC_Order $order       WooCommerce order.
	 * @param array    $attribution Attribution data.
	 * @return array Results keyed by integration ID.
	 */
	public function dispatch( WC_Order $order, array $attribution ): array {
		$results = [];

		foreach ( $this->integrations as $id => $integration ) {
			$results[ $id ] = $this->send_to_integration( $integration, $order, $attribution );
		}

		return $results;
	}

	/**
	 * Send conversion to a single integration.
	 *
	 * @param WAB_Integration $integration Integration instance.
	 * @param WC_Order        $order       WooCommerce order.
	 * @param array           $attribution Attribution data.
	 * @return array{sent: bool, queued: bool, skipped: bool, reason?: string, error?: string}
	 */
	private function send_to_integration( WAB_Integration $integration, WC_Order $order, array $attribution ): array {
		$integration_id = $integration->get_id();

		// Check if should send.
		if ( ! $integration->should_send( $order, $attribution ) ) {
			return [
				'sent'    => false,
				'queued'  => false,
				'skipped' => true,
				'reason'  => 'Integration check failed (disabled, unconfigured, or missing click ID)',
			];
		}

		// Check for duplicate.
		if ( $this->dedup->is_duplicate( $order->get_id(), $integration_id ) ) {
			return [
				'sent'    => false,
				'queued'  => false,
				'skipped' => true,
				'reason'  => 'Duplicate event already sent',
			];
		}

		// Prepare payload.
		$payload = $integration->prepare_payload( $order, $attribution );

		// Attempt to send.
		$result = $integration->send( $order, $payload );

		if ( $result['success'] ) {
			return [
				'sent'    => true,
				'queued'  => false,
				'skipped' => false,
			];
		}

		// Failed - add to queue for retry.
		$queue_enabled = get_option( 'wab_queue_enabled', true );
		if ( $queue_enabled ) {
			$queue_id = $this->queue->add( $order->get_id(), $integration_id, $payload );

			if ( $queue_id ) {
				return [
					'sent'     => false,
					'queued'   => true,
					'skipped'  => false,
					'queue_id' => $queue_id,
					'error'    => $result['error'] ?? 'Unknown error',
				];
			}
		}

		return [
			'sent'    => false,
			'queued'  => false,
			'skipped' => false,
			'error'   => $result['error'] ?? 'Unknown error',
		];
	}

	/**
	 * Get all registered integrations.
	 *
	 * @return WAB_Integration[]
	 */
	public function get_integrations(): array {
		return $this->integrations;
	}

	/**
	 * Get a specific integration by ID.
	 *
	 * @param string $id Integration ID.
	 * @return WAB_Integration|null
	 */
	public function get_integration( string $id ): ?WAB_Integration {
		return $this->integrations[ $id ] ?? null;
	}

	/**
	 * Check if any integrations are configured and enabled.
	 *
	 * @return bool
	 */
	public function has_active_integrations(): bool {
		foreach ( $this->integrations as $integration ) {
			if ( $integration->is_enabled() && $integration->is_configured() ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get status of all integrations.
	 *
	 * @return array Integration status array.
	 */
	public function get_integrations_status(): array {
		$status = [];

		foreach ( $this->integrations as $id => $integration ) {
			$validation = $integration->validate_settings();

			$status[ $id ] = [
				'name'       => $integration->get_name(),
				'enabled'    => $integration->is_enabled(),
				'configured' => $integration->is_configured(),
				'valid'      => $validation['valid'],
				'missing'    => $validation['missing'],
			];
		}

		return $status;
	}
}
