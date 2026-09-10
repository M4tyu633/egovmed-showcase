'use strict';
const egovph = require('../integrations/egovph');
const { getStore, COLLECTIONS, seedDemoContentFor } = require('../store');
const { sign } = require('../lib/jwt');
const { sha256Hex } = require('../lib/crypto');
const { publicPatient } = require('../lib/presenters');
const { env } = require('../config/env');
const { isEgovSandboxPhone } = require('../lib/egovSandbox');

// Deterministic patient id from the eGov uniqid → a concurrent first login can't create two rows.
const patientIdFor = (egovSub) => 'pat_' + sha256Hex('egovsub:' + egovSub).slice(2, 22);

/**
 * Log a citizen in via the eGov SSO exchange-code flow:
 *   exchange_code → access_token (/api/token) → profile (/api/partner/sso_authentication)
 */
async function loginWithExchangeCode(exchangeCode) {
  const { profile } = await egovph.loginWithExchangeCode(exchangeCode);
  return upsertAndIssue(profile);
}

/**
 * Alternate path: the client (e.g. eGov app SDK) already holds an SSO access token.
 * We just call sso_authentication with it.
 */
async function loginWithAccessToken(accessToken) {
  const profile = await egovph.fetchSsoProfile(accessToken);
  return upsertAndIssue(profile);
}

/** Create-or-update the Patient keyed on the eGov uniqid, then mint a session JWT. */
async function upsertAndIssue(profile) {
  const store = getStore();
  const now = new Date().toISOString();
  // Only true when this login came from the mock eGovPH branch (config-driven, never
  // client-controlled) — real live SSO logins always keep their history.
  const isDemoPatient = env.egovph.mode !== 'live';
  let patient = await store.findOne(COLLECTIONS.PATIENTS, (p) => p.egovSub === profile.egovSub);

  const incoming = {
    egovSub: profile.egovSub,
    // Immutable provenance derived from the eGovPH SSO response, never from a user-editable field.
    // The official widget's five test accounts are fictional people; their demographics cannot
    // match a hackathon tester's real selfie in eVerify.
    egovSandboxAccount: isEgovSandboxPhone(profile.phone),
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastName: profile.lastName,
    suffix: profile.suffix,
    birthDate: profile.birthDate,
    sex: profile.sex,
    email: profile.email,
    phone: profile.phone,
    nationality: profile.nationality,
  };
  // Don't overwrite previously-good fields with blanks/nulls from a thinner SSO payload.
  const fields = Object.fromEntries(Object.entries(incoming).filter(([, v]) => v !== null && v !== undefined && v !== ''));

  if (patient) {
    // A field the patient manually corrected via PATCH /patients/me stays theirs — SSO can still
    // fill in fields it never touched, but it can't clobber a deliberate fix with a stale value.
    const overridden = new Set(patient.manuallyOverriddenFields || []);
    const patch = Object.fromEntries(Object.entries(fields).filter(([key]) => !overridden.has(key)));
    patient = await store.update(COLLECTIONS.PATIENTS, patient.id, patch);
  } else {
    patient = await store.create(COLLECTIONS.PATIENTS, {
      id: patientIdFor(profile.egovSub),
      egovSub: profile.egovSub,
      ...fields,
      identityVerified: false,  // flips true after eVerify + liveness
      manuallyOverriddenFields: [],
      benefits: { philhealth: { active: false }, whiteCard: { active: false }, sss: { active: false } },
      createdAt: now,
      updatedAt: now,
    });
    // Mock SSO now hands every device its own uniqid, so this branch runs for each new demo
    // visitor rather than once ever. A brand-new patient owns no records and no benefits, which
    // would leave the Records screen and the eGovPay step — the two things the demo is built
    // around — empty for everyone but the one seeded patient. Give them their own copy instead.
    // Mock-only and creation-only: a live SSO signup gets exactly the row it always did.
    if (isDemoPatient) patient = (await seedDemoContentFor(patient.id)) || patient;
  }

  const token = sign({ sub: patient.id });
  if (!isDemoPatient) return { token, patient: publicPatient(patient) };
  // Mock/demo mode has no real citizen behind it. Each device now gets its own demo patient, so
  // this no longer stops one visitor's data reaching another — it stops a *returning* visitor
  // inheriting the leftovers of their own previous run, which in a persistent KV store pile up
  // forever. Wipe the transactional collections (never PATIENTS or the seeded RECORDS/benefits)
  // so each demo run starts clean — the same "resets every time" the in-memory local store gives
  // for free. REPORTS is included because "Your reports" lists by patient: without it a demo run
  // opens on case numbers from the last one.
  //
  // Per-device identity narrows but does not remove the mid-flight hazard resetDemoHistory guards
  // against: a second tab, or a re-login while the hosted eGovPay checkout is open, is still the
  // same patient. See its comment for why in-flight bills must survive.
  await resetDemoHistory(store, patient.id);
  return { token, patient: publicPatient(patient) };
}

// A bill is only safe to delete once it has stopped moving. Anything else is a checkout the
// citizen is still sitting on at eGovPay's hosted page — see resetDemoHistory below.
const TERMINAL_PAYMENT_STATUSES = new Set([
  'paid', 'settled', 'success', 'successful', 'completed',
  'failed', 'voided', 'cancelled', 'canceled', 'declined', 'expired', 'refunded',
]);
const isInFlight = (payment) => !TERMINAL_PAYMENT_STATUSES.has(String(payment.status || '').trim().toLowerCase());

/**
 * Mock/demo mode has no real citizen behind it — it's the same "Juan Dela Cruz" profile for
 * every visitor of the deployed demo. Left alone, appointments/payments/messages/reports filed
 * by one demo session pile up forever in the shared KV store and bleed into the next person's
 * session. Wipe just those four transactional collections (never PATIENTS or the seeded
 * RECORDS/benefits) on every fresh mock login, so each demo run starts clean — the same
 * "resets every time" experience the in-memory local store gives for free.
 * REPORTS belongs here specifically because "Your reports" on the track screen lists them by
 * patient: without this, the first thing a new demo visitor sees is a list of case numbers
 * filed by whoever used the demo before them.
 *
 * The one exception is a payment that has NOT reached a terminal state. eGovPay's hosted checkout
 * is a full page navigation away from the app, and the browser comes back to /payment/return
 * holding nothing but that bill id. Because every visitor shares this one demo patient, an
 * unconditional wipe deleted a mid-flight bill the moment *anyone* signed in — including the same
 * person in a second tab — and the returning browser then asked for a bill that no longer existed
 * and got a bare "Bill not found". In-flight bills survive, as does the appointment each one is
 * attached to, so the paid state still lands on the right card when the citizen returns.
 */
async function resetDemoHistory(store, patientId) {
  const payments = await store.findAll(COLLECTIONS.PAYMENTS, (p) => p.patientId === patientId);
  const keptAppointmentIds = new Set(payments.filter(isInFlight).map((p) => p.appointmentId).filter(Boolean));
  const appointments = await store.findAll(COLLECTIONS.APPOINTMENTS, (a) => a.patientId === patientId);
  await Promise.all([
    ...payments.filter((p) => !isInFlight(p)).map((p) => store.remove(COLLECTIONS.PAYMENTS, p.id)),
    ...appointments.filter((a) => !keptAppointmentIds.has(a.id)).map((a) => store.remove(COLLECTIONS.APPOINTMENTS, a.id)),
    ...[COLLECTIONS.MESSAGES, COLLECTIONS.REPORTS].map(async (collection) => {
      const rows = await store.findAll(collection, (r) => r.patientId === patientId);
      await Promise.all(rows.map((r) => store.remove(collection, r.id)));
    }),
  ]);
}

module.exports = { loginWithExchangeCode, loginWithAccessToken };
