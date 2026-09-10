'use strict';
const { env } = require('../config/env');
const http = require('../lib/http');
const { AppError, upstream } = require('../lib/errors');
const { sha256Hex } = require('../lib/crypto');
const logger = require('../lib/logger');

const cfg = env.egovph;
const isLive = () => cfg.mode === 'live';

// ---- mock-mode identity (never reached in live mode) ------------------------------------------
// The deployed demo has no eGov behind it, so the mock profile used to return one hardcoded
// uniqid. authService derives the patient id from that uniqid, so EVERY visitor collapsed onto a
// single patient row: two people testing at the same time saw each other's name, phone,
// appointments and payments, and overwrote each other's profile edits. The exchange code is the
// only thing that differs between visitors (the frontend now sends a random, device-persisted
// one), so we hash it into the uniqid instead. Live SSO already gives each account its own
// uniqid and never touches any of this.
const MOCK_TOKEN_PREFIX = 'mock-access-';
const MOCK_UNIQID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MOCK_UNIQID_LENGTH = 13;                 // matches the real eGov uniqid shape
const DEFAULT_MOCK_SEED = 'demo';
// The canonical seeded demo patient (store/index.js DEMO_EGOV_SUB) is keyed off this exact value.
// Mapping the bare 'demo' code back to it keeps `curl -d '{"exchangeCode":"demo"}'`, the docs and
// any already-persisted KV row pointing at the same patient they always did.
const DEFAULT_MOCK_UNIQID = 'MVPCBEUVCGPZR';

/** Strip the mock token wrapper so an exchange code and its mock access token resolve alike. */
const mockSeedFor = (tokenOrCode) => {
  const raw = String(tokenOrCode == null ? '' : tokenOrCode).trim();
  const seed = raw.startsWith(MOCK_TOKEN_PREFIX) ? raw.slice(MOCK_TOKEN_PREFIX.length) : raw;
  return seed || DEFAULT_MOCK_SEED;
};

/** Deterministic uniqid-shaped id for a mock seed — same seed in, same patient out (login stays idempotent). */
function mockUniqid(seed) {
  if (seed === DEFAULT_MOCK_SEED) return DEFAULT_MOCK_UNIQID;
  const digest = Buffer.from(sha256Hex('egovph-mock-uniqid:' + seed).slice(2), 'hex');
  let out = '';
  for (let i = 0; i < MOCK_UNIQID_LENGTH; i += 1) out += MOCK_UNIQID_ALPHABET[digest[i] % MOCK_UNIQID_ALPHABET.length];
  return out;
}

/**
 * eGovPH SSO — real flow, per docs/integrations.md
 *
 *  Step 1  POST {baseUrl}/api/token           (JSON body)
 *            { exchange_code, scope: "SSO_AUTHENTICATION", partner_code, partner_secret }
 *          → { access_token }
 *          The exchange_code is single-use, originates in the eGov super app, and is
 *          appended to the partner's redirect URL (?exchange_code=...).
 *
 *  Step 2  POST {baseUrl}/api/partner/sso_authentication   (Bearer access_token, no body)
 *          → the citizen profile (uniqid, name, birthdate, contact, address, …)
 */

// eGov rejects a spent or stale exchange_code with 422 (the code is single-use and short-lived —
// docs/integrations.md). Nothing is down when that happens, so reporting it as a 502
// "Internal server error" both blames us and leaves the citizen with no idea what to do. Only 422
// from the token endpoint is reclassified: a 5xx, a timeout or a malformed body stays a 502, because
// telling someone to fetch a fresh code during a real eGov outage sends them in circles.
const EXPIRED_CODE_STATUS = 422;
const EXPIRED_CODE_MESSAGE = 'This eGovPH sign-in link has already been used or has expired. '
  + 'Generate a new code in the eGovPH portal, then open the link again.';

/** Step 1: exchange an eGov exchange_code for a scoped access token. */
async function generateAccessToken(exchangeCode, scope = cfg.scope) {
  if (!isLive()) return { access_token: `mock-access-${exchangeCode || 'demo'}` };

  let res;
  try {
    res = await http.post(`${cfg.baseUrl}/api/token`, {
      exchange_code: exchangeCode,
      scope,
      partner_code: cfg.partnerCode,
      partner_secret: cfg.partnerSecret,
    });
  } catch (err) {
    if (err && err.upstreamStatus === EXPIRED_CODE_STATUS) {
      // Deliberately says nothing about the code or the partner credentials — the status and the
      // endpoint are what separate "their code expired" from "eGov is down" in the log.
      logger.warn('egov sso exchange code rejected', { endpoint: '/api/token', status: EXPIRED_CODE_STATUS });
      throw new AppError(EXPIRED_CODE_MESSAGE, 400, 'egov_exchange_code_invalid');
    }
    throw err;
  }
  if (!res || !res.access_token) throw upstream('eGov token endpoint returned no access_token', res);
  return res;
}

/** Step 2: fetch the authenticated citizen's profile with an SSO access token. */
async function fetchSsoProfile(accessToken) {
  if (!isLive()) {
    // Same demo persona for everyone (Juan Dela Cruz is the story the demo tells) — only the
    // uniqid varies, which is enough to give each device its own patient row.
    return normalize({
      uniqid: mockUniqid(mockSeedFor(accessToken)),
      email: 'juan.delacruz@example.ph',
      birth_date: '05/14/1990',
      first_name: 'JUAN',
      middle_name: 'DELA',
      last_name: 'CRUZ',
      suffix: '',
      gender: 'MALE',
      nationality: 'FILIPINO',
      photo: 'https://samplephoto.com',
      mobile: '+639170000000',
      address: 'Sampaloc, Manila',
      region: 'NATIONAL CAPITAL REGION (NCR)',
    });
  }
  const res = await http.post(`${cfg.baseUrl}/api/partner/sso_authentication`, undefined, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = res && (res.data || res);
  if (!data || !data.uniqid) throw upstream('eGov SSO profile response missing data', res);
  return normalize(data);
}

/** Convenience: full SSO login in one call. */
async function loginWithExchangeCode(exchangeCode) {
  const { access_token } = await generateAccessToken(exchangeCode);
  const profile = await fetchSsoProfile(access_token);
  return { accessToken: access_token, profile };
}

/** Convert the eGov `data` object into eGovMed's patient profile shape. */
function normalize(d) {
  return {
    egovSub: d.uniqid,                       // eGov unique id = identity anchor
    firstName: cap(d.first_name),
    middleName: cap(d.middle_name),
    lastName: cap(d.last_name),
    suffix: d.suffix || null,
    birthDate: toIsoDate(d.birth_date),      // MM/DD/YYYY -> YYYY-MM-DD
    sex: d.gender ? String(d.gender).charAt(0).toUpperCase() : null,
    email: (d.email || '').toLowerCase() || null,
    phone: d.mobile || null,
    address: d.address || [d.street, d.barangay, d.municipality, d.province].filter(Boolean).join(', ') || null,
    photo: d.photo || null,
    nationality: d.nationality || null,
    philsysId: null,                         // NOT in SSO payload — obtained separately via eVerify
    raw: d,
  };
}

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
function toIsoDate(mdY) {
  if (!mdY) return null;
  const m = String(mdY).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : mdY;
}

// mockUniqid/DEFAULT_MOCK_UNIQID are exported for tests and for the demo seed, which has to key
// the canonical demo patient off the same value the mock profile returns for the 'demo' code.
module.exports = { generateAccessToken, fetchSsoProfile, loginWithExchangeCode, isLive, mockUniqid, DEFAULT_MOCK_UNIQID };
