/**
 * AES-256-GCM encryption for environment variables (UK/GDPR-aligned).
 * Server-side only; key from ENV_ENCRYPTION_KEY (32 bytes, base64 or hex).
 */

import crypto from "crypto"

const ALGO = "aes-256-gcm"
const IV_LEN = 12
const AUTH_TAG_LEN = 16
const KEY_LEN = 32

function getKey(): Buffer {
  const raw = process.env.ENV_ENCRYPTION_KEY
  if (!raw || raw.length < 32) {
    throw new Error("ENV_ENCRYPTION_KEY must be set and at least 32 chars (32-byte key, base64 or hex)")
  }
  if (Buffer.isEncoding("base64") && /^[A-Za-z0-9+/]+=*$/.test(raw)) {
    const buf = Buffer.from(raw, "base64")
    if (buf.length >= KEY_LEN) return buf.subarray(0, KEY_LEN)
  }
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length >= KEY_LEN * 2) {
    return Buffer.from(raw.slice(0, KEY_LEN * 2), "hex")
  }
  return Buffer.from(raw.slice(0, KEY_LEN), "utf8")
}

export function encryptEnvVars(plain: string): { encrypted: string } {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN })
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  const blob = Buffer.concat([iv, authTag, enc])
  return { encrypted: blob.toString("base64") }
}

export function decryptEnvVars(encryptedBase64: string): string {
  const key = getKey()
  const blob = Buffer.from(encryptedBase64, "base64")
  if (blob.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error("Invalid encrypted blob")
  }
  const iv = blob.subarray(0, IV_LEN)
  const authTag = blob.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN)
  const ciphertext = blob.subarray(IV_LEN + AUTH_TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN })
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8")
}
