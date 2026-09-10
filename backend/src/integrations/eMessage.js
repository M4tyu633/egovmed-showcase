'use strict';
const { env } = require('../config/env');
const http = require('../lib/http');
const logger = require('../lib/logger');
const { randomId } = require('../lib/crypto');

const cfg = env.eMessage;

/**
 * channel: 'sms' | 'email' | 'inapp'. The documented eMessage API covers SMS push only.
 *
 * Confirmed against portal docs (2026-07):
 *   POST /messaging/v1/sms/push  { number, message }  headers: X-EMESSAGE-Auth
 *   number: E.164 with leading `+` (e.g. "+639090000000"). SSO returns this format — no
 *          normalization needed; pass `to` through.
 *   Success: HTTP 201 { "data": { "message": "SMS was successfully created." } }
 *   Sender ID is baked into the auth token — EMESSAGE_SENDER_ID is informational only,
 *          not sent as a per-request field.
 */
async function send({ to, channel = 'sms', subject, body }) {
  if (cfg.mode === 'live' && channel === 'sms') {
    if (!cfg.authToken) throw new Error('eMessage live mode requires EMESSAGE_AUTH_TOKEN');
    let res;
    try {
      res = await http.post(`${cfg.baseUrl}/messaging/v1/sms/push`, {
        number: to, message: body,
      }, { headers: { 'X-EMESSAGE-Auth': cfg.authToken, 'Content-Type': 'application/json' } });
    } catch (err) {
      // appointmentService.book() swallows this by design (a failed SMS must never fail a
      // booking), so without a log here a live send failure is invisible — the only trace
      // would be the generic `http upstream non-2xx` line. Never log `to` (PII) or the token.
      logger.warn('eMessage live SMS push failed', { subject, reason: err.message });
      throw err;
    }
    // http client throws on non-2xx, so reaching here = 201 Created. data.message is a
    // human-readable status string, not an ID; capture for audit but the reliable success
    // signal is the HTTP status.
    const data = (res && (res.data || res)) || {};
    return { id: randomId('msg_'), status: 'sent', channel: 'sms', to, provider: 'emessage', upstreamMessage: data.message || null };
  }
  // mock (and non-SMS channels, which the documented hackathon API doesn't cover)
  if (cfg.mode === 'live' && channel !== 'sms') {
    logger.warn('eMessage live mode requested for non-SMS channel — falling back to mock (docs only cover SMS push)', { channel });
  }
  logger.info('eMessage mock send', { channel, subject });
  return { id: randomId('msg_'), status: 'sent', channel, to, provider: 'mock', body };
}

module.exports = { send };
