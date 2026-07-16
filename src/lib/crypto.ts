import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

/**
 * Field-level encryption for PII at rest.
 *
 * - AES-256-GCM (authenticated encryption) for values.
 * - HMAC-SHA256 blind index (separate key) for equality lookups (email).
 * - scrypt for password hashing.
 *
 * Ciphertext format: v1:<iv b64>:<authTag b64>:<ciphertext b64>
 */

const VERSION = "v1";

function loadKey(envVar: string): Buffer {
  const hex = process.env[envVar];
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${envVar} must be a 32-byte hex string`);
  }
  return Buffer.from(hex, "hex");
}

function encryptionKey(): Buffer {
  return loadKey("APP_ENCRYPTION_KEY");
}

function indexKey(): Buffer {
  return loadKey("APP_INDEX_KEY");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid ciphertext format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Deterministic blind index for equality lookups. Never reversible. */
export function blindIndex(value: string): string {
  return createHmac("sha256", indexKey())
    .update(value.trim().toLowerCase())
    .digest("hex");
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

// Async on purpose: scryptSync blocks the event loop for tens of milliseconds
// per call, which serializes every request on the process under login load.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt:${salt.toString("base64")}:${derived.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  const derived = await scryptAsync(password, salt, expected.length, SCRYPT_PARAMS);
  return timingSafeEqual(derived, expected);
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHmac("sha256", indexKey()).update(token).digest("hex");
}
