'use strict';
const { env } = require('../config/env');
const http = require('../lib/http');
const logger = require('../lib/logger');

/**
 * Many eGov *resource* APIs (AI, eMessage, eVerify, Pay, Chain, Report) are expected to use
 * the SAME unified token endpoint as SSO — {baseUrl}/api/token — but with a PER-SERVICE scope
 * and no exchange_code (partner / client-credentials context).
 *
 * Once you confirm the scope strings with the eGov admin (e.g. "EGOV_AI", "EMESSAGE", ...),
 * each integration can call getPartnerToken('<SCOPE>') instead of using a standalone API key.
 * Tokens are short-lived, so we cache them briefly in-process.
 */
const cache = new Map(); // scope -> { token, expiresAt }

async function getPartnerToken(scope) {
  const cached = cache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 5000) return cached.token;

  const cfg = env.egovph;
  const form = new URLSearchParams({
    partner_code: cfg.partnerCode,
    partner_secret: cfg.partnerSecret,
    scope,
  });
  const res = await http.post(`${cfg.baseUrl}/api/token`, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const token = res && res.access_token;
  if (!token) throw new Error(`No access_token for scope ${scope}`);

  // eGov tokens are JWTs with an `exp`; default to 55 min if we can't read it.
  let ttlMs = 55 * 60 * 1000;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    if (payload.exp) ttlMs = payload.exp * 1000 - Date.now();
  } catch { /* ignore */ }
  // Clamp: a past/near-zero exp (clock skew, stale token) would cache a dead entry and
  // re-mint on every call. Floor at 30s, cap at the 55-min default.
  ttlMs = Math.min(Math.max(ttlMs, 30 * 1000), 55 * 60 * 1000);

  cache.set(scope, { token, expiresAt: Date.now() + ttlMs });
  logger.debug('minted eGov partner token', { scope });
  return token;
}

module.exports = { getPartnerToken };
