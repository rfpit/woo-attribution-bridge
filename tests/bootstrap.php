<?php
/**
 * PHPUnit bootstrap file.
 *
 * @package WooAttributionBridge\Tests
 */

// Load Composer autoloader.
require_once dirname( __DIR__ ) . '/vendor/autoload.php';

// Define WordPress constants if not defined.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', '/tmp/wordpress/' );
}

if ( ! defined( 'ARRAY_A' ) ) {
	define( 'ARRAY_A', 'ARRAY_A' );
}

if ( ! defined( 'ARRAY_N' ) ) {
	define( 'ARRAY_N', 'ARRAY_N' );
}

if ( ! defined( 'OBJECT' ) ) {
	define( 'OBJECT', 'OBJECT' );
}

if ( ! defined( 'DAY_IN_SECONDS' ) ) {
	define( 'DAY_IN_SECONDS', 86400 );
}

if ( ! defined( 'COOKIEPATH' ) ) {
	define( 'COOKIEPATH', '/' );
}

if ( ! defined( 'COOKIE_DOMAIN' ) ) {
	define( 'COOKIE_DOMAIN', '' );
}

if ( ! defined( 'WAB_VERSION' ) ) {
	define( 'WAB_VERSION', '1.0.0' );
}

// Mock WP_Error class.
if ( ! class_exists( 'WP_Error' ) ) {
	class WP_Error {
		private array $errors = [];
		private array $error_data = [];

		public function __construct( $code = '', $message = '', $data = '' ) {
			if ( $code ) {
				$this->errors[ $code ][] = $message;
				if ( $data ) {
					$this->error_data[ $code ] = $data;
				}
			}
		}

		public function get_error_message( $code = '' ) {
			if ( empty( $code ) ) {
				$code = array_key_first( $this->errors );
			}
			return $this->errors[ $code ][0] ?? '';
		}

		public function get_error_code() {
			return array_key_first( $this->errors ) ?: '';
		}
	}
}

// Mock WP_REST_Request class.
if ( ! class_exists( 'WP_REST_Request' ) ) {
	class WP_REST_Request {
		private array $params = [];
		private array $headers = [];

		public function __construct( $method = 'GET', $route = '' ) {}

		public function set_param( $key, $value ) {
			$this->params[ $key ] = $value;
		}

		public function get_param( $key ) {
			return $this->params[ $key ] ?? null;
		}

		public function get_params() {
			return $this->params;
		}

		public function set_header( $key, $value ) {
			$this->headers[ strtolower( $key ) ] = $value;
		}

		public function get_header( $key ) {
			return $this->headers[ strtolower( $key ) ] ?? null;
		}
	}
}

// Mock WP_REST_Response class.
if ( ! class_exists( 'WP_REST_Response' ) ) {
	class WP_REST_Response {
		public $data;
		public int $status = 200;

		public function __construct( $data = null, $status = 200 ) {
			$this->data = $data;
			$this->status = $status;
		}

		public function get_data() {
			return $this->data;
		}

		public function get_status() {
			return $this->status;
		}
	}
}

// Load plugin classes.
require_once dirname( __DIR__ ) . '/src/includes/class-wab-integration.php';
require_once dirname( __DIR__ ) . '/src/includes/class-wab-deduplication.php';
require_once dirname( __DIR__ ) . '/src/includes/class-wab-queue.php';
require_once dirname( __DIR__ ) . '/src/includes/class-wab-cookie.php';
require_once dirname( __DIR__ ) . '/src/includes/class-wab-dispatcher.php';
require_once dirname( __DIR__ ) . '/src/includes/class-wab-survey.php';
require_once dirname( __DIR__ ) . '/src/includes/class-wab-rest-api.php';
require_once dirname( __DIR__ ) . '/src/includes/class-wab-touchpoint-tracker.php';
require_once dirname( __DIR__ ) . '/src/includes/class-wab-identity-resolver.php';
require_once dirname( __DIR__ ) . '/src/integrations/class-wab-meta.php';
require_once dirname( __DIR__ ) . '/src/integrations/class-wab-google-ads.php';
require_once dirname( __DIR__ ) . '/src/integrations/class-wab-tiktok.php';
require_once dirname( __DIR__ ) . '/src/integrations/class-wab-swetrix.php';

// Load test base class.
require_once __DIR__ . '/Unit/WabTestCase.php';
