'use strict';
const { Router } = require('express');
const { z } = require('zod');
const { rateLimit, requireAuth, validate, asyncHandler } = require('../middleware');
const appointmentService = require('../services/appointmentService');

const router = Router();
const idParams = z.object({ id: z.string().regex(/^apt_[A-Za-z0-9_-]{1,100}$/) }).strict();

// POST /appointments  { specialty, hospital?, scheduledFor?, triageId? }
// Books an appointment AND fires an eMessage confirmation — capped per user so a hot loop
// doesn't spam SMS credits on shared hackathon infra.
router.post('/', requireAuth,
  rateLimit({ scope: 'appointment-create', max: 20, windowMs: 10 * 60_000 }),
  validate(z.object({
    specialty: z.string().trim().min(2).max(100),
    hospital: z.string().trim().min(2).max(200).optional(),
    scheduledFor: z.string().datetime({ offset: true }).optional(),
    triageId: z.string().max(100).optional(),
  }).strict()),
  asyncHandler(async (req, res) => {
    res.status(201).json(await appointmentService.book({ patientId: req.user.sub, ...req.body }));
  }));

// GET /appointments → patient's appointments
router.get('/', requireAuth,
  rateLimit({ scope: 'appointment-list', max: 60, windowMs: 60_000 }),
  asyncHandler(async (req, res) => {
    res.json(await appointmentService.listForPatient(req.user.sub));
  }));

// POST /appointments/:id/remind → send an eMessage reminder
router.post('/:id/remind', requireAuth,
  rateLimit({ scope: 'appointment-reminder', max: 5, windowMs: 10 * 60_000 }),
  validate(idParams, 'params'), asyncHandler(async (req, res) => {
  res.json(await appointmentService.sendReminder(req.params.id, req.user.sub));
}));

// PATCH /appointments/:id  { status }
router.patch('/:id', requireAuth,
  rateLimit({ scope: 'appointment-update', max: 20, windowMs: 10 * 60_000 }),
  validate(idParams, 'params'),
  validate(z.object({ status: z.literal('cancelled') }).strict()),
  asyncHandler(async (req, res) => {
    res.json(await appointmentService.updateStatus(req.params.id, req.body.status, req.user.sub));
  }));

module.exports = router;
