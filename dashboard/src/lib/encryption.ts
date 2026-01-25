/**
 * Token Encryption Utilities
 *
 * Uses AES-256-GCM for authenticated encryption of sensitive tokens.
 * - AES-256: 256-bit key for strong encryption
 * - GCM: Galois/Counter Mode provides both encryption and authentication
 * - Random IV: Each encryption uses a unique initialization vector
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16; // GCM auth tag length

/**
 * Get the encryption key from environment variable.
 * Key must be 64 hex characters (32 bytes / 256 bits).
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY environment variable is not set. " +
        "Generate one with: openssl rand -hex 32",
    );
  }

  if (keyHex.length !== 64) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${keyHex.length} characters.`,
    );
  }

  // Validate it's valid hex
  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a valid hex string.");
  }

  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt a string using AES-256-GCM.
 *
 * Output format: base64(IV + ciphertext + authTag)
 *
 * @param plaintext - The string to encrypt
 * @returns Base64-encoded encrypted data
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine: IV (12 bytes) + ciphertext + authTag (16 bytes)
  const combined = Buffer.concat([iv, encrypted, authTag]);

  return combined.toString("base64");
}

/**
 * Decrypt a string that was encrypted with encrypt().
 *
 * @param encryptedData - Base64-encoded encrypted data
 * @returns The original plaintext string
 * @throws Error if decryption fails (invalid key, tampered data, etc.)
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();

  // Decode base64
  const combined = Buffer.from(encryptedData, "base64");

  // Minimum length: IV (12) + authTag (16) = 28 bytes
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted data: too short");
  }

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH,
  );

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Encrypt a JSON-serializable value.
 *
 * @param data - Any JSON-serializable value
 * @returns Base64-encoded encrypted JSON
 */
export function encryptJson<T>(data: T): string {
  const json = JSON.stringify(data);
  return encrypt(json);
}

/**
 * Decrypt a JSON value that was encrypted with encryptJson().
 *
 * @param encryptedData - Base64-encoded encrypted JSON
 * @returns The original JSON value
 */
export function decryptJson<T>(encryptedData: string): T {
  const json = decrypt(encryptedData);
  return JSON.parse(json) as T;
}

/**
 * Generate cryptographically secure random bytes.
 *
 * @param length - Number of bytes to generate
 * @returns Buffer of random bytes
 */
export function generateRandomBytes(length: number): Buffer {
  return crypto.randomBytes(length);
}

/**
 * Generate a URL-safe random state token for OAuth flows.
 *
 * Uses base64url encoding (no + or / characters, no padding).
 *
 * @returns A 32-byte random token encoded as base64url (~43 characters)
 */
export function generateStateToken(): string {
  const bytes = crypto.randomBytes(32);
  // base64url encoding: replace + with -, / with _, and remove =
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
