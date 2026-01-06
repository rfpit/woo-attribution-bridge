<?php
/**
 * Base test case for WAB tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Mockery;
use PHPUnit\Framework\TestCase;

/**
 * Base test case that sets up WordPress function mocks.
 */
abstract class WabTestCase extends TestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->setup_wordpress_mocks();
	}

	/**
	 * Tear down test environment.
	 */
	protected function tearDown(): void {
		Monkey\tearDown();
		Mockery::close();
		parent::tearDown();
	}

	/**
	 * Set up WordPress function mocks.
	 */
	protected function setup_wordpress_mocks(): void {
		Functions\when( 'get_option' )->alias( function( $key, $default = false ) {
			global $wab_test_options;
			return $wab_test_options[ $key ] ?? $default;
		} );

		Functions\when( 'update_option' )->alias( function( $key, $value ) {
			global $wab_test_options;
			$wab_test_options[ $key ] = $value;
			return true;
		} );

		Functions\when( 'delete_option' )->alias( function( $key ) {
			global $wab_test_options;
			unset( $wab_test_options[ $key ] );
			return true;
		} );

		Functions\when( 'wp_json_encode' )->alias( function( $data ) {
			return json_encode( $data );
		} );

		Functions\when( 'sanitize_text_field' )->alias( function( $str ) {
			return strip_tags( trim( $str ) );
		} );

		Functions\when( 'wp_unslash' )->alias( function( $value ) {
			return stripslashes( $value );
		} );

		Functions\when( 'esc_url_raw' )->alias( function( $url ) {
			return filter_var( $url, FILTER_SANITIZE_URL );
		} );

		Functions\when( 'is_ssl' )->justReturn( true );

		Functions\when( 'is_admin' )->justReturn( false );

		Functions\when( 'wp_doing_ajax' )->justReturn( false );

		Functions\when( 'home_url' )->justReturn( 'https://example.com' );

		Functions\when( 'admin_url' )->alias( function( $path = '' ) {
			return 'https://example.com/wp-admin/' . $path;
		} );

		Functions\when( 'wp_generate_uuid4' )->alias( function() {
			return sprintf(
				'%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
				mt_rand( 0, 0xffff ),
				mt_rand( 0, 0xffff ),
				mt_rand( 0, 0xffff ),
				mt_rand( 0, 0x0fff ) | 0x4000,
				mt_rand( 0, 0x3fff ) | 0x8000,
				mt_rand( 0, 0xffff ),
				mt_rand( 0, 0xffff ),
				mt_rand( 0, 0xffff )
			);
		} );

		Functions\when( 'wp_salt' )->justReturn( 'test-salt-key' );

		Functions\when( 'wp_remote_post' )->alias( function( $url, $args = [] ) {
			global $wab_test_http_responses;

			if ( isset( $wab_test_http_responses[ $url ] ) ) {
				return $wab_test_http_responses[ $url ];
			}

			return [
				'response' => [ 'code' => 200 ],
				'body'     => '{"success": true}',
			];
		} );

		Functions\when( 'wp_remote_retrieve_response_code' )->alias( function( $response ) {
			return $response['response']['code'] ?? 0;
		} );

		Functions\when( 'wp_remote_retrieve_body' )->alias( function( $response ) {
			return $response['body'] ?? '';
		} );

		Functions\when( 'is_wp_error' )->alias( function( $thing ) {
			return $thing instanceof \WP_Error;
		} );

		Functions\when( '__' )->alias( function( $text, $domain = 'default' ) {
			return $text;
		} );

		Functions\when( 'esc_html__' )->alias( function( $text, $domain = 'default' ) {
			return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
		} );

		Functions\when( 'esc_html' )->alias( function( $text ) {
			return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
		} );

		Functions\when( 'esc_attr' )->alias( function( $text ) {
			return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
		} );

		Functions\when( 'esc_attr_e' )->alias( function( $text, $domain = 'default' ) {
			echo htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
		} );

		Functions\when( 'wp_parse_url' )->alias( function( $url, $component = -1 ) {
			return parse_url( $url, $component );
		} );

		Functions\when( 'get_locale' )->justReturn( 'en_US' );

		Functions\when( 'apply_filters' )->alias( function( $hook, $value, ...$args ) {
			return $value;
		} );

		Functions\when( 'do_action' )->justReturn( null );

		Functions\when( 'add_action' )->justReturn( true );

		Functions\when( 'add_filter' )->justReturn( true );
	}
}
