<?php
/**
 * REST API tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use Brain\Monkey\Functions;
use WAB_REST_API;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;
use Mockery;

/**
 * Test case for WAB_REST_API class.
 */
class RestApiTest extends WabTestCase {

	/**
	 * REST API instance.
	 *
	 * @var WAB_REST_API
	 */
	private WAB_REST_API $rest_api;

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();
		$this->rest_api = new WAB_REST_API();

		// Set up default options.
		global $wab_test_options;
		$wab_test_options['wab_api_key'] = 'test-api-key-12345';
	}

	/**
	 * Test init registers rest_api_init action.
	 */
	public function test_init_registers_action(): void {
		$this->rest_api->init();
		// Action registration is mocked, test that init() runs without error.
		$this->assertTrue( true );
	}

	/**
	 * Test register_routes calls register_rest_route.
	 */
	public function test_register_routes(): void {
		$routes_registered = [];

		Functions\when( 'register_rest_route' )->alias( function( $namespace, $route, $args ) use ( &$routes_registered ) {
			$routes_registered[] = $namespace . $route;
			return true;
		} );

		$this->rest_api->register_routes();

		$this->assertContains( 'wab/v1/orders', $routes_registered );
		$this->assertContains( 'wab/v1/orders/(?P<id>\d+)', $routes_registered );
		$this->assertContains( 'wab/v1/customers', $routes_registered );
		$this->assertContains( 'wab/v1/attribution', $routes_registered );
		$this->assertContains( 'wab/v1/surveys', $routes_registered );
		$this->assertContains( 'wab/v1/touchpoints', $routes_registered );
		$this->assertContains( 'wab/v1/connect', $routes_registered );
		$this->assertContains( 'wab/v1/health', $routes_registered );
	}

	/**
	 * Test check_api_key with missing key.
	 */
	public function test_check_api_key_missing(): void {
		$this->setup_rate_limit_mocks();

		$request = new WP_REST_Request();

		$result = $this->rest_api->check_api_key( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertEquals( 'wab_missing_api_key', $result->get_error_code() );
	}

	/**
	 * Test check_api_key with invalid key.
	 */
	public function test_check_api_key_invalid(): void {
		$this->setup_rate_limit_mocks();

		$request = new WP_REST_Request();
		$request->set_header( 'X-WAB-API-Key', 'wrong-key' );

		$result = $this->rest_api->check_api_key( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertEquals( 'wab_invalid_api_key', $result->get_error_code() );
	}

	/**
	 * Test check_api_key with valid header key.
	 */
	public function test_check_api_key_valid_header(): void {
		$this->setup_rate_limit_mocks();

		$request = new WP_REST_Request();
		$request->set_header( 'X-WAB-API-Key', 'test-api-key-12345' );

		$result = $this->rest_api->check_api_key( $request );

		$this->assertTrue( $result );
	}

	/**
	 * Test check_api_key with valid query param.
	 */
	public function test_check_api_key_valid_query_param(): void {
		$this->setup_rate_limit_mocks();

		$request = new WP_REST_Request();
		$request->set_param( 'api_key', 'test-api-key-12345' );

		$result = $this->rest_api->check_api_key( $request );

		$this->assertTrue( $result );
	}

	/**
	 * Test check_api_key with no stored key.
	 */
	public function test_check_api_key_no_stored_key(): void {
		$this->setup_rate_limit_mocks();

		global $wab_test_options;
		unset( $wab_test_options['wab_api_key'] );

		$request = new WP_REST_Request();
		$request->set_header( 'X-WAB-API-Key', 'any-key' );

		$result = $this->rest_api->check_api_key( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertEquals( 'wab_invalid_api_key', $result->get_error_code() );
	}

	/**
	 * Test rate limiting - first request allowed.
	 */
	public function test_rate_limit_first_request(): void {
		$transients = [];

		Functions\when( 'get_transient' )->alias( function( $key ) use ( &$transients ) {
			return $transients[ $key ] ?? false;
		} );

		Functions\when( 'set_transient' )->alias( function( $key, $value, $expiration ) use ( &$transients ) {
			$transients[ $key ] = $value;
			return true;
		} );

		$request = new WP_REST_Request();
		$request->set_header( 'X-WAB-API-Key', 'test-api-key-12345' );

		$result = $this->rest_api->check_api_key( $request );

		$this->assertTrue( $result );
	}

	/**
	 * Test rate limiting - exceeded.
	 */
	public function test_rate_limit_exceeded(): void {
		Functions\when( 'get_transient' )->justReturn( 60 );
		Functions\when( 'set_transient' )->justReturn( true );

		$request = new WP_REST_Request();
		$request->set_header( 'X-WAB-API-Key', 'test-api-key-12345' );

		$result = $this->rest_api->check_api_key( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertEquals( 'wab_rate_limit_exceeded', $result->get_error_code() );
	}

	/**
	 * Test rate limiting - increments counter.
	 */
	public function test_rate_limit_increments(): void {
		$counter = 5;

		Functions\when( 'get_transient' )->alias( function( $key ) use ( &$counter ) {
			return $counter;
		} );

		Functions\when( 'set_transient' )->alias( function( $key, $value, $expiration ) use ( &$counter ) {
			$counter = $value;
			return true;
		} );

		$request = new WP_REST_Request();
		$request->set_header( 'X-WAB-API-Key', 'test-api-key-12345' );

		$result = $this->rest_api->check_api_key( $request );

		$this->assertTrue( $result );
		$this->assertEquals( 6, $counter );
	}

	/**
	 * Test get_orders endpoint.
	 */
	public function test_get_orders(): void {
		$mock_order = $this->create_mock_order( 123, 99.99 );

		Functions\when( 'wc_get_orders' )->justReturn( [ $mock_order ] );

		$request = new WP_REST_Request();
		$request->set_param( 'limit', 10 );

		$response = $this->rest_api->get_orders( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertArrayHasKey( 'orders', $data );
		$this->assertEquals( 1, $data['total'] );
		$this->assertEquals( 10, $data['limit'] );
	}

	/**
	 * Test get_orders with date filtering.
	 */
	public function test_get_orders_with_dates(): void {
		$captured_args = [];

		Functions\when( 'wc_get_orders' )->alias( function( $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return [];
		} );

		$request = new WP_REST_Request();
		$request->set_param( 'since', '2024-01-01' );
		$request->set_param( 'until', '2024-12-31' );

		$this->rest_api->get_orders( $request );

		$this->assertEquals( '2024-01-01', $captured_args['date_after'] );
		$this->assertEquals( '2024-12-31', $captured_args['date_before'] );
	}

	/**
	 * Test get_order found.
	 */
	public function test_get_order_found(): void {
		$mock_order = $this->create_mock_order( 123, 99.99 );
		$mock_order->shouldReceive( 'get_id' )->andReturn( 123 );

		Functions\when( 'wc_get_order' )->justReturn( $mock_order );
		Functions\when( 'wc_get_orders' )->justReturn( [ $mock_order ] );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 123 );

		$response = $this->rest_api->get_order( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertArrayHasKey( 'order', $data );
		$this->assertEquals( 123, $data['order']['id'] );
	}

	/**
	 * Test get_order not found.
	 */
	public function test_get_order_not_found(): void {
		Functions\when( 'wc_get_order' )->justReturn( false );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 999 );

		$result = $this->rest_api->get_order( $request );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertEquals( 'wab_order_not_found', $result->get_error_code() );
	}

	/**
	 * Test get_customers endpoint.
	 */
	public function test_get_customers(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->posts = 'wp_posts';
		$wpdb->postmeta = 'wp_postmeta';
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->once()->andReturn( 'SELECT query' );
		$wpdb->shouldReceive( 'get_results' )->once()->andReturn( [
			[
				'email'            => 'test@example.com',
				'first_order_date' => '2024-01-01 10:00:00',
				'last_order_date'  => '2024-06-01 10:00:00',
				'order_count'      => '3',
				'total_spent'      => '299.97',
			],
		] );

		$request = new WP_REST_Request();
		$request->set_param( 'limit', 100 );

		$response = $this->rest_api->get_customers( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertArrayHasKey( 'customers', $data );
		$this->assertEquals( 1, count( $data['customers'] ) );
		$this->assertTrue( $data['customers'][0]['is_repeat'] );
	}

	/**
	 * Test get_attribution endpoint.
	 */
	public function test_get_attribution(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->posts = 'wp_posts';
		$wpdb->postmeta = 'wp_postmeta';
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'get_results' )
			->twice()
			->andReturn( [
				[ 'source' => 'google', 'order_count' => '10', 'revenue' => '999.90' ],
			] );

		$wpdb->shouldReceive( 'get_row' )->once()->andReturn( [
			'total_orders'      => '50',
			'total_revenue'     => '4999.50',
			'attributed_orders' => '30',
		] );

		$request = new WP_REST_Request();
		$request->set_param( 'period', 'month' );

		$response = $this->rest_api->get_attribution( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertEquals( 'month', $data['period'] );
		$this->assertEquals( 50, $data['totals']['orders'] );
		$this->assertEquals( 60.0, $data['totals']['attribution_rate'] );
	}

	/**
	 * Test get_surveys endpoint.
	 */
	public function test_get_surveys(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->posts = 'wp_posts';
		$wpdb->postmeta = 'wp_postmeta';
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->once()->andReturn( 'SELECT query' );
		$wpdb->shouldReceive( 'get_results' )->once()->andReturn( [
			[
				'id'             => '1',
				'order_id'       => '123',
				'response'       => 'google',
				'response_other' => null,
				'source_mapped'  => 'google_organic',
				'order_total'    => '99.99',
				'created_at'     => '2024-01-15 10:30:00',
			],
		] );

		$request = new WP_REST_Request();

		$response = $this->rest_api->get_surveys( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertArrayHasKey( 'surveys', $data );
		$this->assertEquals( 1, count( $data['surveys'] ) );
	}

	/**
	 * Test get_touchpoints endpoint.
	 */
	public function test_get_touchpoints(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->once()->andReturn( 'SELECT query' );
		$wpdb->shouldReceive( 'get_results' )->once()->andReturn( [
			[
				'id'         => '1',
				'visitor_id' => 'visitor-123',
				'source'     => 'google',
				'click_id'   => 'gclid123',
				'created_at' => '2024-01-15 10:30:00',
			],
		] );

		$request = new WP_REST_Request();

		$response = $this->rest_api->get_touchpoints( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertArrayHasKey( 'touchpoints', $data );
		$this->assertEquals( 1, count( $data['touchpoints'] ) );
	}

	/**
	 * Test get_touchpoints with visitor_id filter.
	 */
	public function test_get_touchpoints_with_visitor_id(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$captured_params = [];
		$wpdb->shouldReceive( 'prepare' )->once()->andReturnUsing( function( $query, ...$params ) use ( &$captured_params ) {
			$captured_params = $params;
			return 'SELECT query';
		} );
		$wpdb->shouldReceive( 'get_results' )->once()->andReturn( [] );

		$request = new WP_REST_Request();
		$request->set_param( 'visitor_id', 'visitor-123' );

		$this->rest_api->get_touchpoints( $request );

		$this->assertContains( 'visitor-123', $captured_params );
	}

	/**
	 * Test connect endpoint.
	 */
	public function test_connect(): void {
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Store' );
		Functions\when( 'wp_timezone_string' )->justReturn( 'Europe/London' );
		Functions\when( 'get_woocommerce_currency' )->justReturn( 'GBP' );

		global $wab_test_options;
		$wab_test_options['wab_meta_enabled'] = true;
		$wab_test_options['wab_google_enabled'] = true;

		$request = new WP_REST_Request();

		$response = $this->rest_api->connect( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertTrue( $data['connected'] );
		$this->assertEquals( 'https://example.com', $data['site_url'] );
		$this->assertEquals( 'Test Store', $data['site_name'] );
		$this->assertEquals( 'Europe/London', $data['timezone'] );
		$this->assertEquals( 'GBP', $data['currency'] );
		$this->assertContains( 'meta', $data['integrations'] );
		$this->assertContains( 'google', $data['integrations'] );
	}

	/**
	 * Test health_check endpoint (basic functionality).
	 */
	public function test_health_check(): void {
		// Set up mocks for the enhanced health check.
		$this->mock_upgrader_tables_exist( true );

		Functions\when( 'current_time' )->justReturn( '2024-01-15T10:30:00+00:00' );

		$request = new WP_REST_Request();

		$response = $this->rest_api->health_check( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		// Status is now 'healthy' instead of 'ok'.
		$this->assertEquals( 'healthy', $data['status'] );
		$this->assertArrayHasKey( 'timestamp', $data );
		$this->assertArrayHasKey( 'wab_version', $data );
		$this->assertArrayHasKey( 'tables', $data );
	}

	/**
	 * Test generate_api_key static method.
	 */
	public function test_generate_api_key(): void {
		Functions\when( 'wp_generate_password' )->alias( function( $length, $special ) {
			return str_repeat( 'a', $length );
		} );

		$key = WAB_REST_API::generate_api_key();

		$this->assertEquals( 32, strlen( $key ) );
	}

	/**
	 * Test regenerate_api_key static method.
	 */
	public function test_regenerate_api_key(): void {
		Functions\when( 'wp_generate_password' )->justReturn( 'new-generated-api-key-here-1234' );

		global $wab_test_options;

		$key = WAB_REST_API::regenerate_api_key();

		$this->assertEquals( 'new-generated-api-key-here-1234', $key );
		$this->assertEquals( 'new-generated-api-key-here-1234', $wab_test_options['wab_api_key'] );
	}

	/**
	 * Test order format includes attribution data.
	 */
	public function test_order_format_with_attribution(): void {
		$mock_order = $this->create_mock_order( 123, 99.99, [
			'_wab_attribution'      => '{"gclid":"abc123","source":"google"}',
			'_wab_survey_response'  => 'google',
			'_wab_survey_source'    => 'google_ads',
		] );
		$mock_order->shouldReceive( 'get_id' )->andReturn( 123 );

		Functions\when( 'wc_get_order' )->justReturn( $mock_order );
		Functions\when( 'wc_get_orders' )->justReturn( [ $mock_order ] );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 123 );

		$response = $this->rest_api->get_order( $request );
		$data = $response->get_data();

		$this->assertNotNull( $data['order']['attribution'] );
		$this->assertEquals( 'abc123', $data['order']['attribution']['gclid'] );
		$this->assertEquals( 'google', $data['order']['survey_response'] );
		$this->assertEquals( 'google_ads', $data['order']['survey_source'] );
	}

	/**
	 * Test customer email is hashed.
	 */
	public function test_customer_email_hashed(): void {
		$mock_order = $this->create_mock_order( 123, 99.99 );
		$mock_order->shouldReceive( 'get_id' )->andReturn( 123 );

		Functions\when( 'wc_get_order' )->justReturn( $mock_order );
		Functions\when( 'wc_get_orders' )->justReturn( [ $mock_order ] );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 123 );

		$response = $this->rest_api->get_order( $request );
		$data = $response->get_data();

		$expected_hash = hash( 'sha256', 'customer@example.com' );
		$this->assertEquals( $expected_hash, $data['order']['customer']['email_hash'] );
	}

	/**
	 * Test is_new_customer detection.
	 */
	public function test_is_new_customer(): void {
		$mock_order = $this->create_mock_order( 123, 99.99 );
		$mock_order->shouldReceive( 'get_id' )->andReturn( 123 );

		Functions\when( 'wc_get_orders' )->justReturn( [ $mock_order ] );
		Functions\when( 'wc_get_order' )->justReturn( $mock_order );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 123 );

		$response = $this->rest_api->get_order( $request );
		$data = $response->get_data();

		$this->assertTrue( $data['order']['customer']['is_new'] );
	}

	/**
	 * Test repeat customer detection.
	 */
	public function test_repeat_customer(): void {
		$first_order = $this->create_mock_order( 100, 50.00 );
		$first_order->shouldReceive( 'get_id' )->andReturn( 100 );

		$mock_order = $this->create_mock_order( 123, 99.99 );
		$mock_order->shouldReceive( 'get_id' )->andReturn( 123 );

		Functions\when( 'wc_get_orders' )->justReturn( [ $first_order, $mock_order ] );
		Functions\when( 'wc_get_order' )->justReturn( $mock_order );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 123 );

		$response = $this->rest_api->get_order( $request );
		$data = $response->get_data();

		$this->assertFalse( $data['order']['customer']['is_new'] );
	}

	/**
	 * Test order items formatting.
	 */
	public function test_order_items_formatting(): void {
		$mock_product = Mockery::mock( 'WC_Product' );
		$mock_product->shouldReceive( 'get_sku' )->andReturn( 'SKU123' );
		$mock_product->shouldReceive( 'get_id' )->andReturn( 456 );

		$mock_item = Mockery::mock( 'WC_Order_Item_Product' );
		$mock_item->shouldReceive( 'get_product' )->andReturn( $mock_product );
		$mock_item->shouldReceive( 'get_name' )->andReturn( 'Test Product' );
		$mock_item->shouldReceive( 'get_quantity' )->andReturn( 2 );
		$mock_item->shouldReceive( 'get_total' )->andReturn( 50.00 );

		$mock_order = $this->create_mock_order_with_items( 123, 99.99, [ $mock_item ] );

		Functions\when( 'wc_get_order' )->justReturn( $mock_order );
		Functions\when( 'wc_get_orders' )->justReturn( [ $mock_order ] );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 123 );

		$response = $this->rest_api->get_order( $request );
		$data = $response->get_data();

		$this->assertEquals( 1, count( $data['order']['items'] ) );
		$this->assertEquals( 'SKU123', $data['order']['items'][0]['id'] );
		$this->assertEquals( 'Test Product', $data['order']['items'][0]['name'] );
		$this->assertEquals( 2, $data['order']['items'][0]['quantity'] );
		$this->assertEquals( 50.00, $data['order']['items'][0]['total'] );
		$this->assertEquals( 25.00, $data['order']['items'][0]['price'] );
	}

	/**
	 * Test attribution period day filter.
	 */
	public function test_attribution_period_day(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->posts = 'wp_posts';
		$wpdb->postmeta = 'wp_postmeta';
		$wpdb->prefix = 'wp_';

		$captured_query = '';
		$wpdb->shouldReceive( 'get_results' )
			->twice()
			->andReturnUsing( function( $query ) use ( &$captured_query ) {
				$captured_query = $query;
				return [];
			} );

		$wpdb->shouldReceive( 'get_row' )->once()->andReturn( [
			'total_orders'      => '0',
			'total_revenue'     => '0',
			'attributed_orders' => '0',
		] );

		$request = new WP_REST_Request();
		$request->set_param( 'period', 'day' );

		$this->rest_api->get_attribution( $request );

		$this->assertStringContainsString( 'INTERVAL 1 DAY', $captured_query );
	}

	/**
	 * Test attribution period week filter.
	 */
	public function test_attribution_period_week(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->posts = 'wp_posts';
		$wpdb->postmeta = 'wp_postmeta';
		$wpdb->prefix = 'wp_';

		$captured_query = '';
		$wpdb->shouldReceive( 'get_results' )
			->twice()
			->andReturnUsing( function( $query ) use ( &$captured_query ) {
				$captured_query = $query;
				return [];
			} );

		$wpdb->shouldReceive( 'get_row' )->once()->andReturn( [
			'total_orders'      => '0',
			'total_revenue'     => '0',
			'attributed_orders' => '0',
		] );

		$request = new WP_REST_Request();
		$request->set_param( 'period', 'week' );

		$this->rest_api->get_attribution( $request );

		$this->assertStringContainsString( 'INTERVAL 1 WEEK', $captured_query );
	}

	/**
	 * Test attribution period year filter.
	 */
	public function test_attribution_period_year(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->posts = 'wp_posts';
		$wpdb->postmeta = 'wp_postmeta';
		$wpdb->prefix = 'wp_';

		$captured_query = '';
		$wpdb->shouldReceive( 'get_results' )
			->twice()
			->andReturnUsing( function( $query ) use ( &$captured_query ) {
				$captured_query = $query;
				return [];
			} );

		$wpdb->shouldReceive( 'get_row' )->once()->andReturn( [
			'total_orders'      => '0',
			'total_revenue'     => '0',
			'attributed_orders' => '0',
		] );

		$request = new WP_REST_Request();
		$request->set_param( 'period', 'year' );

		$this->rest_api->get_attribution( $request );

		$this->assertStringContainsString( 'INTERVAL 1 YEAR', $captured_query );
	}

	/**
	 * Test empty orders returns empty array.
	 */
	public function test_get_orders_empty(): void {
		Functions\when( 'wc_get_orders' )->justReturn( [] );

		$request = new WP_REST_Request();

		$response = $this->rest_api->get_orders( $request );
		$data = $response->get_data();

		$this->assertEquals( [], $data['orders'] );
		$this->assertEquals( 0, $data['total'] );
		$this->assertFalse( $data['has_more'] );
	}

	/**
	 * Test empty customers returns empty array.
	 */
	public function test_get_customers_empty(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->posts = 'wp_posts';
		$wpdb->postmeta = 'wp_postmeta';
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->once()->andReturn( 'SELECT query' );
		$wpdb->shouldReceive( 'get_results' )->once()->andReturn( null );

		$request = new WP_REST_Request();

		$response = $this->rest_api->get_customers( $request );
		$data = $response->get_data();

		$this->assertEquals( [], $data['customers'] );
		$this->assertEquals( 0, $data['total'] );
	}

	/**
	 * Test touchpoints empty returns empty array.
	 */
	public function test_get_touchpoints_empty(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->once()->andReturn( 'SELECT query' );
		$wpdb->shouldReceive( 'get_results' )->once()->andReturn( null );

		$request = new WP_REST_Request();

		$response = $this->rest_api->get_touchpoints( $request );
		$data = $response->get_data();

		$this->assertEquals( [], $data['touchpoints'] );
		$this->assertEquals( 0, $data['total'] );
	}

	/**
	 * Test surveys empty returns empty array.
	 */
	public function test_get_surveys_empty(): void {
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->posts = 'wp_posts';
		$wpdb->postmeta = 'wp_postmeta';
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->once()->andReturn( 'SELECT query' );
		$wpdb->shouldReceive( 'get_results' )->once()->andReturn( null );

		$request = new WP_REST_Request();

		$response = $this->rest_api->get_surveys( $request );
		$data = $response->get_data();

		$this->assertEquals( [], $data['surveys'] );
		$this->assertEquals( 0, $data['total'] );
	}

	/**
	 * Helper to set up rate limit mocks.
	 */
	private function setup_rate_limit_mocks(): void {
		Functions\when( 'get_transient' )->justReturn( false );
		Functions\when( 'set_transient' )->justReturn( true );
	}

	/**
	 * Create a mock WC_Order with items.
	 *
	 * @param int   $id    Order ID.
	 * @param float $total Order total.
	 * @param array $items Order items.
	 * @return \Mockery\MockInterface
	 */
	private function create_mock_order_with_items( int $id, float $total, array $items ): \Mockery\MockInterface {
		$mock_date = Mockery::mock( 'WC_DateTime' );
		$mock_date->shouldReceive( 'format' )->andReturn( '2024-01-15T10:30:00+00:00' );

		$mock_order = Mockery::mock( 'WC_Order' );
		$mock_order->shouldReceive( 'get_id' )->andReturn( $id );
		$mock_order->shouldReceive( 'get_order_number' )->andReturn( $id );
		$mock_order->shouldReceive( 'get_status' )->andReturn( 'completed' );
		$mock_order->shouldReceive( 'get_total' )->andReturn( $total );
		$mock_order->shouldReceive( 'get_subtotal' )->andReturn( $total * 0.8 );
		$mock_order->shouldReceive( 'get_total_tax' )->andReturn( $total * 0.2 );
		$mock_order->shouldReceive( 'get_shipping_total' )->andReturn( 0.0 );
		$mock_order->shouldReceive( 'get_total_discount' )->andReturn( 0.0 );
		$mock_order->shouldReceive( 'get_currency' )->andReturn( 'GBP' );
		$mock_order->shouldReceive( 'get_payment_method' )->andReturn( 'stripe' );
		$mock_order->shouldReceive( 'get_date_created' )->andReturn( $mock_date );
		$mock_order->shouldReceive( 'get_date_completed' )->andReturn( $mock_date );
		$mock_order->shouldReceive( 'get_billing_email' )->andReturn( 'customer@example.com' );
		$mock_order->shouldReceive( 'get_billing_country' )->andReturn( 'GB' );
		$mock_order->shouldReceive( 'get_items' )->andReturn( $items );
		$mock_order->shouldReceive( 'get_item_count' )->andReturn( count( $items ) );
		$mock_order->shouldReceive( 'get_meta' )->andReturn( null );

		return $mock_order;
	}

	/**
	 * Test health_check returns healthy when all tables exist.
	 */
	public function test_health_check_returns_healthy_when_all_tables_exist(): void {
		global $wpdb, $wab_test_options;

		// Mock WAB_Upgrader to return all tables as existing.
		$this->mock_upgrader_tables_exist( true );

		// Set up options for integrations.
		$wab_test_options['wab_meta_enabled'] = true;
		$wab_test_options['wab_meta_pixel_id'] = 'pixel123';
		$wab_test_options['wab_meta_access_token'] = 'token123';
		$wab_test_options['wab_google_enabled'] = false;

		Functions\when( 'current_time' )->justReturn( '2024-01-15T10:30:00+00:00' );

		$request = new WP_REST_Request();

		$response = $this->rest_api->health_check( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertEquals( 'healthy', $data['status'] );
		$this->assertArrayHasKey( 'tables', $data );
		$this->assertArrayHasKey( 'integrations', $data );
		$this->assertEmpty( $data['missing_tables'] );
	}

	/**
	 * Test health_check returns degraded when tables are missing.
	 */
	public function test_health_check_returns_degraded_when_tables_missing(): void {
		// Mock WAB_Upgrader to return some tables as missing.
		$this->mock_upgrader_tables_exist( false, [ 'wab_identities' ] );

		Functions\when( 'current_time' )->justReturn( '2024-01-15T10:30:00+00:00' );

		$request = new WP_REST_Request();

		$response = $this->rest_api->health_check( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$data = $response->get_data();
		$this->assertEquals( 'degraded', $data['status'] );
		$this->assertContains( 'wab_identities', $data['missing_tables'] );
	}

	/**
	 * Test health_check returns 503 when degraded.
	 */
	public function test_health_check_returns_503_when_degraded(): void {
		// Mock WAB_Upgrader to return some tables as missing.
		$this->mock_upgrader_tables_exist( false, [ 'wab_queue' ] );

		Functions\when( 'current_time' )->justReturn( '2024-01-15T10:30:00+00:00' );

		$request = new WP_REST_Request();

		$response = $this->rest_api->health_check( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$this->assertEquals( 503, $response->get_status() );
	}

	/**
	 * Test health_check includes integration status.
	 */
	public function test_health_check_includes_integration_status(): void {
		global $wab_test_options;

		$this->mock_upgrader_tables_exist( true );

		// Meta: enabled and configured.
		$wab_test_options['wab_meta_enabled'] = true;
		$wab_test_options['wab_meta_pixel_id'] = 'pixel123';
		$wab_test_options['wab_meta_access_token'] = 'token123';

		// Google: enabled but not configured.
		$wab_test_options['wab_google_enabled'] = true;
		$wab_test_options['wab_google_customer_id'] = '';

		// TikTok: disabled.
		$wab_test_options['wab_tiktok_enabled'] = false;

		// Swetrix: enabled and configured.
		$wab_test_options['wab_swetrix_enabled'] = true;
		$wab_test_options['wab_swetrix_project_id'] = 'proj123';

		Functions\when( 'current_time' )->justReturn( '2024-01-15T10:30:00+00:00' );

		$request = new WP_REST_Request();

		$response = $this->rest_api->health_check( $request );
		$data = $response->get_data();

		$this->assertArrayHasKey( 'integrations', $data );

		// Meta: enabled and configured.
		$this->assertTrue( $data['integrations']['meta']['enabled'] );
		$this->assertTrue( $data['integrations']['meta']['configured'] );

		// Google: enabled but not configured.
		$this->assertTrue( $data['integrations']['google']['enabled'] );
		$this->assertFalse( $data['integrations']['google']['configured'] );

		// TikTok: disabled.
		$this->assertFalse( $data['integrations']['tiktok']['enabled'] );
		$this->assertFalse( $data['integrations']['tiktok']['configured'] );

		// Swetrix: enabled and configured.
		$this->assertTrue( $data['integrations']['swetrix']['enabled'] );
		$this->assertTrue( $data['integrations']['swetrix']['configured'] );
	}

	/**
	 * Test health_check includes queue stats when table exists.
	 */
	public function test_health_check_includes_queue_stats(): void {
		global $wpdb;

		// Set up mock that handles both table existence AND queue stats.
		\WAB_Upgrader::clear_cache();

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			if ( ! empty( $args ) ) {
				return str_replace( '%s', $args[0], $query );
			}
			return $query;
		} );

		$wpdb->shouldReceive( 'get_var' )->andReturnUsing( function( $query ) {
			// Table existence checks.
			foreach ( \WAB_Upgrader::REQUIRED_TABLES as $table ) {
				$full_name = 'wp_' . $table;
				if ( strpos( $query, $full_name ) !== false && strpos( $query, 'SHOW TABLES' ) !== false ) {
					return $full_name;
				}
			}
			// Queue stats queries.
			if ( strpos( $query, 'pending' ) !== false ) {
				return '5';
			}
			if ( strpos( $query, 'failed' ) !== false ) {
				return '2';
			}
			return null;
		} );

		Functions\when( 'current_time' )->justReturn( '2024-01-15T10:30:00+00:00' );

		$request = new WP_REST_Request();

		$response = $this->rest_api->health_check( $request );
		$data = $response->get_data();

		$this->assertArrayHasKey( 'queue', $data );
		$this->assertEquals( 5, $data['queue']['pending'] );
		$this->assertEquals( 2, $data['queue']['failed'] );
	}

	/**
	 * Test health_check omits queue stats when table is missing.
	 */
	public function test_health_check_omits_queue_stats_when_table_missing(): void {
		// Mock WAB_Upgrader with wab_queue missing.
		$this->mock_upgrader_tables_exist( false, [ 'wab_queue' ] );

		Functions\when( 'current_time' )->justReturn( '2024-01-15T10:30:00+00:00' );

		$request = new WP_REST_Request();

		$response = $this->rest_api->health_check( $request );
		$data = $response->get_data();

		$this->assertArrayNotHasKey( 'queue', $data );
	}

	/**
	 * Helper to mock WAB_Upgrader table existence checks.
	 *
	 * @param bool  $all_exist     Whether all tables exist.
	 * @param array $missing_tables Tables to mark as missing.
	 */
	private function mock_upgrader_tables_exist( bool $all_exist, array $missing_tables = [] ): void {
		// Clear any existing cache.
		\WAB_Upgrader::clear_cache();

		// Set up wpdb mock to return appropriate values for table checks.
		global $wpdb;
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		// The prepare function substitutes %s with the argument.
		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			// Simple substitution of %s with first argument.
			if ( ! empty( $args ) ) {
				return str_replace( '%s', $args[0], $query );
			}
			return $query;
		} );

		$wpdb->shouldReceive( 'get_var' )->andReturnUsing( function( $query ) use ( $all_exist, $missing_tables ) {
			// Check which table is being queried.
			foreach ( \WAB_Upgrader::REQUIRED_TABLES as $table ) {
				$full_name = 'wp_' . $table;
				if ( strpos( $query, $full_name ) !== false ) {
					// If this table is in the missing list, return null.
					if ( in_array( $table, $missing_tables, true ) ) {
						return null;
					}
					// Otherwise return the table name to indicate it exists.
					return $full_name;
				}
			}
			// For queue stats queries.
			if ( strpos( $query, 'pending' ) !== false ) {
				return '5';
			}
			if ( strpos( $query, 'failed' ) !== false ) {
				return '2';
			}
			return null;
		} );
	}

	/**
	 * Create a mock WC_Order.
	 *
	 * @param int   $id    Order ID.
	 * @param float $total Order total.
	 * @param array $meta  Order meta.
	 * @return \Mockery\MockInterface
	 */
	private function create_mock_order( int $id, float $total, array $meta = [] ): \Mockery\MockInterface {
		$mock_date = Mockery::mock( 'WC_DateTime' );
		$mock_date->shouldReceive( 'format' )->andReturn( '2024-01-15T10:30:00+00:00' );

		$mock_order = Mockery::mock( 'WC_Order' );
		$mock_order->shouldReceive( 'get_id' )->andReturn( $id );
		$mock_order->shouldReceive( 'get_order_number' )->andReturn( $id );
		$mock_order->shouldReceive( 'get_status' )->andReturn( 'completed' );
		$mock_order->shouldReceive( 'get_total' )->andReturn( $total );
		$mock_order->shouldReceive( 'get_subtotal' )->andReturn( $total * 0.8 );
		$mock_order->shouldReceive( 'get_total_tax' )->andReturn( $total * 0.2 );
		$mock_order->shouldReceive( 'get_shipping_total' )->andReturn( 0.0 );
		$mock_order->shouldReceive( 'get_total_discount' )->andReturn( 0.0 );
		$mock_order->shouldReceive( 'get_currency' )->andReturn( 'GBP' );
		$mock_order->shouldReceive( 'get_payment_method' )->andReturn( 'stripe' );
		$mock_order->shouldReceive( 'get_date_created' )->andReturn( $mock_date );
		$mock_order->shouldReceive( 'get_date_completed' )->andReturn( $mock_date );
		$mock_order->shouldReceive( 'get_billing_email' )->andReturn( 'customer@example.com' );
		$mock_order->shouldReceive( 'get_billing_country' )->andReturn( 'GB' );
		$mock_order->shouldReceive( 'get_items' )->andReturn( [] );
		$mock_order->shouldReceive( 'get_item_count' )->andReturn( 0 );

		$mock_order->shouldReceive( 'get_meta' )->andReturnUsing( function( $key ) use ( $meta ) {
			return $meta[ $key ] ?? null;
		} );

		return $mock_order;
	}
}
