'use strict';
const { Router } = require('express');
const { z } = require('zod');
const { rateLimit, requireAuth, requireAdmin, validate, asyncHandler } = require('../middleware');
const triageService = require('../services/triageService');
const { SPECIALTIES } = require('../integrations/egovAi');

const router = Router();
const idParams = z.object({ id: z.string().regex(/^tri_[A-Za-z0-9_-]{1,100}$/) }).strict();
const adminLimit = rateLimit({ scope: 'admin', max: 10, windowMs: 15 * 60_000, key: (req) => req.ip });

// POST /triage  { text, language? }  → { specialty, urgency, redFlags, ... }
router.post('/', requireAuth,
  rateLimit({ scope: 'triage', max: 10, windowMs: 60_000 }),
  validate(z.object({
    text: z.string().trim().min(2).max(4000),
    language: z.enum(['auto', 'en', 'tl', 'taglish']).optional(),
  }).strict()),
  asyncHandler(async (req, res) => {
    const result = await triageService.runTriage({
      patientId: req.user.sub, text: req.body.text, language: req.body.language,
    });
    res.status(201).json(result);
  }));

// GET /triage → the patient's triage history
router.get('/', requireAuth,
  rateLimit({ scope: 'triage-list', max: 60, windowMs: 60_000 }),
  asyncHandler(async (req, res) => {
    res.json(await triageService.listForPatient(req.user.sub));
  }));

// POST /triage/:id/confirm  { confirmedSpecialty?, note? }  → CLINICIAN-ONLY nurse confirmation.
// Decision-support integrity: a nurse confirms every result; patients must NOT self-confirm.
// requireAdmin runs FIRST so an unauthenticated caller cannot drain the shared 'admin' rate-limit
// bucket and block the nurse-confirmation route for a real clinician.
router.post('/:id/confirm', requireAdmin, adminLimit,
  validate(idParams, 'params'),
  validate(z.object({ confirmedSpecialty: z.enum(SPECIALTIES).optional(), note: z.string().max(1000).optional() }).strict()),
  asyncHandler(async (req, res) => {
    res.json(await triageService.confirmByNurse(req.params.id, req.body));
  }));

module.exports = router;
