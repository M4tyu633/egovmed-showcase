'use strict';
const { Router } = require('express');

const router = Router();

// Health + service info. Deliberately unauthenticated but minimal — store driver and integration
// mode are operational details that belong on the admin-gated /integrations/status dashboard, not
// on a route anyone can hit without a key (the security review's threat model for that dashboard
// explicitly requires no body variance that reveals whether an integration is live).
router.get('/', (_req, res) => {
  res.json({
    service: 'eGovMed backend',
    version: '0.1.0',
    status: 'ok',
    docs: '/health, /auth, /patients, /triage, /identity, /records, /appointments, /payments, /messages, /reports, /integrations',
  });
});

router.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

router.use('/auth', require('./auth.routes'));
router.use('/patients', require('./patients.routes'));
router.use('/triage', require('./triage.routes'));
router.use('/identity', require('./identity.routes'));
router.use('/records', require('./records.routes'));
router.use('/appointments', require('./appointments.routes'));
router.use('/payments', require('./payments.routes'));
router.use('/messages', require('./messages.routes'));
router.use('/reports', require('./reports.routes'));
router.use('/integrations', require('./integrations.routes'));

module.exports = router;
