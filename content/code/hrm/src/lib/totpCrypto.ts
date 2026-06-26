import * as OTPAuth from "otpauth";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ISSUER = "HRManager";

/**
 * Derives a 256-bit AES key from the TOTP_ENCRYPTION_KEY env var.
 * Falls back to a deterministic key derived from NEXTAUTH_SECRET for dev convenience.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.TOTP_ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!envKey) {
    throw new Error("TOTP_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set");
  }
  // Derive a 32-byte key via SHA-256 so any-length secret works
  return createHash("sha256").update(envKey).digest();
}

/** Encrypt a TOTP secret for storage. Returns base64(iv + authTag + ciphertext). */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: iv(12) + authTag(16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/** Decrypt a stored TOTP secret. */
export function decryptSecret(encoded: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(encoded, "base64");
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Generate a new random TOTP secret and return the OTPAuth.TOTP instance. */
export function generateTotpSecret(userEmail: string): OTPAuth.TOTP {
  const secret = new OTPAuth.Secret({ size: 20 });
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: userEmail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
}

/** Get the otpauth:// URI for QR code display. */
export function getTotpUri(totp: OTPAuth.TOTP): string {
  return totp.toString();
}

/** Get the base32-encoded secret string. */
export function getTotpBase32(totp: OTPAuth.TOTP): string {
  return totp.secret.base32;
}

/**
 * Verify a 6-digit TOTP code against a secret.
 * Allows a 1-window drift (30 seconds before/after).
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  // delta returns null if invalid, or the time step difference
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

/**
 * Generate 10 recovery codes (8 alphanumeric chars each).
 * Returns the plaintext codes.
 */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    // Generate 5 random bytes -> 10 hex chars, take first 8
    const code = randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
    // Format as XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/** Hash a recovery code for secure storage using SHA-256. */
export function hashRecoveryCode(code: string): string {
  // Normalize: remove dashes, uppercase
  const normalized = code.replace(/-/g, "").toUpperCase();
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Check if a recovery code matches any stored hash.
 * Returns the index of the matching code, or -1 if no match.
 */
export function findMatchingRecoveryCode(code: string, hashedCodes: string[]): number {
  const hash = hashRecoveryCode(code);
  return hashedCodes.indexOf(hash);
}
