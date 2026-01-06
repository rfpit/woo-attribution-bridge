<?php
/**
 * Conversion handler - hooks into WooCommerce order events.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Conversion
 *
 * Handles WooCommerce order events and triggers conversion sends.
 */
class WAB_Conversion {

	/**
	 * Cookie handler.
	 *
	 * @var WAB_Cookie
	 */
	private WAB_Cookie $cookie;

	/**
	 * Dispatcher.
	 *
	 * @var WAB_Dispatcher
	 */
	private WAB_Dispatcher $dispatcher;

	/**
	 * Constructor.
	 *
	 * @param WAB_Cookie     $cookie     Cookie handler.
	 * @param WAB_Dispatcher $dispatcher Dispatcher instance.
	 */
	public function __construct( WAB_Cookie $cookie, WAB_Dispatcher $dispatcher ) {
		$this->cookie     = $cookie;
		$this->dispatcher = $dispatcher;
	}

	/**
	 * Handle order created event.
	 *
	 * Save attribution data to order meta immediately on checkout.
	 *
	 * @param int      $order_id Order ID.
	 * @param array    $posted_data Posted checkout data.
	 * @param WC_Order $order Order object.
	 */
	public function on_order_created( int $order_id, array $posted_data, WC_Order $order ): void {
		// Save attribution data from cookie to order meta.
		$this->cookie->save_to_order( $order );

		// Link visitor to email for cross-device identity resolution.
		$this->link_visitor_to_customer( $order );

		// Mark that we've captured attribution.
		$order->update_meta_data( '_wab_captured_at', time() );
		$order->save();

		// Debug log.
		if ( get_option( 'wab_debug_mode', false ) ) {
			$attribution = $order->get_meta( '_wab_attribution' );
			error_log( sprintf(
				'[WAB] Order #%d created - Attribution captured: %s',
				$order_id,
				wp_json_encode( array_keys( $attribution ?: [] ) )
			) );
		}
	}

	/**
	 * Link visitor ID to customer email for identity resolution.
	 *
	 * @param WC_Order $order WooCommerce order.
	 */
	private function link_visitor_to_customer( WC_Order $order ): void {
		$email = $order->get_billing_email();
		if ( empty( $email ) ) {
			return;
		}

		// Get visitor ID from attribution data.
		$attribution = $order->get_meta( '_wab_attribution' );
		$visitor_id  = $attribution['visitor_id'] ?? null;

		// Fallback to cookie if not in order meta yet.
		if ( empty( $visitor_id ) ) {
			$cookie_data = $this->cookie->get_attribution_data();
			$visitor_id  = $cookie_data['visitor_id'] ?? null;
		}

		if ( empty( $visitor_id ) ) {
			return;
		}

		// Detect device type from user agent.
		$device_type = $this->detect_device_type();

		// Store visitor ID in order meta for later reference.
		$order->update_meta_data( '_wab_visitor_id', $visitor_id );

		// Link visitor to email using identity resolver.
		if ( class_exists( 'WAB_Identity_Resolver' ) ) {
			$resolver = new \WAB_Identity_Resolver();
			$resolver->link_visitor_to_email( $visitor_id, $email, $device_type );

			if ( get_option( 'wab_debug_mode', false ) ) {
				error_log( sprintf(
					'[WAB] Order #%d - Linked visitor %s to email hash for %s (%s)',
					$order->get_id(),
					$visitor_id,
					$device_type,
					substr( $resolver->hash_email( $email ), 0, 12 ) . '...'
				) );
			}
		}
	}

	/**
	 * Detect device type from user agent.
	 *
	 * @return string Device type (desktop, mobile, tablet).
	 */
	private function detect_device_type(): string {
		$user_agent = sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ?? '' ) );

		if ( empty( $user_agent ) ) {
			return 'unknown';
		}

		$ua = strtolower( $user_agent );

		if ( preg_match( '/(tablet|ipad|playbook)|(android(?!.*(mobi|opera mini)))/i', $ua ) ) {
			return 'tablet';
		}

		if ( preg_match( '/(mobile|iphone|ipod|android.*mobile|windows phone|blackberry|bb10)/i', $ua ) ) {
			return 'mobile';
		}

		return 'desktop';
	}

	/**
	 * Handle order processing event.
	 *
	 * Optionally send conversions on processing status.
	 *
	 * @param int $order_id Order ID.
	 */
	public function on_order_processing( int $order_id ): void {
		// Check if we should send on processing (some stores prefer this).
		if ( ! apply_filters( 'wab_send_on_processing', false ) ) {
			return;
		}

		$this->send_conversion( $order_id );
	}

	/**
	 * Handle order completed event.
	 *
	 * This is the primary trigger for sending conversions.
	 *
	 * @param int $order_id Order ID.
	 */
	public function on_order_completed( int $order_id ): void {
		$this->send_conversion( $order_id );
	}

	/**
	 * Send conversion for an order.
	 *
	 * @param int $order_id Order ID.
	 * @return array Results from dispatcher.
	 */
	private function send_conversion( int $order_id ): array {
		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			return [];
		}

		// Check if already sent.
		if ( $order->get_meta( '_wab_conversions_sent' ) ) {
			if ( get_option( 'wab_debug_mode', false ) ) {
				error_log( sprintf( '[WAB] Order #%d - Conversions already sent, skipping', $order_id ) );
			}
			return [];
		}

		// Get attribution data.
		$attribution = $this->cookie->get_order_attribution( $order );

		if ( empty( $attribution ) ) {
			if ( get_option( 'wab_debug_mode', false ) ) {
				error_log( sprintf( '[WAB] Order #%d - No attribution data found', $order_id ) );
			}
			// Still mark as processed to avoid repeated attempts.
			$order->update_meta_data( '_wab_conversions_sent', time() );
			$order->update_meta_data( '_wab_no_attribution', true );
			$order->save();
			return [];
		}

		// Dispatch to all integrations.
		$results = $this->dispatcher->dispatch( $order, $attribution );

		// Store results.
		$order->update_meta_data( '_wab_conversions_sent', time() );
		$order->update_meta_data( '_wab_dispatch_results', $results );
		$order->save();

		// Debug log.
		if ( get_option( 'wab_debug_mode', false ) ) {
			$sent_count   = count( array_filter( $results, fn( $r ) => $r['sent'] ?? false ) );
			$queued_count = count( array_filter( $results, fn( $r ) => $r['queued'] ?? false ) );
			error_log( sprintf(
				'[WAB] Order #%d - Sent: %d, Queued: %d, Total integrations: %d',
				$order_id,
				$sent_count,
				$queued_count,
				count( $results )
			) );
		}

		return $results;
	}

	/**
	 * Manually trigger conversion for an order.
	 *
	 * Useful for admin interface or manual retry.
	 *
	 * @param int  $order_id Order ID.
	 * @param bool $force    Force re-send even if already sent.
	 * @return array Results from dispatcher.
	 */
	public function manual_send( int $order_id, bool $force = false ): array {
		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			return [ 'error' => 'Order not found' ];
		}

		// If forcing, clear the sent flag.
		if ( $force ) {
			$order->delete_meta_data( '_wab_conversions_sent' );
			$order->save();
		}

		return $this->send_conversion( $order_id );
	}

	/**
	 * Check if a customer is new (first order).
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return bool True if this is customer's first order.
	 */
	public function is_new_customer( WC_Order $order ): bool {
		$email = $order->get_billing_email();

		if ( empty( $email ) ) {
			return true; // Assume new if no email.
		}

		// Count orders with this email (excluding current).
		$orders = wc_get_orders( [
			'billing_email' => $email,
			'limit'         => 2,
			'exclude'       => [ $order->get_id() ],
			'status'        => [ 'completed', 'processing', 'on-hold' ],
		] );

		return count( $orders ) === 0;
	}

	/**
	 * Get attribution summary for an order.
	 *
	 * @param int $order_id Order ID.
	 * @return array|null Attribution summary or null if not found.
	 */
	public function get_attribution_summary( int $order_id ): ?array {
		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			return null;
		}

		$attribution = $order->get_meta( '_wab_attribution' );
		$results     = $order->get_meta( '_wab_dispatch_results' );

		if ( empty( $attribution ) ) {
			return null;
		}

		// Determine primary source.
		$source = 'direct';
		$click_id = null;

		foreach ( [ 'fbclid' => 'meta', 'gclid' => 'google', 'ttclid' => 'tiktok' ] as $param => $platform ) {
			if ( ! empty( $attribution[ $param ] ) ) {
				$source   = $platform;
				$click_id = $attribution[ $param ];
				break;
			}
		}

		// Fallback to UTM source.
		if ( $source === 'direct' && ! empty( $attribution['utm']['utm_source'] ) ) {
			$source = 'utm:' . strtolower( $attribution['utm']['utm_source'] );
		}

		return [
			'source'           => $source,
			'click_id'         => $click_id,
			'utm'              => $attribution['utm'] ?? null,
			'first_touch'      => $attribution['first_touch'] ?? null,
			'last_touch'       => $attribution['last_touch'] ?? null,
			'landing_page'     => $attribution['landing_page'] ?? null,
			'referrer'         => $attribution['referrer'] ?? null,
			'conversions_sent' => $order->get_meta( '_wab_conversions_sent' ),
			'dispatch_results' => $results,
			'is_new_customer'  => $this->is_new_customer( $order ),
		];
	}
}
