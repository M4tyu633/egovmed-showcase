'use strict';
const { Router } = require('express');
const { z } = require('zod');
const { rateLimit, requireAuth, validate, asyncHandler } = require('../middleware');
const identityService = require('../services/identityService');

const router = Router();

// POST /identity/liveness → create a face-liveness session (frontend runs the capture)
router.post('/liveness', requireAuth,
  rateLimit({ scope: 'identity-liveness', max: 5, windowMs: 10 * 60_000 }), asyncHandler(async (req, res) => {
  res.json(await identityService.startLiveness(req.user.sub));
}));

// POST /identity/liveness/everify-sdk  { sessionId }
// Registers a session_id already captured client-side by the eVerify Face Liveness Web SDK
// (window.eKYC().start({ pubKey })) — a different provider than our own /identity/liveness above.
// The resulting session is consumed the same single-use way via POST /identity/verify.
router.post('/liveness/everify-sdk', requireAuth,
  rateLimit({ scope: 'identity-liveness', max: 5, windowMs: 10 * 60_000 }),
  validate(z.object({ sessionId: z.string().uuid() }).strict()),
  asyncHandler(async (req, res) => {
    res.json(await identityService.registerEverifySdkLiveness(req.user.sub, req.body.sessionId));
  }));

// POST /identity/verify  { philsysId?, consent, livenessSessionId }
// livenessSessionId is REQUIRED — obtain it from POST /identity/liveness first.
router.post('/verify', requireAuth,
  rateLimit({ scope: 'identity-verify', max: 5, windowMs: 10 * 60_000 }),
  validate(z.object({
    consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required' }) }),
    livenessSessionId: z.string().min(1).max(200),
  }).strict()),
  asyncHandler(async (req, res) => {
    const result = await identityService.verifyIdentity({
      patientId: req.user.sub,
      ...req.body,
      requestMeta: { userAgent: req.headers['user-agent'], ip: req.ip },
    });
    res.json(result);
  }));

module.exports = router;
