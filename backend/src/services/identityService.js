'use strict';
const identity = require('../integrations/identity');
const { getStore, COLLECTIONS } = require('../store');
const { randomId } = require('../lib/crypto');
const { notFound, badRequest } = require('../lib/errors');
const { isEgovSandboxPatient } = require('../lib/egovSandbox');

async function startLiveness(patientId) {
  const store = getStore();
  const session = await identity.createLivenessSession();
  await store.create(COLLECTIONS.LIVENESS, {
    id: session.sessionId, patientId, status: 'created', provider: session.provider, createdAt: new Date().toISOString(),
  });
  return session;
}

/**
 * Register a liveness session captured client-side by the eVerify Face Liveness Web SDK
 * (window.eKYC().start({ pubKey }) → result.session_id). This is a DIFFERENT provider than our
 * own Face Liveness hosted API — the SDK already ran and completed the capture in-browser before
 * this call, so there is no separate result to fetch later. verifyIdentity() must not call
 * identity.getLivenessResult() for these sessions (that endpoint belongs to the other provider
 * and does not recognize eVerify SDK session IDs).
 */
async function registerEverifySdkLiveness(patientId, sessionId) {
  const store = getStore();
  // store.create() overwrites unconditionally — without this guard, re-registering an
  // already-claimed/consumed session_id would silently reset it to 'created' and reopen a
  // single-use liveness proof for replay.
  const existing = await store.findById(COLLECTIONS.LIVENESS, sessionId);
  if (existing) throw badRequest('This liveness session was already registered');
  await store.create(COLLECTIONS.LIVENESS, {
    id: sessionId, patientId, status: 'created', provider: 'everify-sdk', createdAt: new Date().toISOString(),
  });
  return { sessionId, provider: 'everify-sdk' };
}

const LIVENESS_MAX_AGE_MS = 10 * 60 * 1000; // a captured liveness session is valid for 10 minutes

/** Verify PhilSys identity (with consent + a fresh, single-use liveness session) and flip patient.identityVerified. */
async function verifyIdentity({ patientId, consent, livenessSessionId, requestMeta = {} }) {
  const store = getStore();
  const patient = await store.findById(COLLECTIONS.PATIENTS, patientId);
  if (!patient) throw notFound('Patient not found');
  if (!consent) throw badRequest('Consent is required to verify identity');

  // Face-liveness is a REQUIRED, patient-bound, single-use, time-limited step-up (anti-abuse).
  if (!livenessSessionId) throw badRequest('A face-liveness session is required');
  const livenessSession = await store.findById(COLLECTIONS.LIVENESS, livenessSessionId);
  if (!livenessSession || livenessSession.patientId !== patientId) throw badRequest('Invalid or mismatched liveness session');
  if (livenessSession.status !== 'created') throw badRequest('Liveness session already used — please re-capture');
  if (Date.now() - new Date(livenessSession.createdAt).getTime() > LIVENESS_MAX_AGE_MS) {
    await store.update(COLLECTIONS.LIVENESS, livenessSessionId, { status: 'expired' });
    throw badRequest('Liveness session expired — please re-capture');
  }

  // Atomically claim the capture before any upstream calls so concurrent replays cannot both pass.
  const claimed = await store.claimStatus(COLLECTIONS.LIVENESS, livenessSessionId, 'created', {
    status: 'verifying', claimedAt: new Date().toISOString(),
  });
  if (!claimed) throw badRequest('Liveness session already used — please re-capture');

  // eVerify SDK sessions already completed their liveness capture client-side (the frontend only
  // calls us after the SDK resolves with status "COMPLETED") — there is no separate result to
  // fetch, and identity.getLivenessResult() would 404/mismatch against the wrong provider's API.
  const liveness = livenessSession.provider === 'everify-sdk'
    ? { sessionId: livenessSessionId, live: true, confidence: null, provider: 'everify-sdk' }
    : await identity.getLivenessResult(livenessSessionId).catch(async (err) => {
      await store.update(COLLECTIONS.LIVENESS, livenessSessionId, { status: 'failed' });
      throw err;
    });
  // getLivenessResult already enforces "SUCCEEDED" + confidence >= threshold in live mode.
  if (!liveness.live) {
    await store.update(COLLECTIONS.LIVENESS, livenessSessionId, { status: 'failed' });
    throw badRequest('Face-liveness check failed');
  }
  // Persist an auditable consent receipt (Data Privacy Act 2012).
  const consentRecord = {
    id: randomId('con_'),
    patientId,
    purpose: 'identity_verification',
    granted: true,
    grantedAt: new Date().toISOString(),
    livenessSessionId,
    context: { userAgent: requestMeta.userAgent || null, ip: requestMeta.ip || null },
  };
  await store.create(COLLECTIONS.CONSENTS, consentRecord);

  // eGovPH's five widget test accounts are fictional personas. A real tester can prove that a
  // live person is present, but can never match that face against the fake persona's PhilSys
  // demographics: eVerify correctly returns Tier II result_grade 0 every time. For those accounts
  // only, the frontend uses the separate hosted Face Liveness service, whose result we checked
  // server-to-server above, and we record the verification honestly as an eGov sandbox result.
  // Real accounts still take the full eVerify + PhilSys path below.
  const result = isEgovSandboxPatient(patient)
    ? { verified: true, reference: null, provider: 'egov-sandbox' }
    : await identity.verifyPhilSys({
      firstName: patient.firstName,
      middleName: patient.middleName,
      lastName: patient.lastName,
      suffix: patient.suffix,
      birthDate: patient.birthDate,          // YYYY-MM-DD
      faceLivenessSessionId: livenessSessionId,
      consent,
    }).catch(async (err) => {
      await store.update(COLLECTIONS.LIVENESS, livenessSessionId, { status: 'failed' });
      throw err;
    });
  await store.update(COLLECTIONS.LIVENESS, livenessSessionId, {
    status: 'consumed', consumedAt: new Date().toISOString(),
  });

  const verification = {
    id: randomId('ver_'),
    patientId,
    verified: result.verified,
    score: result.score,
    reference: result.reference,
    // eVerify's six-char status code. Not PII (the PII-bearing fields of the response are never
    // stored), and it is the only thing that distinguishes a demographic mismatch from "no PhilSys
    // record" from a rejected liveness session — all of which otherwise present as one dead end.
    code: result.code || null,
    liveness: { confidence: liveness.confidence, provider: liveness.provider },
    livenessSessionId,
    consentId: consentRecord.id,
    provider: result.provider,
    createdAt: new Date().toISOString(),
  };
  await store.create(COLLECTIONS.VERIFICATIONS, verification);

  if (result.verified) {
    await store.update(COLLECTIONS.PATIENTS, patientId, { identityVerified: true });
  }
  // eVerify only says true/false; its meta envelope is the only hint at WHY. Surfaced so a
  // failure is actionable on screen instead of requiring server logs that retain for minutes.
  const reason = result.verified ? null
    : ((result.meta && (result.meta.message || result.meta.status || result.meta.reason)) || result.code || null);
  return { verified: result.verified, verification, consentId: consentRecord.id, reason };
}

/** Gate: throws unless the patient has completed identity verification. */
async function assertVerified(patientId) {
  const store = getStore();
  const patient = await store.findById(COLLECTIONS.PATIENTS, patientId);
  if (!patient) throw notFound('Patient not found');
  // Its own code, not a bare bad_request: the Records screen has to tell "you are not verified
  // yet" (show the verify card) apart from "the backend is having a bad day" (keep the records it
  // already has on screen), and it cannot do that by matching on an English message string.
  if (!patient.identityVerified) {
    const err = badRequest('Identity must be verified before accessing records');
    err.code = 'identity_not_verified';
    throw err;
  }
  return true;
}

module.exports = { startLiveness, registerEverifySdkLiveness, verifyIdentity, assertVerified };
