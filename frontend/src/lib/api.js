// Thin client for the eGovMed backend. Base URL from VITE_API_BASE_URL (default /api, proxied in dev).
// The session token from login is attached as a Bearer on every authed call.
const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const SESSION_KEY = 'egovmed.session';
let token = typeof window !== 'undefined' ? window.sessionStorage.getItem(SESSION_KEY) : null;
export function setToken(t) {
  token = t || null;
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(SESSION_KEY, token);
  else window.sessionStorage.removeItem(SESSION_KEY);
}
export function getToken() { return token; }

// In mock mode there is no eGovPH account behind the sign-in, so the exchange code is the ONLY
// thing that distinguishes one demo visitor from another: the backend hashes it into the eGov
// uniqid that the patient id is derived from. Every client used to send the literal 'demo', so
// every visitor landed on one shared patient row and watched strangers overwrite their profile.
// localStorage, not sessionStorage: a demo identity that changed with every tab would hand the
// same person a new empty patient each time they reopened the app. Live mode never calls this —
// its exchange code comes from the eGovPH redirect.
const DEMO_CODE_KEY = 'egovmed.demoExchangeCode';
let demoCode = null; // in-memory fallback for private mode / storage blocked by the browser

function randomToken() {
  const c = typeof window !== 'undefined' ? window.crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function demoExchangeCode() {
  if (demoCode) return demoCode;
  let stored = null;
  try { stored = window.localStorage.getItem(DEMO_CODE_KEY); } catch { stored = null; }
  demoCode = stored || `demo_${randomToken()}`;
  // Persist failures are survivable — the in-memory value keeps this browsing session coherent,
  // it just won't outlive a reload. Better than refusing to sign in.
  if (!stored) { try { window.localStorage.setItem(DEMO_CODE_KEY, demoCode); } catch { /* storage unavailable */ } }
  return demoCode;
}

async function req(path, { method = 'GET', body, timeoutMs } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Backend configuration request timed out');
    throw err;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    // zod rejections all share the message "Validation failed" and put the useful part — which
    // field and why — in details[]. Dropping it left the user staring at a generic string with no
    // way to know what to change, so fold the field messages into the thrown Error.
    const base = (data && data.error && data.error.message) || `HTTP ${res.status}`;
    const details = data && data.error && Array.isArray(data.error.details) ? data.error.details : [];
    const explained = details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).filter(Boolean);
    const err = new Error(explained.length ? `${base} (${explained.join('; ')})` : base);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // 2s was too tight: the serverless backend awaits its cold-start demo seed (a patient plus three
  // encrypted records written to Redis) before serving any request, which regularly blew the
  // budget on low-traffic deployments and surfaced as "Backend configuration request timed out"
  // at the login screen. Warm responses are ~200ms, so this only ever costs time on a cold start.
  authConfig: () => req('/auth/config', { timeoutMs: 10000 }),
  // In live mode the exchange code comes from the eGovPH redirect query string; in mock mode it
  // defaults to this device's own demo identity (see demoExchangeCode above).
  login: (exchangeCode = demoExchangeCode()) => req('/auth/egov/exchange', { method: 'POST', body: { exchangeCode } }),
  me: () => req('/patients/me'),
  // Update the citizen's own contact fields (phone / email). Backend accepts either or both,
  // rejects anything else via zod .strict() — names and DOB stay locked to the SSO source.
  updateContact: (patch) => req('/patients/me', { method: 'PATCH', body: patch }),
  activateBenefit: (key) => req(`/patients/me/benefits/${encodeURIComponent(key)}`, { method: 'PATCH' }),
  removeBenefit: (key) => req(`/patients/me/benefits/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  // eGovAI triage
  triage: (text, language) => req('/triage', { method: 'POST', body: { text, language: language === 'tl' ? 'tl' : 'en' } }),
  // National ID eVerify + Face Liveness
  startLiveness: () => req('/identity/liveness', { method: 'POST', body: {} }),
  // Registers a session_id already captured client-side by the eVerify Face Liveness Web SDK
  // (window.eKYC().start({ pubKey })) — a different provider than startLiveness() above.
  registerEverifySdkLiveness: (sessionId) => req('/identity/liveness/everify-sdk', { method: 'POST', body: { sessionId } }),
  verifyIdentity: (livenessSessionId) => req('/identity/verify', { method: 'POST', body: { consent: true, livenessSessionId } }),
  // Appointments + eMessage
  book: (specialty, hospital, scheduledFor, triageId) => req('/appointments', {
    method: 'POST', body: { specialty, ...(hospital ? { hospital } : {}), ...(scheduledFor ? { scheduledFor } : {}), ...(triageId ? { triageId } : {}) },
  }),
  appointments: () => req('/appointments'),
  messages: () => req('/messages'),
  replyToMessage: (id, text) => req(`/messages/${encodeURIComponent(id)}/reply`, { method: 'POST', body: { text } }),
  // eGovPay (benefits mock-labeled by the backend)
  quote: (billAmount) => req('/payments/quote', { method: 'POST', body: { billAmount } }),
  pay: (billAmount, channel, appointmentId) => req('/payments', { method: 'POST', body: { billAmount, channel, ...(appointmentId ? { appointmentId } : {}) } }),
  paymentStatus: (billId) => req(`/payments/${encodeURIComponent(billId)}/status`),
  payments: () => req('/payments'),
  // eGovChain-anchored records
  records: () => req('/records'),
  createRecord: (record) => req('/records', { method: 'POST', body: record }),
  getRecord: (id) => req(`/records/${encodeURIComponent(id)}`),
  verifyRecord: (id) => req(`/records/${encodeURIComponent(id)}/verify`),
  doctorSummary: () => req('/records/doctor-summary'),
  // eReport. Filing is gated on a real SMS one-time code: requestReportOtp() texts it to the
  // number on the patient's record (the server picks the number, never the client), and fileReport
  // spends it. Without a valid challengeId + code the backend files nothing.
  requestReportOtp: () => req('/reports/otp', { method: 'POST', body: {} }),
  fileReport: (category, description, challengeId, code) => req('/reports', {
    method: 'POST', body: { category, description, challengeId, code },
  }),
  myReports: () => req('/reports'),
  trackCase: (caseNumber) => req(`/reports/${encodeURIComponent(caseNumber)}`),
};

export { BASE };
