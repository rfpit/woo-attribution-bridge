<?php
/**
 * Deduplication class tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use WAB_Deduplication;

/**
 * Test class for WAB_Deduplication.
 */
class DeduplicationTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_dedup_enabled' => true,
			'wab_dedup_window'  => 3600,
			'wab_debug_mode'    => false,
		];
	}

	/**
	 * Test generate_event_id creates unique IDs.
	 */
	public function test_generate_event_id_creates_unique_ids(): void {
		$dedup = new WAB_Deduplication();

		$id1 = $dedup->generate_event_id( 123, 'meta', 'purchase' );
		$id2 = $dedup->generate_event_id( 123, 'meta', 'purchase' );

		$this->assertNotEquals( $id1, $id2, 'Event IDs should be unique (include timestamp)' );
		$this->assertStringContainsString( '123', $id1 );
		$this->assertStringContainsString( 'meta', $id1 );
		$this->assertStringContainsString( 'purchase', $id1 );
	}

	/**
	 * Test generate_stable_event_id creates consistent IDs.
	 */
	public function test_generate_stable_event_id_creates_consistent_ids(): void {
		$dedup = new WAB_Deduplication();

		$id1 = $dedup->generate_stable_event_id( 123, 'meta', 'purchase' );
		$id2 = $dedup->generate_stable_event_id( 123, 'meta', 'purchase' );

		$this->assertEquals( $id1, $id2, 'Stable event IDs should be identical for same inputs' );
	}

	/**
	 * Test generate_stable_event_id differs for different orders.
	 */
	public function test_generate_stable_event_id_differs_for_different_orders(): void {
		$dedup = new WAB_Deduplication();

		$id1 = $dedup->generate_stable_event_id( 123, 'meta', 'purchase' );
		$id2 = $dedup->generate_stable_event_id( 456, 'meta', 'purchase' );

		$this->assertNotEquals( $id1, $id2, 'Different orders should have different IDs' );
	}

	/**
	 * Test generate_stable_event_id differs for different integrations.
	 */
	public function test_generate_stable_event_id_differs_for_different_integrations(): void {
		$dedup = new WAB_Deduplication();

		$id1 = $dedup->generate_stable_event_id( 123, 'meta', 'purchase' );
		$id2 = $dedup->generate_stable_event_id( 123, 'google', 'purchase' );

		$this->assertNotEquals( $id1, $id2, 'Different integrations should have different IDs' );
	}

	/**
	 * Test is_duplicate returns false when deduplication is disabled.
	 */
	public function test_is_duplicate_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_dedup_enabled'] = false;

		$dedup = new WAB_Deduplication();
		$result = $dedup->is_duplicate( 123, 'meta' );

		$this->assertFalse( $result );
	}

	/**
	 * Test validate_settings returns correct structure.
	 */
	public function test_event_id_format(): void {
		$dedup = new WAB_Deduplication();

		$id = $dedup->generate_stable_event_id( 999, 'tiktok', 'CompletePayment' );

		// Should contain all parts.
		$this->assertMatchesRegularExpression( '/^[a-f0-9]+_999_tiktok_CompletePayment$/', $id );
	}
}
