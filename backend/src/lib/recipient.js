'use strict';
const { env } = require('../config/env');

/**
 * Decides where a notification for `patient` actually goes.
 *
 * eGovPH's sandbox personas come back with numbers in the +63909000000N block. Those are fixtures,
 * not handsets: eMessage accepts the push and no phone ever rings. On a demo deployment that made
 * every SMS the app sends unobservable, which is indistinguishable from the integration being
 * broken. NOTIFY_DEFAULT_PHONE names one reachable handset to stand in for them.
 *
 * The order is the whole point:
 *
 *   1. a number the patient typed into Account       — a real person asked for this number
 *   2. NOTIFY_DEFAULT_PHONE                          — the demo handset, if one is configured
 *   3. patient.phone                                 — whatever SSO supplied
 *   4. patient.email                                 — nothing textable at all
 *
 * The default has to beat SSO, or the sandbox number wins and nothing is delivered. It must never
 * beat a number the patient typed, or a citizen who corrects their own contact details silently
 * has their messages routed to someone else's phone. `manuallyOverriddenFields` is the same
 * provenance set PATCH /patients/me writes and authService reads, so "the patient edited this" has
 * one definition across the codebase.
 *
 * With NOTIFY_DEFAULT_PHONE unset — the production default, enforced at boot — this collapses to
 * exactly the previous behaviour: patient.phone, else email.
 *
 * @returns {{to: string|null, channel: 'sms'|'email'|null, source: string}}
 */
function recipientFor(patient) {
  const p = patient || {};
  const edited = Array.isArray(p.manuallyOverriddenFields) && p.manuallyOverriddenFields.includes('phone');
  if (edited && p.phone) return { to: p.phone, channel: 'sms', source: 'patient' };
  if (env.notify.defaultPhone) return { to: env.notify.defaultPhone, channel: 'sms', source: 'notify_default' };
  if (p.phone) return { to: p.phone, channel: 'sms', source: 'sso' };
  if (p.email) return { to: p.email, channel: 'email', source: 'email' };
  return { to: null, channel: null, source: 'none' };
}

/**
 * Same resolution, SMS only. For flows where an email fallback would be wrong rather than
 * degraded: an OTP is a proof-of-control challenge against a phone, and eReport files a
 * complainant's contact number into a government queue where an email address is not a valid value.
 */
function smsRecipientFor(patient) {
  const r = recipientFor(patient);
  return r.channel === 'sms' ? r : { to: null, channel: null, source: 'none' };
}

module.exports = { recipientFor, smsRecipientFor };
