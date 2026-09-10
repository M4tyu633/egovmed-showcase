'use strict';
const crypto = require('crypto');
const { env } = require('../config/env');
const logger = require('./logger');

// Resolve a 32-byte key from PHI_ENCRYPTION_KEY (hex or base64 or utf8).
// In production a stable key is mandatory: an ephemeral key would make every record
// written by one process undecryptable by the next (serverless cold starts) → PHI loss.
function resolveKey() {
  const raw = env.phiKey;
  if (!raw) {
    if (env.isProd) {
      throw new Error('PHI_ENCRYPTION_KEY is required in production — refusing to start with an ephemeral key that would corrupt stored PHI.');
    }
    logger.warn('PHI_ENCRYPTION_KEY missing — using ephemeral dev key (records will not decrypt across restarts)');
    return crypto.randomBytes(32);
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) return b64;
  return crypto.createHash('sha256').update(raw).digest(); // derive 32 bytes from any passphrase
}
const KEY = resolveKey();

/**
 * Deterministic, key-order-independent JSON serialization. Two payloads with the same
 * content but different key ordering must produce the SAME fingerprint, otherwise an
 * identical lab re-sent from another hospital would fail to match → breaks "no repeat labs".
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

/** sha256 hex of any JSON-serializable value (canonicalized) — the fingerprint anchored on eGovChain. */
function sha256Hex(value) {
  const input = typeof value === 'string' ? value : stableStringify(value);
  return '0x' + crypto.createHash('sha256').update(input).digest('hex');
}

/** Encrypt PHI at rest. Returns a self-describing string: v1:iv:tag:ciphertext (all base64). */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(payload) {
  const [v, ivB64, tagB64, dataB64] = String(payload).split(':');
  if (v !== 'v1') throw new Error('unsupported ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

const encryptJson = (obj) => encrypt(JSON.stringify(obj));
const decryptJson = (payload) => JSON.parse(decrypt(payload));

const randomId = (prefix = '') => `${prefix}${crypto.randomBytes(9).toString('base64url')}`;

/**
 * Constant-time string comparison. Length is compared first (and leaks, unavoidably —
 * timingSafeEqual throws on unequal buffers), so only use this where the length is not itself
 * the secret. Used for the admin key and for OTP hash comparison.
 */
function timingSafeEqualStr(provided, expected) {
  const a = Buffer.from(String(provided == null ? '' : provided));
  const b = Buffer.from(String(expected == null ? '' : expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { sha256Hex, encrypt, decrypt, encryptJson, decryptJson, randomId, timingSafeEqualStr };
