<?php
/**
 * Google Ads integration tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit\Integrations;

use WAB\Tests\Unit\WabTestCase;
use WAB_Google_Ads;

/**
 * Test class for WAB_Google_Ads integration.
 */
class GoogleAdsTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_google_enabled'             => true,
			'wab_google_customer_id'         => '123-456-7890',
			'wab_google_conversion_action_id' => '12345',
			'wab_google_access_token'        => 'test_access_token',
			'wab_google_developer_token'     => 'test_developer_token',
			'wab_google_enhanced_conversions' => false,
			'wab_dedup_enabled'              => true,
			'wab_debug_mode'                 => false,
		];
	}

	/**
	 * Test integration ID is correct.
	 */
	public function test_integration_id(): void {
		$google = new WAB_Google_Ads();
		$this->assertEquals( 'google', $google->get_id() );
	}

	/**
	 * Test integration name is correct.
	 */
	public function test_integration_name(): void {
		$google = new WAB_Google_Ads();
		$this->assertEquals( 'Google Ads', $google->get_name() );
	}

	/**
	 * Test is_enabled returns true when enabled.
	 */
	public function test_is_enabled_returns_true_when_enabled(): void {
		$google = new WAB_Google_Ads();
		$this->assertTrue( $google->is_enabled() );
	}

	/**
	 * Test is_enabled returns false when disabled.
	 */
	public function test_is_enabled_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_enabled'] = false;

		$google = new WAB_Google_Ads();
		$this->assertFalse( $google->is_enabled() );
	}

	/**
	 * Test is_configured returns true when all settings present.
	 */
	public function test_is_configured_returns_true_when_configured(): void {
		$google = new WAB_Google_Ads();
		$this->assertTrue( $google->is_configured() );
	}

	/**
	 * Test is_configured returns false when customer_id missing.
	 */
	public function test_is_configured_returns_false_when_customer_id_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_customer_id'] = '';

		$google = new WAB_Google_Ads();
		$this->assertFalse( $google->is_configured() );
	}

	/**
	 * Test is_configured returns false when conversion_action_id missing.
	 */
	public function test_is_configured_returns_false_when_conversion_action_id_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_conversion_action_id'] = '';

		$google = new WAB_Google_Ads();
		$this->assertFalse( $google->is_configured() );
	}

	/**
	 * Test get_required_settings returns correct settings.
	 */
	public function test_get_required_settings(): void {
		$google   = new WAB_Google_Ads();
		$required = $google->get_required_settings();

		$this->assertContains( 'wab_google_customer_id', $required );
		$this->assertContains( 'wab_google_conversion_action_id', $required );
		$this->assertContains( 'wab_google_access_token', $required );
	}

	/**
	 * Test get_click_id extracts gclid.
	 */
	public function test_get_click_id_extracts_gclid(): void {
		$google      = new WAB_Google_Ads();
		$attribution = [
			'gclid'  => 'test_google_click_id_123',
			'fbclid' => 'test_fb_click_id',
		];

		$click_id = $google->get_click_id( $attribution );

		$this->assertEquals( 'test_google_click_id_123', $click_id );
	}

	/**
	 * Test get_click_id returns null when gclid missing.
	 */
	public function test_get_click_id_returns_null_when_missing(): void {
		$google      = new WAB_Google_Ads();
		$attribution = [
			'fbclid' => 'test_fb_click_id',
		];

		$click_id = $google->get_click_id( $attribution );

		$this->assertNull( $click_id );
	}

	/**
	 * Test Google Ads does not support sending without click ID by default.
	 */
	public function test_does_not_support_sending_without_click_id_by_default(): void {
		$google = new WAB_Google_Ads();

		// Use reflection to test protected method.
		$reflection = new \ReflectionClass( $google );
		$method     = $reflection->getMethod( 'supports_sending_without_click_id' );
		$method->setAccessible( true );

		$this->assertFalse( $method->invoke( $google ) );
	}

	/**
	 * Test Google Ads supports sending without click ID when enhanced conversions enabled.
	 */
	public function test_supports_sending_without_click_id_when_enhanced_enabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_enhanced_conversions'] = true;

		$google = new WAB_Google_Ads();

		$reflection = new \ReflectionClass( $google );
		$method     = $reflection->getMethod( 'supports_sending_without_click_id' );
		$method->setAccessible( true );

		$this->assertTrue( $method->invoke( $google ) );
	}

	/**
	 * Test validate_settings with all settings present.
	 */
	public function test_validate_settings_with_all_present(): void {
		$google     = new WAB_Google_Ads();
		$validation = $google->validate_settings();

		$this->assertTrue( $validation['valid'] );
		$this->assertEmpty( $validation['missing'] );
	}

	/**
	 * Test validate_settings with missing settings.
	 */
	public function test_validate_settings_with_missing_settings(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_customer_id'] = '';
		$wab_test_options['wab_google_access_token'] = '';

		$google     = new WAB_Google_Ads();
		$validation = $google->validate_settings();

		$this->assertFalse( $validation['valid'] );
		$this->assertContains( 'wab_google_customer_id', $validation['missing'] );
		$this->assertContains( 'wab_google_access_token', $validation['missing'] );
	}

	/**
	 * Test is_configured returns false when access_token missing.
	 */
	public function test_is_configured_returns_false_when_access_token_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_access_token'] = '';

		$google = new WAB_Google_Ads();
		$this->assertFalse( $google->is_configured() );
	}

	/**
	 * Test prepare_payload returns correct structure.
	 */
	public function test_prepare_payload_structure(): void {
		$order  = $this->create_mock_order( 123 );
		$google = new WAB_Google_Ads();

		$payload = $google->prepare_payload( $order, [ 'gclid' => 'test_gclid' ] );

		$this->assertArrayHasKey( 'conversions', $payload );
		$this->assertArrayHasKey( 'partialFailure', $payload );
		$this->assertTrue( $payload['partialFailure'] );
		$this->assertCount( 1, $payload['conversions'] );
	}

	/**
	 * Test prepare_payload has correct conversion action format.
	 */
	public function test_prepare_payload_conversion_action_format(): void {
		$order  = $this->create_mock_order( 123 );
		$google = new WAB_Google_Ads();

		$payload    = $google->prepare_payload( $order, [] );
		$conversion = $payload['conversions'][0];

		// Customer ID: 123-456-7890 should become 1234567890
		$expected = 'customers/1234567890/conversionActions/12345';
		$this->assertEquals( $expected, $conversion['conversionAction'] );
	}

	/**
	 * Test prepare_payload removes dashes from customer ID.
	 */
	public function test_prepare_payload_customer_id_dashes_removed(): void {
		$order  = $this->create_mock_order( 123 );
		$google = new WAB_Google_Ads();

		$payload    = $google->prepare_payload( $order, [] );
		$conversion = $payload['conversions'][0];

		// Should not contain dashes.
		$this->assertStringNotContainsString( '-', $conversion['conversionAction'] );
		$this->assertStringContainsString( '1234567890', $conversion['conversionAction'] );
	}

	/**
	 * Test prepare_payload datetime format.
	 */
	public function test_prepare_payload_datetime_format(): void {
		$order  = $this->create_mock_order( 123 );
		$google = new WAB_Google_Ads();

		$payload    = $google->prepare_payload( $order, [] );
		$conversion = $payload['conversions'][0];

		// Format: yyyy-MM-dd HH:mm:ss+|-HH:mm
		$this->assertArrayHasKey( 'conversionDateTime', $conversion );
		$this->assertMatchesRegularExpression(
			'/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/',
			$conversion['conversionDateTime']
		);
	}

	/**
	 * Test prepare_payload includes gclid when present.
	 */
	public function test_prepare_payload_gclid_included(): void {
		$order  = $this->create_mock_order( 123 );
		$google = new WAB_Google_Ads();

		$payload    = $google->prepare_payload( $order, [ 'gclid' => 'CjwKCAiA123456' ] );
		$conversion = $payload['conversions'][0];

		$this->assertArrayHasKey( 'gclid', $conversion );
		$this->assertEquals( 'CjwKCAiA123456', $conversion['gclid'] );
	}

	/**
	 * Test prepare_payload has no gclid field when not provided.
	 */
	public function test_prepare_payload_no_gclid(): void {
		$order  = $this->create_mock_order( 123 );
		$google = new WAB_Google_Ads();

		$payload    = $google->prepare_payload( $order, [] );
		$conversion = $payload['conversions'][0];

		$this->assertArrayNotHasKey( 'gclid', $conversion );
	}

	/**
	 * Test prepare_payload includes userIdentifiers when enhanced conversions enabled.
	 */
	public function test_prepare_payload_enhanced_conversions(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_enhanced_conversions'] = true;

		$order  = $this->create_mock_order( 123, [
			'billing_email' => 'test@example.com',
		] );
		$google = new WAB_Google_Ads();

		$payload    = $google->prepare_payload( $order, [] );
		$conversion = $payload['conversions'][0];

		$this->assertArrayHasKey( 'userIdentifiers', $conversion );
		$this->assertIsArray( $conversion['userIdentifiers'] );
	}

	/**
	 * Test prepare_payload user identifiers are hashed.
	 */
	public function test_prepare_payload_user_identifiers_hashed(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_enhanced_conversions'] = true;

		$order  = $this->create_mock_order( 123, [
			'billing_email' => 'Test@Example.com',
			'billing_phone' => '+44 123 456 7890',
		] );
		$google = new WAB_Google_Ads();

		$payload         = $google->prepare_payload( $order, [] );
		$user_identifiers = $payload['conversions'][0]['userIdentifiers'];

		// Find email identifier.
		$email_identifier = null;
		foreach ( $user_identifiers as $identifier ) {
			if ( isset( $identifier['hashedEmail'] ) ) {
				$email_identifier = $identifier;
				break;
			}
		}

		$this->assertNotNull( $email_identifier, 'Email identifier should be present' );
		$expected_hash = hash( 'sha256', 'test@example.com' );
		$this->assertEquals( $expected_hash, $email_identifier['hashedEmail'] );
	}

	/**
	 * Test prepare_payload includes order value and currency.
	 */
	public function test_prepare_payload_includes_order_value(): void {
		$order  = $this->create_mock_order( 123, [
			'total'    => '149.99',
			'currency' => 'GBP',
		] );
		$google = new WAB_Google_Ads();

		$payload    = $google->prepare_payload( $order, [] );
		$conversion = $payload['conversions'][0];

		$this->assertEquals( 149.99, $conversion['conversionValue'] );
		$this->assertEquals( 'GBP', $conversion['currencyCode'] );
		$this->assertEquals( '123', $conversion['orderId'] );
	}

	/**
	 * Test should_send returns true when enabled with gclid.
	 */
	public function test_should_send_with_gclid(): void {
		$order  = $this->create_mock_order( 123 );
		$google = new WAB_Google_Ads();

		$result = $google->should_send( $order, [ 'gclid' => 'test_gclid' ] );

		$this->assertTrue( $result );
	}

	/**
	 * Test should_send returns false without gclid and no enhanced conversions.
	 */
	public function test_should_send_without_gclid(): void {
		$order  = $this->create_mock_order( 123 );
		$google = new WAB_Google_Ads();

		$result = $google->should_send( $order, [] );

		$this->assertFalse( $result );
	}

	/**
	 * Test should_send returns true without gclid when enhanced conversions enabled.
	 */
	public function test_should_send_enhanced_no_gclid(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_enhanced_conversions'] = true;

		$order  = $this->create_mock_order( 123 );
		$google = new WAB_Google_Ads();

		$result = $google->should_send( $order, [] );

		$this->assertTrue( $result );
	}

	/**
	 * Test format_google_datetime with timezone.
	 */
	public function test_format_datetime_with_timezone(): void {
		$google     = new WAB_Google_Ads();
		$reflection = new \ReflectionClass( $google );
		$method     = $reflection->getMethod( 'format_google_datetime' );
		$method->setAccessible( true );

		// Test with UTC.
		$date   = new \WC_DateTime( '2024-01-15 10:30:00', new \DateTimeZone( 'UTC' ) );
		$result = $method->invoke( $google, $date );

		$this->assertMatchesRegularExpression(
			'/^2024-01-15 10:30:00[+-]\d{2}:\d{2}$/',
			$result
		);
	}

	/**
	 * Create a mock WC_Order for testing.
	 *
	 * @param int   $id    Order ID.
	 * @param array $props Order properties.
	 * @return \WC_Order
	 */
	private function create_mock_order( int $id, array $props = [] ): \WC_Order {
		$order = new \WC_Order( $id );

		$defaults = [
			'billing_email'      => 'test@example.com',
			'billing_phone'      => '1234567890',
			'billing_first_name' => 'John',
			'billing_last_name'  => 'Doe',
			'billing_city'       => 'London',
			'billing_state'      => 'Greater London',
			'billing_postcode'   => 'SW1A 1AA',
			'billing_country'    => 'GB',
			'currency'           => 'GBP',
			'total'              => '99.99',
		];

		$props = array_merge( $defaults, $props );

		if ( isset( $props['billing_email'] ) ) {
			$order->set_billing_email( $props['billing_email'] );
		}
		if ( isset( $props['billing_phone'] ) ) {
			$order->set_billing_phone( $props['billing_phone'] );
		}
		if ( isset( $props['billing_first_name'] ) ) {
			$order->set_billing_first_name( $props['billing_first_name'] );
		}
		if ( isset( $props['billing_last_name'] ) ) {
			$order->set_billing_last_name( $props['billing_last_name'] );
		}
		if ( isset( $props['billing_city'] ) ) {
			$order->set_billing_city( $props['billing_city'] );
		}
		if ( isset( $props['billing_state'] ) ) {
			$order->set_billing_state( $props['billing_state'] );
		}
		if ( isset( $props['billing_postcode'] ) ) {
			$order->set_billing_postcode( $props['billing_postcode'] );
		}
		if ( isset( $props['billing_country'] ) ) {
			$order->set_billing_country( $props['billing_country'] );
		}
		if ( isset( $props['currency'] ) ) {
			$order->set_currency( $props['currency'] );
		}
		if ( isset( $props['total'] ) ) {
			$order->set_total( $props['total'] );
		}

		return $order;
	}
}
