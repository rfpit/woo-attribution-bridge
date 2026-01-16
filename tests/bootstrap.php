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

if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
	define( 'HOUR_IN_SECONDS', 3600 );
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

// Mock WC_Order class for WooCommerce.
if ( ! class_exists( 'WC_Order' ) ) {
	class WC_Order {
		private int $id = 1;
		private array $meta = [];
		private string $billing_email = '';
		private string $billing_phone = '+44123456789';
		private string $billing_first_name = 'Test';
		private string $billing_last_name = 'User';
		private string $billing_city = 'London';
		private string $billing_state = 'Greater London';
		private string $billing_postcode = 'SW1A 1AA';
		private string $billing_country = 'GB';
		private string $status = 'pending';
		private float $total = 0.0;
		private string $currency = 'GBP';
		private float $subtotal = 0.0;
		private float $total_tax = 0.0;
		private float $shipping_total = 0.0;
		private float $discount_total = 0.0;
		private string $payment_method = 'stripe';
		private ?WC_DateTime $date_completed = null;

		public function __construct( $id = 0 ) {
			$this->id = $id ?: rand( 1000, 9999 );
		}

		public function get_id(): int {
			return $this->id;
		}

		public function get_meta( $key, $single = true ) {
			if ( $single ) {
				return $this->meta[ $key ] ?? '';
			}
			return isset( $this->meta[ $key ] ) ? [ $this->meta[ $key ] ] : [];
		}

		public function update_meta_data( $key, $value ): void {
			$this->meta[ $key ] = $value;
		}

		public function delete_meta_data( $key ): void {
			unset( $this->meta[ $key ] );
		}

		public function save(): int {
			return $this->id;
		}

		public function get_billing_email(): string {
			return $this->billing_email;
		}

		public function set_billing_email( string $email ): void {
			$this->billing_email = $email;
		}

		public function get_status(): string {
			return $this->status;
		}

		public function get_total(): float {
			return $this->total;
		}

		public function set_total( $total ): void {
			$this->total = (float) $total;
		}

		public function get_currency(): string {
			return $this->currency;
		}

		public function set_currency( string $currency ): void {
			$this->currency = $currency;
		}

		public function get_items(): array {
			return [];
		}

		public function get_billing_first_name(): string {
			return $this->billing_first_name;
		}

		public function set_billing_first_name( string $name ): void {
			$this->billing_first_name = $name;
		}

		public function get_billing_last_name(): string {
			return $this->billing_last_name;
		}

		public function set_billing_last_name( string $name ): void {
			$this->billing_last_name = $name;
		}

		public function get_billing_phone(): string {
			return $this->billing_phone;
		}

		public function set_billing_phone( string $phone ): void {
			$this->billing_phone = $phone;
		}

		public function get_billing_city(): string {
			return $this->billing_city;
		}

		public function set_billing_city( string $city ): void {
			$this->billing_city = $city;
		}

		public function get_billing_state(): string {
			return $this->billing_state;
		}

		public function set_billing_state( string $state ): void {
			$this->billing_state = $state;
		}

		public function get_billing_postcode(): string {
			return $this->billing_postcode;
		}

		public function set_billing_postcode( string $postcode ): void {
			$this->billing_postcode = $postcode;
		}

		public function get_billing_country(): string {
			return $this->billing_country;
		}

		public function set_billing_country( string $country ): void {
			$this->billing_country = $country;
		}

		public function get_date_created(): \WC_DateTime {
			return new \WC_DateTime();
		}

		public function get_checkout_order_received_url(): string {
			return 'https://example.com/checkout/order-received/' . $this->id . '/';
		}

		public function get_order_number(): string {
			return 'ORD-' . $this->id;
		}

		public function get_subtotal(): float {
			return $this->subtotal;
		}

		public function set_subtotal( float $subtotal ): void {
			$this->subtotal = $subtotal;
		}

		public function get_total_tax(): float {
			return $this->total_tax;
		}

		public function set_total_tax( float $tax ): void {
			$this->total_tax = $tax;
		}

		public function get_shipping_total(): float {
			return $this->shipping_total;
		}

		public function set_shipping_total( float $shipping ): void {
			$this->shipping_total = $shipping;
		}

		public function get_discount_total(): float {
			return $this->discount_total;
		}

		public function set_discount_total( float $discount ): void {
			$this->discount_total = $discount;
		}

		public function get_payment_method(): string {
			return $this->payment_method;
		}

		public function set_payment_method( string $method ): void {
			$this->payment_method = $method;
		}

		public function get_date_completed(): ?\WC_DateTime {
			return $this->date_completed;
		}

		public function set_date_completed( ?\WC_DateTime $date ): void {
			$this->date_completed = $date;
		}

		public function set_status( string $status ): void {
			$this->status = $status;
		}
	}
}

// Mock WC_DateTime class for WooCommerce.
if ( ! class_exists( 'WC_DateTime' ) ) {
	class WC_DateTime extends \DateTime {
		private string $tz_name = 'UTC';

		public function __construct( $time = 'now', $timezone = null ) {
			if ( $timezone === null ) {
				$timezone = new \DateTimeZone( 'UTC' );
			}
			parent::__construct( $time, $timezone );
			$this->tz_name = $timezone->getName();
		}

		public function getTimezone(): \DateTimeZone {
			return new \DateTimeZone( $this->tz_name );
		}

		public function setTimezone( \DateTimeZone $tz ): static {
			$this->tz_name = $tz->getName();
			parent::setTimezone( $tz );
			return $this;
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
require_once dirname( __DIR__ ) . '/src/integrations/class-wab-dashboard.php';

// Load consent handler.
require_once dirname( __DIR__ ) . '/src/includes/class-wab-consent.php';

// Load test base class.
require_once __DIR__ . '/Unit/WabTestCase.php';
