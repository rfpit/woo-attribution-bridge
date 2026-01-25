import { describe, it, expect, beforeEach, vi } from "vitest";

// We'll test the encryption module
// Tests written BEFORE implementation (TDD)

describe("Encryption Utilities", () => {
  // Reset modules before each test to ensure clean state
  beforeEach(() => {
    vi.resetModules();
  });

  describe("encrypt", () => {
    it("should encrypt a string and return base64 encoded result", async () => {
      // Set environment variable for test
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt } = await import("@/lib/encryption");

      const plaintext = "my-secret-token";
      const encrypted = encrypt(plaintext);

      // Should be base64 encoded
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
      // Should not be the same as plaintext
      expect(encrypted).not.toBe(plaintext);
      // Should contain IV + ciphertext + auth tag, so it's longer
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
    });

    it("should produce different ciphertext for same plaintext (random IV)", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt } = await import("@/lib/encryption");

      const plaintext = "my-secret-token";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Same plaintext should produce different ciphertext due to random IV
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should handle empty string", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt } = await import("@/lib/encryption");

      const encrypted = encrypt("");

      // Should still produce valid output (IV + empty ciphertext + auth tag)
      expect(encrypted).toBeTruthy();
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it("should handle special characters and unicode", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt } = await import("@/lib/encryption");

      const plaintext = "token-with-émojis-🔐-and-日本語";
      const encrypted = encrypt(plaintext);

      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it("should throw error when encryption key is not set", async () => {
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");

      const { encrypt } = await import("@/lib/encryption");

      expect(() => encrypt("test")).toThrow();
    });

    it("should throw error when encryption key is invalid length", async () => {
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", "too-short");

      const { encrypt } = await import("@/lib/encryption");

      expect(() => encrypt("test")).toThrow();
    });
  });

  describe("decrypt", () => {
    it("should decrypt an encrypted string back to original", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt, decrypt } = await import("@/lib/encryption");

      const plaintext = "my-secret-token";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle roundtrip of empty string", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt, decrypt } = await import("@/lib/encryption");

      const plaintext = "";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle roundtrip of special characters", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt, decrypt } = await import("@/lib/encryption");

      const plaintext = "token-with-émojis-🔐-and-日本語";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle roundtrip of long strings", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt, decrypt } = await import("@/lib/encryption");

      const plaintext = "a".repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should throw error when decrypting invalid data", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { decrypt } = await import("@/lib/encryption");

      expect(() => decrypt("not-valid-encrypted-data")).toThrow();
    });

    it("should throw error when auth tag is tampered", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt, decrypt } = await import("@/lib/encryption");

      const encrypted = encrypt("test");
      // Tamper with the last character (part of auth tag)
      const tampered =
        encrypted.slice(0, -1) + (encrypted.slice(-1) === "A" ? "B" : "A");

      expect(() => decrypt(tampered)).toThrow();
    });

    it("should fail to decrypt with different key", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encrypt } = await import("@/lib/encryption");
      const encrypted = encrypt("test");

      // Reset and use different key
      vi.resetModules();
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      );

      const { decrypt } = await import("@/lib/encryption");

      expect(() => decrypt(encrypted)).toThrow();
    });
  });

  describe("encryptJson / decryptJson", () => {
    it("should encrypt and decrypt JSON objects", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encryptJson, decryptJson } = await import("@/lib/encryption");

      const data = {
        accessToken: "ya29.abc123",
        refreshToken: "1//def456",
        expiresAt: 1234567890,
      };

      const encrypted = encryptJson(data);
      const decrypted = decryptJson(encrypted);

      expect(decrypted).toEqual(data);
    });

    it("should handle arrays", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encryptJson, decryptJson } = await import("@/lib/encryption");

      const data = ["item1", "item2", { nested: true }];

      const encrypted = encryptJson(data);
      const decrypted = decryptJson(encrypted);

      expect(decrypted).toEqual(data);
    });

    it("should handle null and undefined values", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { encryptJson, decryptJson } = await import("@/lib/encryption");

      const data = { value: null, other: "test" };

      const encrypted = encryptJson(data);
      const decrypted = decryptJson(encrypted);

      expect(decrypted).toEqual(data);
    });
  });

  describe("generateRandomBytes", () => {
    it("should generate random bytes of specified length", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { generateRandomBytes } = await import("@/lib/encryption");

      const bytes = generateRandomBytes(32);

      expect(bytes).toHaveLength(32);
    });

    it("should generate different bytes each time", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { generateRandomBytes } = await import("@/lib/encryption");

      const bytes1 = generateRandomBytes(32);
      const bytes2 = generateRandomBytes(32);

      expect(bytes1).not.toEqual(bytes2);
    });
  });

  describe("generateStateToken", () => {
    it("should generate a URL-safe random string", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { generateStateToken } = await import("@/lib/encryption");

      const token = generateStateToken();

      // Should be URL-safe (base64url encoding)
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      // Should be reasonable length (32 bytes = ~43 chars in base64)
      expect(token.length).toBeGreaterThan(30);
    });

    it("should generate unique tokens", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      const { generateStateToken } = await import("@/lib/encryption");

      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateStateToken());
      }

      expect(tokens.size).toBe(100);
    });
  });
});
