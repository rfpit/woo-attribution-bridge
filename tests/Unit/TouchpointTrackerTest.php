<?php
/**
 * Tests for WAB_Touchpoint_Tracker class.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use Brain\Monkey\Functions;
use Mockery;

/**
 * Class TouchpointTrackerTest
 */
class TouchpointTrackerTest extends WabTestCase {

	/**
	 * Set up additional mocks for touchpoint tracker.
	 */
	protected function setUp(): void {
		parent::setUp();

		// Additional mocks for touchpoint tracker.
		Functions\when( 'is_front_page' )->justReturn( false );
		Functions\when( 'is_product' )->justReturn( false );
		Functions\when( 'is_product_category' )->justReturn( false );
		Functions\when( 'is_cart' )->justReturn( false );
		Functions\when( 'is_checkout' )->justReturn( false );
		Functions\when( 'is_shop' )->justReturn( false );
		Functions\when( 'is_single' )->justReturn( false );
		Functions\when( 'is_page' )->justReturn( true );
		Functions\when( 'sanitize_key' )->alias( function( $key ) {
			return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( $key ) );
		} );
	}

	/**
	 * Test tracker can calculate first touch attribution.
	 */
	public function test_first_touch_attribution(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'gclid' => 'google123', 'timestamp' => '2024-01-01T10:00:00Z' ],
			[ 'fbclid' => 'meta456', 'timestamp' => '2024-01-05T10:00:00Z' ],
			[ 'utm_source' => 'email', 'timestamp' => '2024-01-10T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();

		$this->assertArrayHasKey( 'first_touch', $attributions );
		$this->assertEquals( 'google_ads', $attributions['first_touch']['source'] );
		$this->assertEquals( 1.0, $attributions['first_touch']['weight'] );
	}

	/**
	 * Test tracker can calculate last touch attribution.
	 */
	public function test_last_touch_attribution(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'gclid' => 'google123', 'timestamp' => '2024-01-01T10:00:00Z' ],
			[ 'fbclid' => 'meta456', 'timestamp' => '2024-01-05T10:00:00Z' ],
			[ 'utm_source' => 'email', 'timestamp' => '2024-01-10T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();

		$this->assertArrayHasKey( 'last_touch', $attributions );
		$this->assertEquals( 'email', $attributions['last_touch']['source'] );
		$this->assertEquals( 1.0, $attributions['last_touch']['weight'] );
	}

	/**
	 * Test tracker can calculate linear attribution.
	 */
	public function test_linear_attribution(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'gclid' => 'google123', 'timestamp' => '2024-01-01T10:00:00Z' ],
			[ 'fbclid' => 'meta456', 'timestamp' => '2024-01-05T10:00:00Z' ],
			[ 'utm_source' => 'email', 'timestamp' => '2024-01-10T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();

		$this->assertArrayHasKey( 'linear', $attributions );
		$this->assertCount( 3, $attributions['linear'] );

		// Each should get ~33% credit.
		$expected_weight = 1.0 / 3;
		foreach ( $attributions['linear'] as $source ) {
			$this->assertEqualsWithDelta( $expected_weight, $source['weight'], 0.01 );
		}
	}

	/**
	 * Test tracker can calculate position-based attribution.
	 */
	public function test_position_based_attribution(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'gclid' => 'google123', 'timestamp' => '2024-01-01T10:00:00Z' ],
			[ 'fbclid' => 'meta456', 'timestamp' => '2024-01-05T10:00:00Z' ],
			[ 'ttclid' => 'tiktok789', 'timestamp' => '2024-01-08T10:00:00Z' ],
			[ 'utm_source' => 'email', 'timestamp' => '2024-01-10T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();

		$this->assertArrayHasKey( 'position_based', $attributions );

		// Find weights by source.
		$weights = [];
		foreach ( $attributions['position_based'] as $item ) {
			$weights[ $item['source'] ] = $item['weight'];
		}

		// First and last should each have 40%.
		$this->assertEqualsWithDelta( 0.4, $weights['google_ads'], 0.01 );
		$this->assertEqualsWithDelta( 0.4, $weights['email'], 0.01 );

		// Middle two split the remaining 20%.
		$this->assertEqualsWithDelta( 0.1, $weights['meta_ads'], 0.01 );
		$this->assertEqualsWithDelta( 0.1, $weights['tiktok_ads'], 0.01 );
	}

	/**
	 * Test tracker can calculate time decay attribution.
	 */
	public function test_time_decay_attribution(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'gclid' => 'google123', 'timestamp' => date( 'c', strtotime( '-14 days' ) ) ],
			[ 'utm_source' => 'email', 'timestamp' => date( 'c', strtotime( '-1 day' ) ) ],
		] );

		$attributions = $tracker->calculate_attributions();

		$this->assertArrayHasKey( 'time_decay', $attributions );

		// Recent touchpoint should have more weight.
		$weights = [];
		foreach ( $attributions['time_decay'] as $item ) {
			$weights[ $item['source'] ] = $item['weight'];
		}

		$this->assertGreaterThan( $weights['google_ads'], $weights['email'] );
	}

	/**
	 * Test touchpoint count is tracked.
	 */
	public function test_touchpoint_count(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'gclid' => 'google123', 'timestamp' => '2024-01-01T10:00:00Z' ],
			[ 'fbclid' => 'meta456', 'timestamp' => '2024-01-05T10:00:00Z' ],
			[ 'utm_source' => 'email', 'timestamp' => '2024-01-10T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();

		$this->assertArrayHasKey( 'touchpoint_count', $attributions );
		$this->assertEquals( 3, $attributions['touchpoint_count'] );
	}

	/**
	 * Test single touchpoint gets 100% credit in all models.
	 */
	public function test_single_touchpoint(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'gclid' => 'google123', 'timestamp' => '2024-01-01T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();

		$this->assertEquals( 'google_ads', $attributions['first_touch']['source'] );
		$this->assertEquals( 1.0, $attributions['first_touch']['weight'] );
		$this->assertEquals( 'google_ads', $attributions['last_touch']['source'] );
		$this->assertEquals( 1.0, $attributions['last_touch']['weight'] );
	}

	/**
	 * Test empty touchpoints returns empty attributions.
	 */
	public function test_empty_touchpoints(): void {
		$tracker = $this->get_tracker_with_touchpoints( [] );

		$attributions = $tracker->calculate_attributions();

		$this->assertEmpty( $attributions );
	}

	/**
	 * Test source detection from click IDs.
	 */
	public function test_source_detection_google_ads(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'gclid' => 'google123', 'timestamp' => '2024-01-01T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();
		$this->assertEquals( 'google_ads', $attributions['first_touch']['source'] );
	}

	/**
	 * Test source detection for Meta ads.
	 */
	public function test_source_detection_meta_ads(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'fbclid' => 'meta123', 'timestamp' => '2024-01-01T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();
		$this->assertEquals( 'meta_ads', $attributions['first_touch']['source'] );
	}

	/**
	 * Test source detection for TikTok ads.
	 */
	public function test_source_detection_tiktok_ads(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'ttclid' => 'tiktok123', 'timestamp' => '2024-01-01T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();
		$this->assertEquals( 'tiktok_ads', $attributions['first_touch']['source'] );
	}

	/**
	 * Test source detection from UTM.
	 */
	public function test_source_detection_utm(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'utm_source' => 'newsletter', 'timestamp' => '2024-01-01T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();
		$this->assertEquals( 'newsletter', $attributions['first_touch']['source'] );
	}

	/**
	 * Test source detection falls back to direct.
	 */
	public function test_source_detection_direct(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'page_url' => 'https://example.com', 'timestamp' => '2024-01-01T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();
		$this->assertEquals( 'direct', $attributions['first_touch']['source'] );
	}

	/**
	 * Test aggregation of same source in linear model.
	 */
	public function test_linear_aggregates_same_source(): void {
		$tracker = $this->get_tracker_with_touchpoints( [
			[ 'gclid' => 'google1', 'timestamp' => '2024-01-01T10:00:00Z' ],
			[ 'gclid' => 'google2', 'timestamp' => '2024-01-05T10:00:00Z' ],
			[ 'fbclid' => 'meta1', 'timestamp' => '2024-01-10T10:00:00Z' ],
		] );

		$attributions = $tracker->calculate_attributions();

		// Find Google Ads weight.
		$google_weight = 0;
		$meta_weight   = 0;
		foreach ( $attributions['linear'] as $item ) {
			if ( 'google_ads' === $item['source'] ) {
				$google_weight = $item['weight'];
			}
			if ( 'meta_ads' === $item['source'] ) {
				$meta_weight = $item['weight'];
			}
		}

		// Google should have 2/3 credit, Meta 1/3.
		$this->assertEqualsWithDelta( 2.0 / 3, $google_weight, 0.01 );
		$this->assertEqualsWithDelta( 1.0 / 3, $meta_weight, 0.01 );
	}

	/**
	 * Helper to create tracker with pre-set touchpoints.
	 *
	 * @param array $touchpoints Touchpoints to set.
	 * @return \WAB_Touchpoint_Tracker
	 */
	private function get_tracker_with_touchpoints( array $touchpoints ): \WAB_Touchpoint_Tracker {
		// Set up cookie with touchpoints.
		$encoded = base64_encode( wp_json_encode( $touchpoints ) );
		$_COOKIE[ \WAB_Touchpoint_Tracker::COOKIE_NAME ] = $encoded;

		return new \WAB_Touchpoint_Tracker();
	}
}
