'use strict';
const { getStore, COLLECTIONS } = require('../store');
const { randomId } = require('../lib/crypto');
const { env } = require('../config/env');

/** Append a PHI-access audit event without recording clinical content or credentials. */
async function log({ actorId, patientId, action, resourceType, resourceId = null, requestMeta = {} }) {
  return getStore().create(COLLECTIONS.AUDIT_LOGS, {
    id: randomId('aud_'),
    actorId,
    patientId,
    action,
    resourceType,
    resourceId,
    ip: requestMeta.ip || null,
    userAgent: String(requestMeta.userAgent || '').slice(0, 500) || null,
    createdAt: new Date().toISOString(),
  });
}

/** Evict audit entries older than env.auditLogRetentionDays. ADMIN/cron only, mirrors reportService.escalateStale. */
async function sweepExpired() {
  const store = getStore();
  const cutoff = Date.now() - env.auditLogRetentionDays * 24 * 60 * 60 * 1000;
  const stale = await store.findAll(COLLECTIONS.AUDIT_LOGS, (a) => new Date(a.createdAt).getTime() < cutoff);
  await Promise.all(stale.map((a) => store.remove(COLLECTIONS.AUDIT_LOGS, a.id)));
  return { removed: stale.length, retentionDays: env.auditLogRetentionDays };
}

module.exports = { log, sweepExpired };
