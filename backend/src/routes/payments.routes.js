'use strict';
const { Router } = require('express');
const { z } = require('zod');
const { rateLimit, requireAuth, validate, asyncHandler } = require('../middleware');
const paymentService = require('../services/paymentService');
const { getStore, COLLECTIONS } = require('../store');

const router = Router();
const idParams = z.object({ id: z.string().regex(/^bill_[A-Za-z0-9_-]{1,100}$/) }).strict();

// eGovPay's supplied docs do not define a callback signature. Acknowledge notifications,
// but never trust callback fields to mark a bill paid; the authenticated status endpoint polls eGovPay.
router.post('/callback',
  rateLimit({ scope: 'payment-callback', max: 60, windowMs: 60_000, key: (req) => req.ip }),
  (_req, res) => res.status(202).json({ accepted: true }));

// POST /payments/quote  { billAmount } → preview benefits without creating a bill
router.post('/quote', requireAuth,
  rateLimit({ scope: 'payment-quote', max: 20, windowMs: 10 * 60_000 }),
  validate(z.object({ billAmount: z.number().finite().positive().max(10_000_000) }).strict()),
  asyncHandler(async (req, res) => {
    const store = getStore();
    const patient = await store.findById(COLLECTIONS.PATIENTS, req.user.sub);
    res.json(paymentService.computeBenefits(req.body.billAmount, patient?.benefits));
  }));

// POST /payments  { billAmount, description?, channel? } → create bill + eGovPay checkout
// Tight limit: each call hits eGovPay to create a live checkout — spam would flood their
// sandbox with orphan bills and burn our partner's reputation on shared infra.
router.post('/', requireAuth,
  rateLimit({ scope: 'payment-create', max: 20, windowMs: 10 * 60_000 }),
  validate(z.object({
    billAmount: z.number().finite().positive().max(10_000_000),
    description: z.string().trim().min(1).max(500).optional(),
    channel: z.string().trim().min(1).max(50).optional(),
    appointmentId: z.string().regex(/^apt_[A-Za-z0-9_-]{1,100}$/).optional(),
  }).strict()),
  asyncHandler(async (req, res) => {
    res.status(201).json(await paymentService.createBill({ patientId: req.user.sub, ...req.body }));
  }));

// GET /payments → patient's bills
router.get('/', requireAuth,
  rateLimit({ scope: 'payment-list', max: 60, windowMs: 60_000 }),
  asyncHandler(async (req, res) => {
    res.json(await paymentService.listForPatient(req.user.sub));
  }));

// GET /payments/:id/status → refresh checkout status
router.get('/:id/status', requireAuth,
  rateLimit({ scope: 'payment-status', max: 30, windowMs: 10 * 60_000 }),
  validate(idParams, 'params'), asyncHandler(async (req, res) => {
  res.json(await paymentService.refreshStatus(req.params.id, req.user.sub));
}));

module.exports = router;
