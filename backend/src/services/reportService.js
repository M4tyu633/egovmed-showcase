'use strict';
const eReport = require('../integrations/eReport');
const otpService = require('./otpService');
const { getStore, COLLECTIONS } = require('../store');
const { randomId, encryptJson, decryptJson } = require('../lib/crypto');
const { notFound } = require('../lib/errors');
const { smsRecipientFor } = require('../lib/recipient');

/**
 * Filing is gated on a code texted to the patient's own number (POST /reports/otp mints it).
 * A complaint carries the complainant's name and phone into a government queue, so an unverified
 * filing puts someone else's name on a government record — and the case number that comes back is
 * the only handle they have for it.
 */
async function fileReport({ patientId, category, description, contact, challengeId, code }) {
  const store = getStore();
  const patient = patientId ? await store.findById(COLLECTIONS.PATIENTS, patientId) : null;
  // Before anything reaches eReport. Throws on a wrong, expired, reused or over-capped code.
  await otpService.claimOtp({ patientId, purpose: otpService.PURPOSES.REPORT, challengeId, code });
  // The contact number that goes into the government queue is what a caseworker will ring back.
  // An explicit `contact` on the request still wins — the citizen typed it for this complaint —
  // and otherwise this resolves the same way every other notification does, so a sandbox persona's
  // undialable +63909... number is not what ends up on a filed case.
  const filed = await eReport.fileReport({ category, description, patient: patient || {}, contact: contact || smsRecipientFor(patient).to })
    .catch(async (err) => {
      // Nothing was filed, so the code is retired rather than silently left claimable — the
      // patient requests a new one. Fail closed in both directions.
      await otpService.settleOtp(challengeId, false);
      throw err;
    });
  await otpService.settleOtp(challengeId, true);
  const report = {
    id: randomId('rep_'),
    patientId: patientId || null,
    category,
    encryptedVersion: 1,
    encrypted: encryptJson({ description }),
    caseNumber: filed.caseNumber,
    status: filed.status,
    escalated: false,
    escalateAfterHours: eReport.escalateAfterHours,
    createdAt: new Date().toISOString(),
  };
  await store.create(COLLECTIONS.REPORTS, report);
  return present(report);
}

/**
 * A patient's own reports, newest first. Deliberately does NOT decrypt `description` — the list
 * only needs to get you to a case number, and the detail view (getByCase) is where the narrative
 * belongs. Keeps N encrypted PHI blobs from being decrypted just to render a list.
 */
async function listForPatient(patientId) {
  const store = getStore();
  const mine = await store.findAll(COLLECTIONS.REPORTS, (r) => r.patientId === patientId);
  return mine
    .map(({ id, caseNumber, category, status, escalated, createdAt }) => ({ id, caseNumber, category, status, escalated, createdAt }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getByCase(caseNumber, requesterId) {
  const store = getStore();
  const report = await store.findOne(COLLECTIONS.REPORTS, (r) => r.caseNumber === caseNumber);
  // Case numbers are guessable (EGM-YYYY-######); scope to the owner. 404 (not 403) hides existence.
  if (!report || (requesterId && report.patientId !== requesterId)) throw notFound('Case not found');
  // No upstream status read-back: eReport's report lookup needs a per-complainant, OTP-minted,
  // time-limited report_view_token that a server-side integration cannot hold on a patient's
  // behalf (see integrations/eReport.js). `status` here is eGovMed's own state — 'open' until our
  // escalation sweep flips it to 'escalated' — and the UI says so rather than implying it mirrors
  // the government's queue.
  return present(report);
}

/** Auto-escalate any open case past its time threshold. Call from a cron / scheduled function. */
async function escalateStale() {
  const store = getStore();
  const open = await store.findAll(COLLECTIONS.REPORTS, (r) => r.status === 'open' && !r.escalated);
  const now = Date.now();
  const escalated = [];
  for (const r of open) {
    const ageHours = (now - new Date(r.createdAt).getTime()) / 36e5;
    if (ageHours >= r.escalateAfterHours) {
      escalated.push(await store.update(COLLECTIONS.REPORTS, r.id, { escalated: true, status: 'escalated' }));
    }
  }
  return escalated;
}

/** Mine recurring issue categories → feedback signal to retrain/adjust triage. */
async function recurringErrors() {
  const store = getStore();
  const all = await store.findAll(COLLECTIONS.REPORTS);
  // Object.create(null) — `category` is patient-supplied free text (jsonComplexity only blocks
  // unsafe object KEYS, not values). A category of "__proto__" against a plain {} object literal
  // would resolve to Object.prototype instead of creating an own property, silently dropping that
  // category's count from the analytics.
  const counts = Object.create(null);
  for (const r of all) counts[r.category] = (counts[r.category] || 0) + 1;
  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

function present(report) {
  if (report?.encryptedVersion === 1 && report.encrypted) {
    const { encrypted, encryptedVersion, ...rest } = report;
    return { ...rest, ...decryptJson(encrypted) };
  }
  return report;
}

module.exports = { fileReport, listForPatient, getByCase, escalateStale, recurringErrors };
