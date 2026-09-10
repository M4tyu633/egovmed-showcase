'use strict';
const { Router } = require('express');
const { rateLimit, requireAdmin, asyncHandler } = require('../middleware');
const { env } = require('../config/env');
const auditService = require('../services/auditService');

const router = Router();
const adminLimit = rateLimit({ scope: 'admin', max: 10, windowMs: 15 * 60_000, key: (req) => req.ip });

// Emit URL origin only — drops userinfo and path. rpcUrl in particular is a user-supplied
// connection string that can carry credentials (Infura/Alchemy style or HTTP basic auth to
// a private Besu node), and this endpoint is the very dashboard the rollout will screenshot.
const safeOrigin = (u) => { try { return new URL(u).origin; } catch { return null; } };

// Shared predicate — same definition used by warnIfMisconfigured for eGovPay boot readiness,
// so a "live+credentialed by boot guard but hasCredentials=false in dashboard" split can't happen.
const egovPayCredentialed = () => !!(env.egovPay.token && env.egovPay.settlementTemplateUuid);

// Admin-only, per-endpoint rate limit — NOT the shared 'admin' bucket used by /reports admin
// routes. Sharing that bucket would let unauth spam against /status lock a real operator out
// of the stale-report escalation sweep. Own scope, higher ceiling (read-only dashboard).
router.get('/status',
  requireAdmin, // authenticate FIRST so unauth callers cannot consume the budget below
  rateLimit({ scope: 'integrations-status', max: 30, windowMs: 15 * 60_000, key: (req) => req.ip }),
  asyncHandler(async (_req, res) => {
    res.json({
      globalMode: env.globalMode,
      allowMockInProduction: env.allowMockInProduction,
      integrations: {
        egovph: {
          mode: env.egovph.mode,
          baseUrl: safeOrigin(env.egovph.baseUrl),
          hasCredentials: !!(env.egovph.partnerCode && env.egovph.partnerSecret),
          launchUrlConfigured: !!env.egovph.launchUrl,
        },
        egovAi: {
          mode: env.egovAi.mode,
          baseUrl: safeOrigin(env.egovAi.baseUrl),
          hasCredentials: !!env.egovAi.accessCode,
        },
        everify: {
          mode: env.everify.mode,
          baseUrl: safeOrigin(env.everify.baseUrl),
          hasCredentials: !!(env.everify.clientId && env.everify.clientSecret),
          pubKeyConfigured: !!env.everify.pubKey,
        },
        faceLiveness: {
          mode: env.faceLiveness.mode,
          baseUrl: safeOrigin(env.faceLiveness.baseUrl),
          hasCredentials: !!env.faceLiveness.apiKey,
        },
        eMessage: {
          mode: env.eMessage.mode,
          baseUrl: safeOrigin(env.eMessage.baseUrl),
          hasCredentials: !!env.eMessage.authToken,
        },
        egovChain: {
          mode: env.egovChain.mode,
          baseUrl: safeOrigin(env.egovChain.rpcUrl),
          hasCredentials: !!(env.egovChain.rpcUrl && env.egovChain.privateKey),
          strategy: 'calldata',
        },
        egovPay: {
          mode: env.egovPay.mode,
          baseUrl: safeOrigin(env.egovPay.baseUrl),
          hasCredentials: egovPayCredentialed(),
        },
        eReport: {
          mode: env.eReport.mode,
          baseUrl: safeOrigin(env.eReport.baseUrl),
          hasCredentials: !!env.eReport.accessCode,
          locationConfigured: !!(env.eReport.location.regionCode
            && env.eReport.location.provinceCode
            && env.eReport.location.municipalityCode
            && env.eReport.location.barangayCode),
        },
      },
    });
  }));

// POST /integrations/audit/sweep → evict PHI-access audit entries past env.auditLogRetentionDays.
// ADMIN/cron only (x-admin-key), same shared 'admin' bucket as /reports/escalate-stale.
router.post('/audit/sweep', adminLimit, requireAdmin, asyncHandler(async (_req, res) => {
  res.json(await auditService.sweepExpired());
}));

module.exports = router;
