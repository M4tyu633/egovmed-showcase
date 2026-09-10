'use strict';
const crypto = require('crypto');
const eMessage = require('../integrations/eMessage');
const { env } = require('../config/env');
const { getStore, COLLECTIONS } = require('../store');
const { randomId, sha256Hex, timingSafeEqualStr } = require('../lib/crypto');
const { badRequest, notFound } = require('../lib/errors');
const logger = require('../lib/logger');
const { smsRecipientFor } = require('../lib/recipient');

/**
 * One-time SMS codes, shaped after the liveness session in identityService: patient-bound,
 * time-limited, single-use, and taken out of its usable state by store.claimStatus (a Redis
 * compare-and-set) before the secret is inspected, so two concurrent attempts can never both win.
 *
 * The code itself is never stored. Six digits is only 10^6 possibilities, so anyone holding a dump
 * of the store can brute-force a hash of a code this short in milliseconds — the hash is not what
 * defeats that, and nothing at this length would be. What it buys is that a LIVE code is never at
 * rest in plaintext: not in Redis, not in a snapshot pasted into a bug report, not in a log line.
 * The salt is the challenge id so a single precomputed table cannot sweep every outstanding
 * challenge at once. Guessing over the wire is bounded by MAX_ATTEMPTS plus the route limiters.
 */
const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Namespaces a challenge to the action it was minted for, so a code issued for one flow can never
// be spent on another if a second OTP-gated action is added later.
const PURPOSES = { REPORT: 'report_file' };

const hashCode = (challengeId, code) => sha256Hex(`otp:${challengeId}:${code}`);

// crypto.randomInt is CSPRNG-backed and uniform across the range; Math.random() is neither, and a
// predictable code is the same as no code at all.
const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * "•••• 0000" from the patient's real number. The screen used to render a hardcoded "•••• 4567"
 * that belonged to nobody, which is worse than showing nothing: a patient checking that the code
 * went to the right phone was reading a decoration.
 */
function maskPhone(phone) {
  const digits = String(phone == null ? '' : phone).replace(/\D/g, '');
  return digits.length < 4 ? '••••' : `•••• ${digits.slice(-4)}`;
}

// One message for every "this challenge/code is not usable" outcome. Distinguishing "no such
// challenge" from "someone else's challenge" from "wrong digits" is exactly the signal an attacker
// would use to narrow the search. Expiry and the attempt cap DO get their own message: neither
// tells an attacker anything they could not already infer from the clock, and both need a
// different action from the patient (request a new code, rather than retype this one).
const INVALID = 'That code is not valid — check the digits or request a new one';
const EXPIRED = 'That code has expired — request a new one';
const LOCKED = 'Too many incorrect attempts — request a new code';

/**
 * Mint a challenge and text the code to the patient's own number.
 * Returns { challengeId, expiresInSeconds, maskedPhone, mockCode? } — never the code in live mode.
 */
async function requestOtp({ patientId, purpose }) {
  const store = getStore();
  const patient = await store.findById(COLLECTIONS.PATIENTS, patientId);
  if (!patient) throw notFound('Patient not found');
  // Always a number ON THE RECORD, never one supplied in the request — otherwise "prove you
  // control this phone" collapses into "type any number and read your own code back". A patient
  // with nothing textable has nothing to prove control of, so the flow stops here and the client
  // sends them to Account rather than filing something unverified in their name.
  //
  // Deliberate, and weaker than it looks on a demo deployment: when NOTIFY_DEFAULT_PHONE is set,
  // an unedited SSO persona's code goes to that shared handset instead of "their" number, so the
  // challenge proves control of the demo phone rather than of the patient's. That is accepted
  // because the alternative is worse — the sandbox +63909... numbers cannot receive SMS at all, so
  // without it no code is ever delivered and report filing, which is gated on this, is
  // uncompletable end to end. A patient who sets their own number in Account is back to the real
  // guarantee (recipientFor puts an edited number ahead of the default), and the default is
  // refused at boot in a non-mock production deployment.
  const { to: otpTo } = smsRecipientFor(patient);
  if (!otpTo) {
    throw badRequest('Add your mobile number in Account first — we text a 6-digit code to confirm it is you.');
  }

  const challengeId = randomId('otp_');
  const code = newCode();

  // Send BEFORE the challenge exists: fail closed. If eMessage rejects the push there is nothing
  // to verify against, so a complaint can never be filed on the strength of a code that was never
  // delivered. eMessage.send logs its own failure reason without `to` or the auth token.
  await eMessage.send({
    to: otpTo,
    channel: 'sms',
    subject: 'eGovMed verification code',
    body: `${code} is your eGovMed code to file a report. It expires in 5 minutes. Do not share it with anyone.`,
  });

  await store.create(COLLECTIONS.OTP_CHALLENGES, {
    id: challengeId,
    patientId,
    purpose,
    codeHash: hashCode(challengeId, code),
    status: 'pending',
    attempts: 0,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  });
  // Enough to trace a support ticket, and deliberately neither the code nor the number. The
  // challenge id alone verifies nothing.
  logger.info('otp challenge issued', { purpose, challengeId });

  return {
    challengeId,
    expiresInSeconds: TTL_MS / 1000,
    // The number the code actually went to, not the one on the profile — masking the profile
    // number while texting a different handset tells the patient to check a phone that will
    // never ring.
    maskedPhone: maskPhone(otpTo),
    // In mock mode no SMS actually leaves the process, so without this the flow is uncompletable
    // offline and on staging (EMESSAGE_MODE=mock there). Gated on the adapter's own mode rather
    // than NODE_ENV: a live-credentialed deployment must never hand the code back over the API,
    // whatever else is configured.
    ...(env.eMessage.mode === 'live' ? {} : { mockCode: code }),
  };
}

/**
 * Check a submitted code and take the challenge out of play for the duration of the caller's
 * action. Throws on every failure path; on success the caller MUST finish with settleOtp().
 */
async function claimOtp({ patientId, purpose, challengeId, code }) {
  const store = getStore();
  const challenge = await store.findById(COLLECTIONS.OTP_CHALLENGES, challengeId);
  if (!challenge || challenge.patientId !== patientId || challenge.purpose !== purpose) throw badRequest(INVALID);
  if (challenge.status === 'locked') throw badRequest(LOCKED);
  if (challenge.status !== 'pending') throw badRequest(INVALID);
  if (Date.now() > new Date(challenge.expiresAt).getTime()) {
    await store.update(COLLECTIONS.OTP_CHALLENGES, challengeId, { status: 'expired' });
    throw badRequest(EXPIRED);
  }

  // The same compare-and-set the liveness flow relies on, and for the same reason: the challenge
  // leaves 'pending' before the digits are looked at, so N concurrent guesses cannot each read
  // attempts: 0 and collectively spend a single attempt, and a correct code cannot be redeemed
  // twice by two requests racing each other. The loser of the race gets INVALID and burns nothing.
  const claimed = await store.claimStatus(COLLECTIONS.OTP_CHALLENGES, challengeId, 'pending', {
    status: 'verifying', claimedAt: new Date().toISOString(),
  });
  if (!claimed) throw badRequest(INVALID);

  if (timingSafeEqualStr(hashCode(challengeId, code), claimed.codeHash)) return claimed;

  const attempts = (claimed.attempts || 0) + 1;
  const capped = attempts >= MAX_ATTEMPTS;
  // At the cap the challenge is retired, not merely refused for this attempt: leaving it 'pending'
  // would let a caller keep grinding a 10^6 search space until the TTL runs out.
  await store.update(COLLECTIONS.OTP_CHALLENGES, challengeId, {
    status: capped ? 'locked' : 'pending', attempts,
  });
  throw badRequest(capped ? LOCKED : INVALID);
}

/**
 * Retire a claimed challenge. `ok: false` is terminal too — a code presented for an action that
 * then failed downstream is spent, and the patient requests a new one. Same rule identityService
 * applies to a liveness capture whose upstream call failed: never leave a proof half-used.
 */
const settleOtp = (challengeId, ok) => getStore().update(COLLECTIONS.OTP_CHALLENGES, challengeId, {
  status: ok ? 'consumed' : 'failed', settledAt: new Date().toISOString(),
});

module.exports = { requestOtp, claimOtp, settleOtp, maskPhone, PURPOSES, TTL_MS, MAX_ATTEMPTS };
