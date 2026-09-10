'use strict';
require('dotenv').config();

const bool = (v, d = false) => (v == null ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const int = (v, d) => {
  if (v == null || v === '') return d;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d; // never let a malformed value (NaN) leak into config
};

// Redis key namespace. Empty means "no prefix", which is what production uses — existing keys
// keep their exact shape, so enabling this feature migrates nothing. A malformed value would
// silently split the keyspace and make a deployment look like it lost its data, so reject
// anything but a simple slug rather than sanitizing it into something unintended.
const keyPrefix = (raw) => {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return '';
  const slug = v.replace(/:+$/, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) {
    throw new Error(`STORE_KEY_PREFIX must be alphanumeric with - or _ (got "${v}").`);
  }
  return `${slug}:`;
};

const GLOBAL_MODE = (process.env.INTEGRATION_MODE || 'mock').toLowerCase();
// Per-integration mode: explicit *_MODE wins, otherwise fall back to the global switch.
const modeFor = (name) => (process.env[`${name}_MODE`] || GLOBAL_MODE).toLowerCase();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: int(process.env.PORT, 4000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  apiPublicUrl: process.env.API_PUBLIC_URL || `http://localhost:${int(process.env.PORT, 4000)}`,

  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  sessionTtl: Math.max(1, int(process.env.SESSION_TTL, 86400)), // must be positive → valid jwt expiresIn
  phiKey: process.env.PHI_ENCRYPTION_KEY || '',
  adminKey: process.env.ADMIN_KEY || '', // gates operational routes (escalation sweep, insights)
  allowMockInProduction: bool(process.env.ALLOW_MOCK_IN_PRODUCTION, false),
  // Configurable retention for PHI-access audit entries, swept through the administrative API.
  auditLogRetentionDays: Math.max(1, int(process.env.AUDIT_LOG_RETENTION_DAYS, 180)),

  store: {
    driver: (process.env.STORE_DRIVER || 'memory').toLowerCase(),
    // Accept either Upstash-standard names or the Vercel-KV-marketplace variants (with an optional
    // integration prefix like UPSTASH_REDIS_REST_) so `vercel-add-integration` "just works" without
    // manual env-var renaming.
    upstashUrl:
      process.env.UPSTASH_REDIS_REST_URL
      || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL
      || process.env.KV_REST_API_URL
      || '',
    upstashToken:
      process.env.UPSTASH_REDIS_REST_TOKEN
      || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
      || process.env.KV_REST_API_TOKEN
      || '',
    // Namespaces every Redis key so a non-production deployment can share one Upstash database
    // with production without colliding. Empty in production, so existing keys are untouched and
    // no migration is needed. See keyPrefix() for the format and warnIfMisconfigured() for the
    // guards that make the isolation mandatory rather than hoped-for.
    keyPrefix: keyPrefix(process.env.STORE_KEY_PREFIX),
  },

  globalMode: GLOBAL_MODE,

  egovph: {
    mode: modeFor('EGOVPH'),
    // SSO host (per docs/integrations.md). Token endpoint: {baseUrl}/api/token
    baseUrl: process.env.EGOVPH_BASE_URL || 'https://platforms-api.e.gov.ph/egov-sso',
    partnerCode: process.env.EGOVPH_PARTNER_CODE || process.env.EGOVPH_CLIENT_ID || '',
    partnerSecret: process.env.EGOVPH_PARTNER_SECRET || process.env.EGOVPH_CLIENT_SECRET || '',
    scope: process.env.EGOVPH_SCOPE || 'SSO_AUTHENTICATION',
    launchUrl: process.env.EGOVPH_LAUNCH_URL || '',
  },
  egovAi: {
    mode: modeFor('EGOV_AI'),
    // per docs/integrations.md: POST /api/v1/egov/integration/token (access_code) → Bearer, then /ai_assistant/generate
    baseUrl: process.env.EGOV_AI_BASE_URL || 'https://platforms-api.e.gov.ph/egov-ai',
    accessCode: process.env.EGOV_AI_ACCESS_CODE || '',
    category: process.env.EGOV_AI_CATEGORY || 'PH',
  },
  everify: {
    mode: modeFor('EVERIFY'),
    // NIDAS eVerify (per docs/integrations.md): /api/auth → /api/query
    baseUrl: process.env.EVERIFY_BASE_URL || 'https://platforms-api.e.gov.ph/everify',
    clientId: process.env.EVERIFY_CLIENT_ID || '',
    clientSecret: process.env.EVERIFY_CLIENT_SECRET || '',
    pubKey: process.env.EVERIFY_PUBKEY || '', // eVerify liveness widget public key (client-side; optional)
  },
  // Which provider performs the Step 3 face capture. The two are NOT interchangeable: eVerify
  // rejects a session minted by the hosted Face Liveness service, so the capture provider decides
  // whether a PhilSys identity match is even possible.
  //   'face-liveness' → hosted capture, no identity match (eVerify stays mock)
  //   'everify'       → in-app Web SDK capture + real PhilSys match
  // Served via /auth/config so the frontend follows the backend rather than needing its own
  // build-time flag kept in sync across two Vercel projects.
  verification: {
    method: (process.env.VERIFICATION_METHOD || 'face-liveness').toLowerCase() === 'everify' ? 'everify' : 'face-liveness',
  },
  faceLiveness: {
    mode: modeFor('FACE_LIVENESS'),
    // per docs/integrations.md: x-api-key auth, hosted session → result flow
    baseUrl: process.env.FACE_LIVENESS_BASE_URL || 'https://platforms-api.e.gov.ph/face-liveness',
    apiKey: process.env.FACE_LIVENESS_API_KEY || '',
    action: process.env.FACE_LIVENESS_ACTION || 'redirect',
    callbackUrl: process.env.FACE_LIVENESS_CALLBACK_URL || '',
    minConfidence: int(process.env.FACE_LIVENESS_MIN_CONFIDENCE, 95),
  },
  // Where notifications actually land. eGovPH's sandbox hands back +63909000000N personas whose
  // numbers no carrier will ever deliver to, so on a demo deployment every SMS the app "sends"
  // disappears. NOTIFY_DEFAULT_PHONE is the one reachable handset that stands in for them; unset
  // (the production default) the behaviour is exactly what it was before.
  notify: {
    defaultPhone: (process.env.NOTIFY_DEFAULT_PHONE || '').trim(),
  },
  eMessage: {
    mode: modeFor('EMESSAGE'),
    // per docs/integrations.md: POST /messaging/v1/sms/push, X-EMESSAGE-Auth header
    baseUrl: process.env.EMESSAGE_BASE_URL || 'https://platforms-api.e.gov.ph/emessage',
    authToken: process.env.EMESSAGE_AUTH_TOKEN || process.env.EMESSAGE_API_KEY || '',
    senderId: process.env.EMESSAGE_SENDER_ID || 'eGovMed',
  },
  egovChain: {
    mode: modeFor('EGOVCHAIN'),
    // Live portal: credential base_url + / + token, Hyperledger Besu QBFT, gasPrice 0, chain 13371.
    rpcUrl: process.env.EGOVCHAIN_RPC_URL || '',
    chainId: int(process.env.EGOVCHAIN_CHAIN_ID, 13371),
    // .trim() collapses the most common paste-error path (trailing newline / space / CR).
    // Without this, ethers.getBytes rejects the whitespaced value and echoes the FULL
    // still-valid key into err.message — which the anchorHash catch block would then log.
    // Belt-and-braces: warnIfMisconfigured also validates the shape below, and egovChain.js
    // scrubs any long hex substring from log lines regardless of source.
    privateKey: (process.env.EGOVCHAIN_PRIVATE_KEY || '').trim(),
  },
  egovPay: {
    mode: modeFor('EGOVPAY'),
    // per docs/integrations.md: POST /api/v1/transaction with X-eGovPay-Token + HMAC digest
    baseUrl: process.env.EGOVPAY_BASE_URL || 'https://platforms-api.e.gov.ph/egovpay',
    token: process.env.EGOVPAY_TOKEN || process.env.EGOVPAY_API_KEY || '', // X-eGovPay-Token (test_-prefixed in test mode)
    settlementTemplateUuid: process.env.EGOVPAY_SETTLEMENT_TEMPLATE_UUID || '',
    redirectUrl: process.env.EGOVPAY_REDIRECT_URL || '',
    callbackUrl: process.env.EGOVPAY_CALLBACK_URL || '',
    // Mock-mode only: the mock gateway used to always settle every checkout as 'paid', so the
    // failed-payment UI could never be exercised without real eGovPay credentials. Lets
    // developers/QA force the mock's outcome (e.g. EGOVPAY_MOCK_OUTCOME=failed) to test that path.
    mockOutcome: (process.env.EGOVPAY_MOCK_OUTCOME || 'paid').trim().toLowerCase(),
  },
  eReport: {
    mode: modeFor('EREPORT'),
    // per docs/integrations.md: POST /api/integration/token (access_code) → submit_complaint.
    // No view token: report lookup needs a per-complainant OTP-minted token (see integrations/eReport.js).
    baseUrl: process.env.EREPORT_BASE_URL || '',
    accessCode: process.env.EREPORT_ACCESS_CODE || '',
    reportType: process.env.EREPORT_TYPE || 'red_tape',
    location: {
      regionCode: process.env.EREPORT_REGION_CODE || '',
      provinceCode: process.env.EREPORT_PROVINCE_CODE || '',
      municipalityCode: process.env.EREPORT_MUNICIPALITY_CODE || '',
      barangayCode: process.env.EREPORT_BARANGAY_CODE || '',
    },
    escalateAfterHours: int(process.env.EREPORT_ESCALATE_AFTER_HOURS, 48),
  },
};

function warnIfMisconfigured(log) {
  const weakJwtSecrets = new Set(['dev-insecure-secret-change-me', 'change-me-to-a-long-random-string']);
  if (env.isProd && (weakJwtSecrets.has(env.jwtSecret) || env.jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be a unique secret of at least 32 characters in production.');
  }
  if (env.isProd && env.phiKey.length < 32) {
    throw new Error('PHI_ENCRYPTION_KEY must be a stable secret of at least 32 characters in production.');
  } else if (!env.phiKey) {
    log.warn('PHI_ENCRYPTION_KEY is not set — health records will use an ephemeral key (records will not decrypt across restarts).');
  }
  if (env.isProd && env.store.driver !== 'kv') {
    throw new Error('STORE_DRIVER=kv is required in production so PHI and rate limits persist across instances.');
  } else if (env.store.driver === 'memory') {
    log.warn('STORE_DRIVER=memory — data will NOT persist across serverless invocations. Use STORE_DRIVER=kv on Vercel.');
  }
  if (env.isProd && env.store.driver === 'kv' && (!env.store.upstashUrl || !env.store.upstashToken)) {
    throw new Error('Upstash credentials are required when STORE_DRIVER=kv in production.');
  }
  // Staging shares production's single Upstash database (the account is Vercel-managed and cannot
  // create a second one), so the ONLY thing separating the two is STORE_KEY_PREFIX. Both
  // directions are fail-hard because both are silent data disasters:
  //   - a prefix in production reads an empty keyspace, i.e. production looks wiped
  //   - no prefix in preview writes straight into production's keys, corrupting real records
  // VERCEL_ENV is set by the platform and distinguishes production from preview reliably, which
  // NODE_ENV cannot do here — preview deliberately runs with NODE_ENV=production.
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv === 'production' && env.store.keyPrefix) {
    throw new Error(`STORE_KEY_PREFIX must be empty in production (got "${env.store.keyPrefix}"). A prefix here points production at an empty keyspace.`);
  }
  if (vercelEnv && vercelEnv !== 'production' && env.store.driver === 'kv' && !env.store.keyPrefix) {
    throw new Error(`STORE_KEY_PREFIX is required when VERCEL_ENV=${vercelEnv} and STORE_DRIVER=kv. Without it this deployment writes into production's keyspace.`);
  }
  if (env.isProd && env.appUrl === '*') {
    throw new Error('APP_URL must be an explicit trusted origin in production.');
  }
  if (env.isProd && env.adminKey && env.adminKey.length < 32) {
    throw new Error('ADMIN_KEY must be at least 32 characters when configured in production.');
  }
  // Validate the eGovChain signer key BEFORE it can reach ethers.Wallet — an ethers rejection
  // on a whitespaced key echoes the still-valid key material into the exception message, which
  // any catch/log path would then persist. Live-mode gated so mock deploys don't need a key.
  if (env.egovChain.mode === 'live' && !/^0x[0-9a-fA-F]{64}$/.test(env.egovChain.privateKey)) {
    throw new Error('EGOVCHAIN_PRIVATE_KEY must be "0x" + 64 hex chars (check for trailing whitespace, quotes, or CRLF from a paste).');
  }
  if (env.egovChain.mode === 'live' && !env.egovChain.rpcUrl) {
    throw new Error('EGOVCHAIN_RPC_URL is required in live mode. Use the credentialed gateway URL from your own eGov API Developer Portal account.');
  }
  // eMessage rejects anything that is not E.164, and it does so at send time — which for the OTP
  // path is inside a fail-closed block, so a typo here would surface as "report filing is broken"
  // rather than "that env var is malformed". Check it at boot instead.
  if (env.notify.defaultPhone && !/^\+63\d{10}$/.test(env.notify.defaultPhone)) {
    throw new Error('NOTIFY_DEFAULT_PHONE must be E.164 Philippine mobile: "+63" followed by 10 digits.');
  }
  // Loud, but not fatal. This redirects every unedited patient's SMS to one handset, which is
  // indefensible in a real citizen-facing deployment — and also the only way an evaluator watching
  // a demo ever sees a message arrive, because eGovPH's sandbox personas carry undialable numbers.
  // A hard throw would take the whole backend down mid-demo over a variable somebody set on
  // purpose, so this warns at every boot instead and the README says to unset it before launch.
  if (env.notify.defaultPhone && env.isProd) {
    log.warn('NOTIFY_DEFAULT_PHONE is set: every notification for a patient who has not set their own number in Account goes to that one handset. Demo affordance — unset it for a real deployment.');
  }
  if (env.isProd && !env.allowMockInProduction) {
    // All eight eGov integrations must be live + credentialed once the mock escape hatch is off.
    // A silent mock in production could serve fake triage, identity, or payment data to a real citizen.
    const requirements = [
      [env.egovph.mode === 'live' && env.egovph.partnerCode && env.egovph.partnerSecret, 'eGovPH SSO'],
      [env.everify.mode === 'live' && env.everify.clientId && env.everify.clientSecret, 'eVerify'],
      [env.faceLiveness.mode === 'live' && env.faceLiveness.apiKey, 'Face Liveness'],
      // settlementTemplateUuid is required by egovPay.createBill — unify with /integrations/status
      [env.egovPay.mode === 'live' && env.egovPay.token && env.egovPay.settlementTemplateUuid, 'eGovPay'],
      [env.eMessage.mode === 'live' && env.eMessage.authToken, 'eMessage'],
      // eReport.baseUrl has no default (env.js:108). Without it, boot succeeds but every
      // fileReport 500s at request time — moved to boot so the failure is loud not lazy.
      [env.eReport.mode === 'live' && env.eReport.baseUrl && env.eReport.accessCode
        && env.eReport.location.regionCode && env.eReport.location.provinceCode
        && env.eReport.location.municipalityCode && env.eReport.location.barangayCode, 'eReport'],
      [env.egovChain.mode === 'live' && env.egovChain.rpcUrl && env.egovChain.privateKey, 'eGovChain'],
      [env.egovAi.mode === 'live' && env.egovAi.accessCode && env.egovAi.baseUrl, 'eGov AI'],
    ];
    const missing = requirements.filter(([ok]) => !ok).map(([, name]) => name);
    if (missing.length) {
      throw new Error(`Production cannot use mock or uncredentialed integrations: ${missing.join(', ')}. Set ALLOW_MOCK_IN_PRODUCTION=true only for an explicit non-live demo.`);
    }
  }
}

function publicUrl(base, path) {
  return `${String(base || '').replace(/\/$/, '')}/${String(path || '').replace(/^\//, '')}`;
}

module.exports = { env, bool, int, keyPrefix, publicUrl, warnIfMisconfigured };
