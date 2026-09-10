'use strict';
const { Router } = require('express');
const { z } = require('zod');
const { rateLimit, requireAuth, validate, asyncHandler } = require('../middleware');
const recordService = require('../services/recordService');
const identityService = require('../services/identityService');
const auditService = require('../services/auditService');

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

const router = Router();
const idParams = z.object({ id: z.string().regex(/^rec_[A-Za-z0-9_-]{1,100}$/) }).strict();

// Defense-in-depth per-user limits on the record surface. Not motivated by billing (the eGov
// APIs are free during the hackathon), but by (1) chain-nonce reliability on POST — concurrent
// writes race the signer's nonce and one fails, (2) eGov AI budget hygiene for the summary
// route, (3) not being a bad citizen on shared hackathon infra when we go live.
const readLimit = rateLimit({ scope: 'records-read', max: 60, windowMs: 60_000 });

// GET /records → patient's records (identity-gated)
router.get('/', requireAuth, readLimit, asyncHandler(async (req, res) => {
  await identityService.assertVerified(req.user.sub);
  const records = await recordService.listRecords(req.user.sub);
  await auditService.log({ actorId: req.user.sub, patientId: req.user.sub, action: 'records.list', resourceType: 'health_record', requestMeta: requestMeta(req) });
  res.json(records);
}));

// POST /records  { type, title, sourceFacility?, data?, summary? }  (identity-gated, like reads)
// Tight limit: each write signs an eGovChain transaction — concurrent creates race the signer's
// nonce and would 500. 20/10min per user is generous for a demo while capping the failure mode.
router.post('/', requireAuth,
  rateLimit({ scope: 'records-create', max: 20, windowMs: 10 * 60_000 }),
  validate(z.object({
    type: z.string().trim().min(2).max(50),
    title: z.string().trim().min(2).max(200),
    sourceFacility: z.string().trim().min(2).max(200).optional(),
    data: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
    summary: z.string().trim().max(2000).optional(),
  }).strict()),
  asyncHandler(async (req, res) => {
    await identityService.assertVerified(req.user.sub);
    const record = await recordService.createRecord({ patientId: req.user.sub, ...req.body });
    await auditService.log({ actorId: req.user.sub, patientId: req.user.sub, action: 'records.create', resourceType: 'health_record', resourceId: record.id, requestMeta: requestMeta(req) });
    res.status(201).json(record);
  }));

// GET /records/doctor-summary → AI history summary + verified labs (no repeat labs)
// This static route MUST stay above /:id routes or Express treats "doctor-summary" as an id and
// rejects it against the rec_* schema before the handler runs.
// Tighter than plain reads: this calls eGov AI once (25s timeout, real model call), so a hot loop
// here would trash the integration budget. It never fans out eGovChain RPC reads.
router.get('/doctor-summary', requireAuth,
  rateLimit({ scope: 'records-summary', max: 20, windowMs: 10 * 60_000 }),
  asyncHandler(async (req, res) => {
    await identityService.assertVerified(req.user.sub);
    const summary = await recordService.buildDoctorSummary(req.user.sub);
    await auditService.log({ actorId: req.user.sub, patientId: req.user.sub, action: 'records.doctor_summary', resourceType: 'health_record', requestMeta: requestMeta(req) });
    res.json(summary);
  }));

// GET /records/:id/verify → "Lab result verified from another hospital ✓" (ownership-scoped, identity-gated like every other record route)
router.get('/:id/verify', requireAuth, readLimit, validate(idParams, 'params'), asyncHandler(async (req, res) => {
  await identityService.assertVerified(req.user.sub);
  const result = await recordService.verifyRecord(req.params.id, req.user.sub);
  await auditService.log({ actorId: req.user.sub, patientId: req.user.sub, action: 'records.verify', resourceType: 'health_record', resourceId: req.params.id, requestMeta: requestMeta(req) });
  res.json(result);
}));

// GET /records/:id → single record incl. decrypted PHI values (ownership-scoped, 404 on mismatch)
router.get('/:id', requireAuth, readLimit, validate(idParams, 'params'), asyncHandler(async (req, res) => {
  await identityService.assertVerified(req.user.sub);
  const record = await recordService.getRecord(req.params.id, { includeData: true, patientId: req.user.sub });
  await auditService.log({ actorId: req.user.sub, patientId: req.user.sub, action: 'records.read', resourceType: 'health_record', resourceId: req.params.id, requestMeta: requestMeta(req) });
  res.json(record);
}));

module.exports = router;
