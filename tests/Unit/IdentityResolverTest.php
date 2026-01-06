<?php
/**
 * Tests for WAB_Identity_Resolver class.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use Brain\Monkey\Functions;

/**
 * Class IdentityResolverTest
 */
class IdentityResolverTest extends WabTestCase {

	/**
	 * Test email hashing.
	 */
	public function test_email_hashing(): void {
		$resolver = new \WAB_Identity_Resolver();

		$hash1 = $resolver->hash_email( 'test@example.com' );
		$hash2 = $resolver->hash_email( 'TEST@EXAMPLE.COM' );
		$hash3 = $resolver->hash_email( '  test@example.com  ' );

		// Same email with different case/whitespace should produce same hash.
		$this->assertEquals( $hash1, $hash2 );
		$this->assertEquals( $hash1, $hash3 );

		// Different email should produce different hash.
		$hash4 = $resolver->hash_email( 'other@example.com' );
		$this->assertNotEquals( $hash1, $hash4 );

		// Hash should be 64 characters (SHA-256).
		$this->assertEquals( 64, strlen( $hash1 ) );
	}

	/**
	 * Test empty email hash.
	 */
	public function test_empty_email_hash(): void {
		$resolver = new \WAB_Identity_Resolver();

		$hash = $resolver->hash_email( '' );

		// Empty email should still produce a valid hash.
		$this->assertEquals( 64, strlen( $hash ) );
	}

	/**
	 * Test link visitor to email validation - empty visitor.
	 */
	public function test_link_visitor_validation_empty_visitor(): void {
		$resolver = new \WAB_Identity_Resolver();

		// Empty visitor should fail.
		$result = $resolver->link_visitor_to_email( '', 'test@example.com' );
		$this->assertFalse( $result );
	}

	/**
	 * Test link visitor to email validation - empty email.
	 */
	public function test_link_visitor_validation_empty_email(): void {
		$resolver = new \WAB_Identity_Resolver();

		// Empty email should fail.
		$result = $resolver->link_visitor_to_email( 'visitor-1', '' );
		$this->assertFalse( $result );
	}

	/**
	 * Test hash is consistent.
	 */
	public function test_hash_consistency(): void {
		$resolver = new \WAB_Identity_Resolver();

		$email = 'customer@store.com';

		// Hash same email multiple times.
		$hashes = [];
		for ( $i = 0; $i < 5; $i++ ) {
			$hashes[] = $resolver->hash_email( $email );
		}

		// All hashes should be identical.
		$unique = array_unique( $hashes );
		$this->assertCount( 1, $unique );
	}

	/**
	 * Test hash is deterministic across instances.
	 */
	public function test_hash_deterministic(): void {
		$resolver1 = new \WAB_Identity_Resolver();
		$resolver2 = new \WAB_Identity_Resolver();

		$email = 'shared@test.com';

		$hash1 = $resolver1->hash_email( $email );
		$hash2 = $resolver2->hash_email( $email );

		$this->assertEquals( $hash1, $hash2 );
	}

	/**
	 * Test email hash with special characters.
	 */
	public function test_email_hash_special_chars(): void {
		$resolver = new \WAB_Identity_Resolver();

		$hash1 = $resolver->hash_email( 'user+tag@example.com' );
		$hash2 = $resolver->hash_email( 'user.name@example.com' );
		$hash3 = $resolver->hash_email( 'user_name@sub.example.com' );

		// All should produce valid 64-char hashes.
		$this->assertEquals( 64, strlen( $hash1 ) );
		$this->assertEquals( 64, strlen( $hash2 ) );
		$this->assertEquals( 64, strlen( $hash3 ) );

		// All should be different.
		$this->assertNotEquals( $hash1, $hash2 );
		$this->assertNotEquals( $hash2, $hash3 );
	}

	/**
	 * Test unicode email hashing.
	 */
	public function test_email_hash_unicode(): void {
		$resolver = new \WAB_Identity_Resolver();

		$hash1 = $resolver->hash_email( 'user@例え.jp' );
		$hash2 = $resolver->hash_email( 'пользователь@test.ru' );

		// Should produce valid hashes.
		$this->assertEquals( 64, strlen( $hash1 ) );
		$this->assertEquals( 64, strlen( $hash2 ) );
		$this->assertNotEquals( $hash1, $hash2 );
	}

	/**
	 * Test hash output is hexadecimal.
	 */
	public function test_hash_is_hexadecimal(): void {
		$resolver = new \WAB_Identity_Resolver();

		$hash = $resolver->hash_email( 'test@example.com' );

		// Should only contain hex characters.
		$this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $hash );
	}
}
