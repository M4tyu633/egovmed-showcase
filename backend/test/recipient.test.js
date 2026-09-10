'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const DEFAULT = '+639000000001';
const SANDBOX = '+639090000001';
const TYPED = '+639171234567';

// env.js snapshots process.env at require time, and NOTIFY_DEFAULT_PHONE being set vs unset is
// the whole subject here, so each case loads its own copy of the module graph instead of trying
// to mutate a frozen config.
function load(defaultPhone) {
  const before = process.env.NOTIFY_DEFAULT_PHONE;
  if (defaultPhone) process.env.NOTIFY_DEFAULT_PHONE = defaultPhone;
  else delete process.env.NOTIFY_DEFAULT_PHONE;
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/lib/recipient')];
  const mod = require('../src/lib/recipient');
  if (before === undefined) delete process.env.NOTIFY_DEFAULT_PHONE;
  else process.env.NOTIFY_DEFAULT_PHONE = before;
  return mod;
}

test('notification recipient, with a demo default configured', async (t) => {
  const { recipientFor, smsRecipientFor } = load(DEFAULT);

  await t.test('a number the patient typed in Account beats the demo default', () => {
    const r = recipientFor({ phone: TYPED, manuallyOverriddenFields: ['phone'] });
    assert.deepEqual(r, { to: TYPED, channel: 'sms', source: 'patient' });
  });

  await t.test('the demo default beats an SSO-supplied sandbox number', () => {
    // The case the default exists for: nothing can receive SMS on +63909000000N, so preferring
    // it means no notification is ever observed on the demo deployment.
    assert.deepEqual(recipientFor({ phone: SANDBOX }), { to: DEFAULT, channel: 'sms', source: 'notify_default' });
  });

  await t.test('an override list without "phone" does not count as typed', () => {
    assert.equal(recipientFor({ phone: SANDBOX, manuallyOverriddenFields: ['email'] }).to, DEFAULT);
  });

  await t.test('"phone" overridden but no phone stored falls through rather than resolving to nothing', () => {
    assert.equal(recipientFor({ manuallyOverriddenFields: ['phone'], email: 'a@b.ph' }).to, DEFAULT);
  });

  await t.test('smsRecipientFor keeps a typed number', () => {
    assert.equal(smsRecipientFor({ phone: TYPED, manuallyOverriddenFields: ['phone'] }).to, TYPED);
  });
});

test('notification recipient, with no demo default (the production shape)', async (t) => {
  const { recipientFor, smsRecipientFor } = load(null);

  await t.test('falls back to exactly the pre-existing behaviour: phone, then email', () => {
    assert.deepEqual(recipientFor({ phone: SANDBOX }), { to: SANDBOX, channel: 'sms', source: 'sso' });
    assert.deepEqual(recipientFor({ email: 'a@b.ph' }), { to: 'a@b.ph', channel: 'email', source: 'email' });
  });

  await t.test('a patient with no contact resolves to nothing rather than throwing', () => {
    // Callers branch on a falsy `to` to record a skipped notification. If this threw, a patient
    // with no contact details on file could not book an appointment at all.
    assert.deepEqual(recipientFor({}), { to: null, channel: null, source: 'none' });
    assert.equal(recipientFor(null).to, null);
  });

  await t.test('smsRecipientFor refuses to hand back an email address', () => {
    // OTP delivery and eReport's complainant contact are SMS-only. An email in either slot is not
    // a degraded result, it is a value the upstream rejects.
    assert.equal(recipientFor({ email: 'a@b.ph' }).channel, 'email');
    assert.deepEqual(smsRecipientFor({ email: 'a@b.ph' }), { to: null, channel: null, source: 'none' });
  });
});
