<?php
/**
 * Abstract Integration tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use WAB_Integration;
use Mockery;

/**
 * Concrete test implementation of abstract WAB_Integration.
 */
class TestIntegration extends \WAB_Integration {
	protected string $id = 'test';
	protected string $name = 'Test Integration';
	protected string $enabled_option = 'wab_test_enabled';
	protected ?string $click_id_param = 'testclid';

	public function get_required_settings(): array {
		return [ 'wab_test_api_key' ];
	}

	public function is_configured(): bool {
		return ! empty( get_option( 'wab_test_api_key' ) );
	}

	public function send( \WC_Order $order, array $payload ): array {
		return [ 'success' => true ];
	}

	public function prepare_payload( \WC_Order $order, array $attribution ): array {
		$click_id = $this->get_click_id( $attribution );

		return [
			'order_id'  => $order->get_id(),
			'value'     => (float) $order->get_total(),
			'currency'  => $order->get_currency(),
			'click_id'  => $click_id,
			'user_data' => $this->get_user_data( $order ),
		];
	}
}

/**
 * Test class for WAB_Integration.
 */
class IntegrationTest extends WabTestCase {

	/**
	 * Mock order.
	 *
	 * @var \Mockery\MockInterface
	 */
	private $mock_order;

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_test_enabled' => true,
			'wab_test_api_key' => 'test_api_key_123',
			'wab_dedup_enabled' => true,
			'wab_debug_mode'    => false,
		];

		$this->mock_order = Mockery::mock( 'WC_Order' );
		$this->mock_order->shouldReceive( 'get_id' )->andReturn( 123 );
		$this->mock_order->shouldReceive( 'get_total' )->andReturn( 99.99 );
		$this->mock_order->shouldReceive( 'get_currency' )->andReturn( 'GBP' );
		$this->mock_order->shouldReceive( 'get_billing_email' )->andReturn( 'test@example.com' );
		$this->mock_order->shouldReceive( 'get_billing_phone' )->andReturn( '+441234567890' );
		$this->mock_order->shouldReceive( 'get_billing_first_name' )->andReturn( 'John' );
		$this->mock_order->shouldReceive( 'get_billing_last_name' )->andReturn( 'Doe' );
		$this->mock_order->shouldReceive( 'get_billing_city' )->andReturn( 'London' );
		$this->mock_order->shouldReceive( 'get_billing_state' )->andReturn( '' );
		$this->mock_order->shouldReceive( 'get_billing_postcode' )->andReturn( 'SW1A 1AA' );
		$this->mock_order->shouldReceive( 'get_billing_country' )->andReturn( 'GB' );
		$this->mock_order->shouldReceive( 'get_billing_address_1' )->andReturn( '10 Downing St' );
		$this->mock_order->shouldReceive( 'get_items' )->andReturn( [] );
	}

	/**
	 * Test get_id returns correct ID.
	 */
	public function test_get_id(): void {
		$integration = new TestIntegration();
		$this->assertEquals( 'test', $integration->get_id() );
	}

	/**
	 * Test get_name returns correct name.
	 */
	public function test_get_name(): void {
		$integration = new TestIntegration();
		$this->assertEquals( 'Test Integration', $integration->get_name() );
	}

	/**
	 * Test is_enabled returns true when enabled.
	 */
	public function test_is_enabled_returns_true(): void {
		$integration = new TestIntegration();
		$this->assertTrue( $integration->is_enabled() );
	}

	/**
	 * Test is_enabled returns false when disabled.
	 */
	public function test_is_enabled_returns_false(): void {
		global $wab_test_options;
		$wab_test_options['wab_test_enabled'] = false;

		$integration = new TestIntegration();
		$this->assertFalse( $integration->is_enabled() );
	}

	/**
	 * Test is_configured returns true when configured.
	 */
	public function test_is_configured_returns_true(): void {
		$integration = new TestIntegration();
		$this->assertTrue( $integration->is_configured() );
	}

	/**
	 * Test is_configured returns false when not configured.
	 */
	public function test_is_configured_returns_false(): void {
		global $wab_test_options;
		$wab_test_options['wab_test_api_key'] = '';

		$integration = new TestIntegration();
		$this->assertFalse( $integration->is_configured() );
	}

	/**
	 * Test get_click_id extracts the click ID.
	 */
	public function test_get_click_id_extracts(): void {
		$integration = new TestIntegration();
		$attribution = [ 'testclid' => 'test_click_id_123' ];

		$this->assertEquals( 'test_click_id_123', $integration->get_click_id( $attribution ) );
	}

	/**
	 * Test get_click_id returns null when missing.
	 */
	public function test_get_click_id_returns_null(): void {
		$integration = new TestIntegration();
		$attribution = [ 'other_param' => 'value' ];

		$this->assertNull( $integration->get_click_id( $attribution ) );
	}

	/**
	 * Test validate_settings returns valid when all present.
	 */
	public function test_validate_settings_valid(): void {
		$integration = new TestIntegration();
		$validation  = $integration->validate_settings();

		$this->assertTrue( $validation['valid'] );
		$this->assertEmpty( $validation['missing'] );
	}

	/**
	 * Test validate_settings returns missing.
	 */
	public function test_validate_settings_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_test_api_key'] = '';

		$integration = new TestIntegration();
		$validation  = $integration->validate_settings();

		$this->assertFalse( $validation['valid'] );
		$this->assertContains( 'wab_test_api_key', $validation['missing'] );
	}

	/**
	 * Test should_send returns false when disabled.
	 */
	public function test_should_send_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_test_enabled'] = false;

		$integration = new TestIntegration();

		$this->assertFalse( $integration->should_send( $this->mock_order, [] ) );
	}

	/**
	 * Test should_send returns false when not configured.
	 */
	public function test_should_send_returns_false_when_not_configured(): void {
		global $wab_test_options;
		$wab_test_options['wab_test_api_key'] = '';

		$integration = new TestIntegration();

		$this->assertFalse( $integration->should_send( $this->mock_order, [] ) );
	}

	/**
	 * Test should_send returns true when all conditions met.
	 */
	public function test_should_send_returns_true_when_valid(): void {
		$integration = new TestIntegration();
		$attribution = [ 'testclid' => 'test_click_123' ];

		$this->assertTrue( $integration->should_send( $this->mock_order, $attribution ) );
	}

	/**
	 * Test prepare_payload includes order data.
	 */
	public function test_prepare_payload_includes_order_data(): void {
		$integration = new TestIntegration();
		$attribution = [ 'testclid' => 'test_click_123' ];

		$payload = $integration->prepare_payload( $this->mock_order, $attribution );

		$this->assertEquals( 123, $payload['order_id'] );
		$this->assertEquals( 99.99, $payload['value'] );
		$this->assertEquals( 'GBP', $payload['currency'] );
		$this->assertEquals( 'test_click_123', $payload['click_id'] );
	}

	/**
	 * Test prepare_payload includes user data.
	 */
	public function test_prepare_payload_includes_user_data(): void {
		$integration = new TestIntegration();
		$attribution = [];

		$payload = $integration->prepare_payload( $this->mock_order, $attribution );

		$this->assertArrayHasKey( 'user_data', $payload );
		$this->assertArrayHasKey( 'email', $payload['user_data'] );
		$this->assertArrayHasKey( 'phone', $payload['user_data'] );
		$this->assertArrayHasKey( 'email_hash', $payload['user_data'] );
	}

	/**
	 * Test get_required_settings returns array.
	 */
	public function test_get_required_settings(): void {
		$integration = new TestIntegration();
		$required    = $integration->get_required_settings();

		$this->assertIsArray( $required );
		$this->assertContains( 'wab_test_api_key', $required );
	}
}
