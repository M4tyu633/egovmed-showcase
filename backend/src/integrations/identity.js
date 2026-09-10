'use strict';
const { env, publicUrl } = require('../config/env');
const http = require('../lib/http');
const { randomId } = require('../lib/crypto');
const logger = require('../lib/logger');

/* ── National ID eVerify (NIDAS) ───────────────────────────────
 * Live flow, per docs/integrations.md:
 *   1) POST /api/auth  { client_id, client_secret }                    → access_token
 *   2) POST /api/query { first_name, middle_name, last_name, suffix,
 *                        birth_date (YYYY-MM-DD), face_liveness_session_id }
 *        with  Authorization: Bearer <access_token>
 * The face_liveness_session_id is produced by the eVerify Face Liveness Web SDK on the
 * client (window.eKYC().start({ pubKey }) → result.session_id) and passed through here.
 */
const everify = env.everify;
const isEverifyLive = () => everify.mode === 'live';

let tokenCache = null; // { token, expiresAt }
async function everifyToken() {
  if (!everify.clientId || !everify.clientSecret) throw new Error('eVerify live mode requires client credentials');
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5000) return tokenCache.token;
  const res = await http.post(`${everify.baseUrl}/api/auth`, {
    client_id: everify.clientId,
    client_secret: everify.clientSecret,
  });
  const data = res && (res.data || res);
  const token = data && (data.access_token || data.token);
  if (!token) throw new Error('eVerify /api/auth returned no access_token');
  // The gateway returns its own `expires_at` (unix seconds, as a string) and it is SHORTER than an
  // hour — measured at ~42 minutes. A flat 50-minute cache therefore hands out a dead token for the
  // last several minutes of its life, and every /api/query in that window 401s for no visible
  // reason. Trust the server's expiry, minus a 60s skew margin, and only fall back to a fixed TTL
  // when the field is missing. Floored so a stale/skewed clock re-mints instead of caching a
  // corpse, capped so a wrong-unit value can't pin a token forever.
  const expiresAtMs = Number(data.expires_at) * 1000;
  const ttlMs = Number.isFinite(expiresAtMs) && expiresAtMs > 0
    ? expiresAtMs - Date.now() - 60_000
    : 50 * 60 * 1000;
  tokenCache = { token, expiresAt: Date.now() + Math.min(Math.max(ttlMs, 30_000), 60 * 60 * 1000) };
  return token;
}

async function verifyPhilSys({ firstName, middleName, lastName, suffix, birthDate, faceLivenessSessionId, consent }) {
  if (!consent) return { verified: false, reason: 'consent_required' };

  if (isEverifyLive()) {
    const token = await everifyToken();
    const res = await http.post(`${everify.baseUrl}/api/query`, {
      first_name: firstName,
      middle_name: middleName || undefined,
      last_name: lastName,
      suffix: suffix || undefined,
      birth_date: birthDate, // YYYY-MM-DD
      face_liveness_session_id: faceLivenessSessionId,
    }, { headers: { Authorization: `Bearer ${token}` } });
    const data = res && (res.data || res);
    // Confirmed response shape (portal docs, 2026-07): envelope is { data: { code, reference, ... } }.
    // Success indicator is the six-char status code, NOT a boolean field. AAA000 = success;
    // other codes (e.g. AAA001+, EEE...) indicate mismatch / not found / errors.
    // `reference` is the PhilSys reference (no `_id` suffix). Response also carries full PII
    // (full_name, gender, marital_status, blood_type, mobile_number, addresses) — do not surface
    // beyond what identityService already stores. NO `score` field is returned by /api/query.
    // OBSERVED shape (staging, 2026-07-30): { data: { verified: boolean }, meta: {...} }.
    // The portal docs claim { data: { code, reference } } with AAA000 for success — there is no
    // code field at all, so the old check was undefined === 'AAA000', i.e. permanently false.
    // eVerify could never pass regardless of the identity supplied. Prefer the boolean; fall back
    // to the documented code so a differently-configured environment still works.
    const verified = !!(data && (typeof data.verified === 'boolean' ? data.verified : data.code === 'AAA000'));
    // A demographic mismatch comes back as HTTP 200 with a non-AAA000 code, so lib/http.js never
    // logs it and a failed verification was previously indistinguishable from "no PhilSys record",
    // "face mismatch" or "bad session". Log the status code ONLY — the body carries full_name,
    // gender, marital_status, blood_type, mobile_number and addresses, none of which may be logged.
    if (!verified) {
      // KEY NAMES ONLY — values carry full_name, gender, blood_type, mobile_number, addresses.
      // A null code means the envelope is not { data: { code } } as the portal docs describe, so
      // log the shape we actually received to find where the status really lives.
      logger.warn('eVerify query did not pass', {
        code: (data && data.code) || null,
        topLevelKeys: res && typeof res === 'object' ? Object.keys(res) : typeof res,
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : typeof data,
        dataVerified: data ? data.verified : undefined, // boolean status, not PII
        // meta is an envelope (status/message), not the PII-bearing data object. Logged so a
        // 'no PhilSys record' can be told apart from a demographic or biometric mismatch.
        meta: res && res.meta ? res.meta : null,
      });
    }
    return { verified, reference: data && data.reference, code: data && data.code, meta: (res && res.meta) || null, provider: 'everify' };
  }

  // mock: verifies as long as a name is present (demo runs offline)
  const ok = Boolean(firstName && lastName);
  return { verified: ok, score: ok ? 0.99 : 0, reference: randomId('ref_'), provider: 'mock' };
}

/* ── Face Liveness (separate hosted service) ───────────────────
 * per docs/integrations.md (x-api-key auth):
 *   POST /v1/liveness/session          → { token, url }
 *   GET  /v1/liveness/result/{token}   → { status, confidence_score, reference_image_url }
 * The user completes the check at `url`; accept only status "SUCCEEDED" && confidence >= minConfidence.
 * The session `token` is what gets passed to eVerify /api/query as face_liveness_session_id.
 */
const faceLiveness = env.faceLiveness;
const isLivenessLive = () => faceLiveness.mode === 'live';

async function createLivenessSession() {
  if (isLivenessLive()) {
    if (!faceLiveness.apiKey) throw new Error('Face Liveness live mode requires FACE_LIVENESS_API_KEY');
    const callbackUrl = faceLiveness.callbackUrl || publicUrl(env.appUrl, '/liveness/callback');
    if (!/^https:\/\//i.test(callbackUrl)) throw new Error('Face Liveness live mode requires an HTTPS callback URL');
    const res = await http.post(`${faceLiveness.baseUrl}/v1/liveness/session`, {
      action: faceLiveness.action,
      callback_url: callbackUrl,
      delay: 1200,
    }, { headers: { 'x-api-key': faceLiveness.apiKey, 'Content-Type': 'application/json' } });
    return { sessionId: res.token, url: res.url, provider: 'face-liveness' }; // frontend sends the user to `url`
  }
  return { sessionId: randomId('live_'), url: null, provider: 'mock' };
}

async function getLivenessResult(sessionId) {
  if (isLivenessLive()) {
    if (!faceLiveness.apiKey) throw new Error('Face Liveness live mode requires FACE_LIVENESS_API_KEY');
    const res = await http.get(`${faceLiveness.baseUrl}/v1/liveness/result/${encodeURIComponent(sessionId)}`, {
      headers: { 'x-api-key': faceLiveness.apiKey },
    });
    const confidence = typeof res.confidence_score === 'number' ? res.confidence_score : 0;
    const live = res.status === 'SUCCEEDED' && confidence >= faceLiveness.minConfidence;
    return { sessionId, live, confidence, status: res.status, provider: 'face-liveness' };
  }
  return { sessionId, live: true, confidence: 97, provider: 'mock' }; // 0–100 scale
}

module.exports = { verifyPhilSys, createLivenessSession, getLivenessResult };
