'use strict';
const { Router } = require('express');
const { z } = require('zod');
const { rateLimit, requireAuth, validate, asyncHandler } = require('../middleware');
const { getStore, COLLECTIONS } = require('../store');
const { notFound, badRequest } = require('../lib/errors');
const { env } = require('../config/env');
const { publicPatient } = require('../lib/presenters');
const { SUPPORTED_BENEFIT_KEYS } = require('../services/paymentService');

const router = Router();

// GET /patients/me → the authenticated patient's profile
router.get('/me', requireAuth,
  rateLimit({ scope: 'patients-me', max: 60, windowMs: 60_000 }),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patient = await store.findById(COLLECTIONS.PATIENTS, req.user.sub);
    if (!patient) throw notFound('Patient not found');
    res.json(publicPatient(patient));
  }));

// PATCH /patients/me → let the citizen correct their own contact fields.
//
// Motivation: eGovPH SSO is the source of truth for identity, but the `mobile` field on the
// SSO profile may be missing or stale. Without a user-editable phone, eMessage in live mode
// would silently fail to deliver appointment confirmations to anyone whose SSO record lacks
// a number. Same rationale for email.
//
// Only contact fields are editable here. Names / DOB / sex / nationality all come from
// PhilSys via SSO and are load-bearing for identity matching — those must not be user-editable.
// Benefits have their own PATCH route below.
//
// Per-field provenance: a field the patient edits here goes into manuallyOverriddenFields, and
// authService.upsertAndIssue skips overwriting anything in that set on later SSO logins — a
// manual fix beats a stale/wrong SSO value from then on, not just the one-time "SSO omitted it"
// case this endpoint originally handled.
const updateLimit = rateLimit({ scope: 'patients-update', max: 20, windowMs: 10 * 60_000 });
// E.164 Philippine mobile: +63 + 10 digits. Stored canonical so integration adapters don't
// each guess a format; eReport's fileReport already strips the leading + at send time.
const PH_MOBILE = /^\+63\d{10}$/;
// Demographics are editable ONLY while the patient is unverified. Rationale: eVerify matches
// name + birthDate + face against PhilSys, so a self-asserted name cannot produce a false pass —
// it just makes the query fail. Once identityVerified is true those values have been confirmed
// against PhilSys and must not be rewritten, or the verified badge would outlive its evidence.
// The lock is enforced in the handler, not the schema, because it depends on stored state.
const NAME = z.string().trim().min(1).max(100);
const updateBody = z.object({
  phone: z.string().trim().regex(PH_MOBILE, 'phone must be +63 followed by 10 digits').optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  firstName: NAME.optional(),
  lastName: NAME.optional(),
  middleName: z.string().trim().max(100).optional(),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate must be YYYY-MM-DD').optional(),
}).strict().refine((o) => Object.keys(o).length > 0, {
  message: 'At least one editable field must be provided',
});
const DEMOGRAPHIC_FIELDS = ['firstName', 'lastName', 'middleName', 'birthDate'];
router.patch('/me', requireAuth, updateLimit,
  validate(updateBody),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patient = await store.findById(COLLECTIONS.PATIENTS, req.user.sub);
    if (!patient) throw notFound('Patient not found');
    const patch = { updatedAt: new Date().toISOString() };
    const overridden = new Set(patient.manuallyOverriddenFields || []);
    if (req.body.phone !== undefined) { patch.phone = req.body.phone; overridden.add('phone'); }
    if (req.body.email !== undefined) { patch.email = req.body.email; overridden.add('email'); }
    const demographics = DEMOGRAPHIC_FIELDS.filter((f) => req.body[f] !== undefined);
    // Same rule as publicPatient.demographicsLocked: only a live eVerify pass locks these.
    if (demographics.length && env.everify.mode === 'live' && patient.identityVerified) {
      throw badRequest('Verified identity details cannot be changed', demographics.map((f) => ({ path: f, message: 'locked after identity verification' })));
    }
    for (const f of demographics) { patch[f] = req.body[f]; overridden.add(f); }
    patch.manuallyOverriddenFields = [...overridden];
    const updated = await store.update(COLLECTIONS.PATIENTS, req.user.sub, patch);
    res.json(publicPatient(updated));
  }));

// PATCH /patients/me/benefits/:key → activate one of the benefit programs the eGovPay benefit
// engine actually knows how to compute against a bill (see paymentService.BENEFIT_RULES).
// SUPPORTED_BENEFIT_KEYS is derived straight from BENEFIT_RULES so the two can't drift —
// anything not in BENEFIT_RULES stays a frontend-only "coming soon" entry rather than silently
// flipping a flag the payment math never reads.
const benefitLimit = rateLimit({ scope: 'benefits-activate', max: 20, windowMs: 10 * 60_000 });
router.patch('/me/benefits/:key', requireAuth, benefitLimit, asyncHandler(async (req, res) => {
  const { key } = req.params;
  // Static message + typed details field — never reflect the raw URL param into the response
  // message string. errorHandler surfaces details to clients but the message text stays constant,
  // so a caller passing "%3Cscript%3E" cannot see their input echoed back.
  if (!SUPPORTED_BENEFIT_KEYS.includes(key)) {
    throw badRequest('Unsupported benefit', [{ path: 'key', message: `must be one of: ${SUPPORTED_BENEFIT_KEYS.join(', ')}` }]);
  }
  const store = getStore();
  const patient = await store.findById(COLLECTIONS.PATIENTS, req.user.sub);
  if (!patient) throw notFound('Patient not found');
  const benefits = { ...(patient.benefits || {}), [key]: { ...(patient.benefits?.[key] || {}), active: true } };
  const updated = await store.update(COLLECTIONS.PATIENTS, req.user.sub, { benefits });
  res.json(publicPatient(updated));
}));

// DELETE /patients/me/benefits/:key → deactivate a previously-added benefit program. Same
// SUPPORTED_BENEFIT_KEYS guard as activation; shares the activate rate-limit bucket since it's
// the same low-frequency "editing my benefits list" action from the patient's point of view.
router.delete('/me/benefits/:key', requireAuth, benefitLimit, asyncHandler(async (req, res) => {
  const { key } = req.params;
  if (!SUPPORTED_BENEFIT_KEYS.includes(key)) {
    throw badRequest('Unsupported benefit', [{ path: 'key', message: `must be one of: ${SUPPORTED_BENEFIT_KEYS.join(', ')}` }]);
  }
  const store = getStore();
  const patient = await store.findById(COLLECTIONS.PATIENTS, req.user.sub);
  if (!patient) throw notFound('Patient not found');
  const benefits = { ...(patient.benefits || {}) };
  delete benefits[key];
  const updated = await store.update(COLLECTIONS.PATIENTS, req.user.sub, { benefits });
  res.json(publicPatient(updated));
}));

module.exports = router;
