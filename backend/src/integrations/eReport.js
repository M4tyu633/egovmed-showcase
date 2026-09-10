'use strict';
const { env } = require('../config/env');
const { upstream } = require('../lib/errors');
const http = require('../lib/http');

const cfg = env.eReport;
const isLive = () => cfg.mode === 'live';

// per docs/integrations.md — POST /api/integration/token { access_code } → Bearer.
// Verified live 2026-07-30 against stg-ereport-ws: 200 with { access_token, expires_at }, where
// access_token is a bare UUID (36 chars) and expires_at is an ISO-8601 string with a +08:00 offset.
let tokenCache = null;
async function ereportToken() {
  if (!cfg.accessCode || !cfg.baseUrl) throw new Error('eReport live mode requires base URL and access code');
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  const res = await http.post(`${cfg.baseUrl}/api/integration/token`, { access_code: cfg.accessCode });
  const token = res && res.access_token;
  if (!token) throw upstream('eReport token endpoint returned no access_token');
  // Honour the server's own expiry (observed ~2 days out) instead of a hardcoded guess, minus a
  // 60s skew margin. Falls back to 50 minutes if expires_at is missing or unparseable, so a
  // response-shape change can only make us refresh more often, never serve a stale token.
  const serverExpiry = Date.parse(res.expires_at);
  const expiresAt = Number.isFinite(serverExpiry) && serverExpiry > Date.now()
    ? serverExpiry - 60_000
    : Date.now() + 50 * 60 * 1000;
  tokenCache = { token, expiresAt };
  return token;
}

/* Normalize Philippine numbers to country-prefixed digits. Unrecognized formats retain their digits without rewriting the country code. */
function phMobile(raw) {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('63')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `63${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) return `63${digits}`;
  return digits;
}

// `contact` is a single free-text field the patient can fill with either a phone or an email, so
// it can only be used as the email fallback when it actually looks like one. Sending a phone
// number in complainant_email would make eReport's own OTP/notification flow undeliverable.
const asEmail = (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()) ? String(v).trim() : '');

/**
 * File a complaint → POST /api/integration/submit_complaint (Bearer). Requires complainant details
 * + PSA location codes (from config). `report_type` is a fixed eReport enum (default from cfg); our
 * routing/billing/etc. category rides along as the subject.
 *
 * Verified live 2026-07-30: 200 with { code, message, case_number } at the TOP level (no `data`
 * envelope), case_number formatted `PFM-MMDDYY-####`.
 */
async function fileReport({ category, description, patient = {}, contact }) {
  if (isLive()) {
    const token = await ereportToken();
    const res = await http.post(`${cfg.baseUrl}/api/integration/submit_complaint`, {
      // `contact` first, not patient.phone. The caller has already resolved who is actually
      // reachable (services/reportService → lib/recipient): a number the citizen typed for this
      // complaint, else NOTIFY_DEFAULT_PHONE, else the SSO-supplied number. Preferring
      // patient.phone here silently undid that and filed the sandbox +63909... number, which is
      // the number eReport itself texts the complainant on.
      mobile: phMobile(contact || patient.phone),
      first_name: patient.firstName || 'eGovMed',
      last_name: patient.lastName || 'Patient',
      gender: patient.sex === 'F' ? 'Female' : 'Male',
      complainant_email: asEmail(patient.email) || asEmail(contact) || 'noreply@egovmed.ph',
      // eReport enum, from GET /api/integration/datasets/report_types. Confirmed live 2026-07-30:
      // 12 active codes, NONE health-specific (scam, gas_station_concerns, red_tape, child_abuse,
      // women_abuse, OFW_APP, overpricing, fire, Senior Citizen, accident, crime, illegal_dumping).
      // 'red_tape' is the closest fit for a public-hospital service complaint until the eGov team
      // adds a health type — see docs/integrations.md.
      report_type: cfg.reportType,
      subject: category,
      message: description,
      region_code: cfg.location.regionCode,
      province_code: cfg.location.provinceCode,
      municipality_code: cfg.location.municipalityCode,
      barangay_code: cfg.location.barangayCode,
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    // Tolerate either the observed top-level shape or a future `data` envelope, but never store a
    // report with an undefined case number — that would leave the patient with nothing to track
    // and no error to explain why.
    const caseNumber = (res && (res.case_number || (res.data && res.data.case_number))) || '';
    if (!caseNumber) throw upstream('eReport accepted the complaint but returned no case_number', res);
    return { caseNumber, status: 'open', provider: 'ereport' };
  }
  const caseNumber = `EGM-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  return { caseNumber, status: 'open', provider: 'mock' };
}

/**
 * No status read-back. This is deliberate — see docs/integrations.md.
 *
 * eReport's report lookup (GET /api/integration/reports/:case_number) is gated on a
 * `report_view_token`, which is minted per-complainant and time-limited:
 *   POST /verify/request { email }        → emails a 6-digit OTP to THAT complainant
 *   POST /verify/confirm { email, otp }   → { report_view_token, expires_at }
 * A single env-wide token therefore cannot look up an arbitrary patient's case: it only ever
 * authorizes the one mailbox whose OTP minted it, and only until it expires. The previous
 * EREPORT_VIEW_TOKEN config promised a capability that could not exist, so it is gone.
 *
 * To restore live status later, eGovMed would have to relay eReport's OTP to the patient (collect
 * their code, call verify/confirm on their behalf, cache the short-lived token against their
 * session) — a real feature, not a config value. Until then the tracking screen shows the case
 * number plus our own locally-authoritative state (open / escalated) and points the patient at
 * eReport for the government-side status.
 */

module.exports = { fileReport, escalateAfterHours: cfg.escalateAfterHours, phMobile };
