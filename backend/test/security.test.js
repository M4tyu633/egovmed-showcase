'use strict';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef0123456789abcdef';
process.env.PHI_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.STORE_DRIVER = 'memory';
process.env.INTEGRATION_MODE = 'mock';
// Prevent a developer's per-service live setting from overriding the test environment.
for (const service of ['EGOVPH', 'EGOV_AI', 'EVERIFY', 'FACE_LIVENESS', 'EMESSAGE', 'EGOVCHAIN', 'EGOVPAY', 'EREPORT']) {
  process.env[`${service}_MODE`] = 'mock';
}
process.env.APP_URL = 'http://localhost:3000';
process.env.ADMIN_KEY = 'test-only-admin-key-0123456789abcdef0123456789abcdef';

// Sentinel credential values — the /integrations/status leak test asserts these
// are NOT present in the response body under any input. Previously the test
// grepped for credential FIELD NAMES ("secret", "apiKey"), which the handler
// never emits by construction, so the assertion was unfalsifiable. Now we grep
// for the actual values, which would appear if any field were accidentally
// serialized. Includes a URL with embedded userinfo/api-key to regression-cover
// the rpcUrl-carries-credentials finding.
const CREDENTIAL_SENTINELS = {
  EGOVPH_PARTNER_CODE: 'SENTINEL-egovph-partner-code',
  EGOVPH_PARTNER_SECRET: 'SENTINEL-egovph-partner-secret',
  EGOV_AI_ACCESS_CODE: 'SENTINEL-egov-ai-access-code',
  EVERIFY_CLIENT_ID: 'SENTINEL-everify-client-id',
  EVERIFY_CLIENT_SECRET: 'SENTINEL-everify-client-secret',
  EVERIFY_PUBKEY: 'SENTINEL-everify-pubkey',
  FACE_LIVENESS_API_KEY: 'SENTINEL-face-liveness-api-key',
  EMESSAGE_AUTH_TOKEN: 'SENTINEL-emessage-auth-token',
  EGOVCHAIN_CONTRACT_ADDRESS: 'SENTINEL-egovchain-contract',
  // Deliberately-invalid hex so warnIfMisconfigured's live-mode format check would
  // catch it if the mode were flipped — but INTEGRATION_MODE=mock here, so it doesn't.
  EGOVCHAIN_PRIVATE_KEY: 'SENTINEL-egovchain-private-key',
  // URL carries userinfo and an api-key path segment — safeOrigin() in the status
  // route must strip both. If the whole string leaks, s3cret_pw or api_key_ABC will
  // appear in the response body and the sentinel assertion below will fail.
  EGOVCHAIN_RPC_URL: 'https://user:s3cret_pw@rpc.example.invalid/v3/api_key_ABC',
  EGOVPAY_TOKEN: 'SENTINEL-egovpay-token',
  EGOVPAY_SETTLEMENT_TEMPLATE_UUID: 'SENTINEL-egovpay-settlement-uuid',
  EREPORT_ACCESS_CODE: 'SENTINEL-ereport-access-code',
  EREPORT_VIEW_TOKEN: 'SENTINEL-ereport-view-token',
};
Object.assign(process.env, CREDENTIAL_SENTINELS);

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const app = require('../src/app');
const { sign } = require('../src/lib/jwt');
const { getStore, COLLECTIONS, seedDemoData } = require('../src/store');
const { normalizePaymentStatus, apiTokenForHeader } = require('../src/integrations/egovPay');
const http = require('../src/lib/http');
const reportService = require('../src/services/reportService');
const { isEgovSandboxPhone, isEgovSandboxPatient } = require('../src/lib/egovSandbox');

let server;
let baseUrl;
const store = getStore();

const request = (path, { token, method = 'GET', body, rawBody, headers = {} } = {}) =>
  fetch(baseUrl + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
  });

async function json(response) {
  const value = await response.json();
  return { response, value };
}

async function resetWithPatients() {
  await store.reset();
  const seeded = await seedDemoData();
  await store.create(COLLECTIONS.PATIENTS, {
    id: 'pat_attacker', egovSub: 'attacker-sub', firstName: 'Mallory', lastName: 'Test',
    identityVerified: true, benefits: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  return seeded.id;
}

/**
 * Filing a report is gated on a code texted to the patient's own number, so every caller has to
 * mint one first. EMESSAGE_MODE follows INTEGRATION_MODE=mock here, and mock mode returns the code
 * it "texted" — the only reason this flow is exercisable offline (see otpService.requestOtp).
 */
async function fileReportWithOtp(token, body) {
  const otp = await json(await request('/reports/otp', { token, method: 'POST' }));
  assert.equal(otp.response.status, 200, JSON.stringify(otp.value));
  return json(await request('/reports', {
    token, method: 'POST', body: { ...body, challengeId: otp.value.challengeId, code: otp.value.mockCode },
  }));
}

test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

test('security regression suite', async (t) => {
  await t.test('only the five official eGovPH fixture numbers are recognized as sandbox accounts', () => {
    assert.equal(isEgovSandboxPhone('+639090000001'), true);
    assert.equal(isEgovSandboxPhone('639090000005'), true);
    assert.equal(isEgovSandboxPhone('+639090000006'), false);
    assert.equal(isEgovSandboxPhone('+639171234567'), false);
    assert.equal(isEgovSandboxPatient({ phone: '+639090000001' }), true, 'legacy SSO row migrates without a re-login');
    assert.equal(isEgovSandboxPatient({ phone: '+639090000001', manuallyOverriddenFields: ['phone'] }), false);
    assert.equal(isEgovSandboxPatient({ phone: '+639090000001', egovSandboxAccount: false }), false);
  });

  await t.test('eGovPay sandbox payment_status values are normalized', () => {
    assert.equal(normalizePaymentStatus({ payment_status: 'PAID' }), 'paid');
    assert.equal(normalizePaymentStatus({ status: 'SUCCESSFUL' }), 'successful');
    assert.equal(normalizePaymentStatus({ state: 'completed' }), 'completed');
    assert.equal(normalizePaymentStatus({}), 'pending');
    assert.equal(apiTokenForHeader('bare-portal-key'), 'test_bare-portal-key');
    assert.equal(apiTokenForHeader('test_already-prefixed'), 'test_already-prefixed');
    assert.equal(apiTokenForHeader('live_explicit-live-key'), 'live_explicit-live-key');
  });

  await t.test('mock eGovPay can be forced to simulate a failed payment', () => {
    // Regression: getStatus() used to hardcode 'paid' unconditionally in mock mode, so a bill
    // could never actually fail in local/demo testing (no eGov credentials required). Running in
    // a fresh process because egovPay.js reads EGOVPAY_MOCK_OUTCOME once at module load.
    const cwd = path.join(__dirname, '..');
    const script = `
      const egovPay = require('./src/integrations/egovPay');
      (async () => {
        const checkout = await egovPay.createCheckout({ amount: 300, description: 'test' });
        const status = await egovPay.getStatus(checkout.reference);
        if (checkout.status !== 'failed' || status.status !== 'failed' || status.paidAt !== null) {
          console.error('unexpected mock outcome: ' + JSON.stringify({ checkout, status }));
          process.exit(1);
        }
      })();
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd, encoding: 'utf8', env: { ...process.env, EGOVPAY_MOCK_OUTCOME: 'failed' },
    });
    assert.equal(result.status, 0, result.stderr);

    // An unrecognized/unset override still defaults to the original always-succeeds demo behavior.
    const defaultResult = spawnSync(process.execPath, ['-e', `
      const egovPay = require('./src/integrations/egovPay');
      egovPay.getStatus('pay_test').then((s) => { if (s.status !== 'paid') { process.exit(1); } });
    `], { cwd, encoding: 'utf8', env: { ...process.env, EGOVPAY_MOCK_OUTCOME: '' } });
    assert.equal(defaultResult.status, 0, defaultResult.stderr);
  });

  await t.test('security headers are present and framework disclosure is disabled', async () => {
    await resetWithPatients();
    const response = await request('/health');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  await t.test('login is bounded, strips sensitive patient fields, and query tokens are rejected', async () => {
    await resetWithPatients();
    const login = await json(await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo' } }));
    assert.equal(login.response.status, 200);
    assert.ok(login.value.token);
    assert.equal(login.value.patient.egovSub, undefined);
    assert.equal(login.value.patient.philsysId, undefined);
    assert.equal(login.value.patient.benefits.philhealth, true);

    const queryToken = await request(`/patients/me?token=${encodeURIComponent(login.value.token)}`);
    assert.equal(queryToken.status, 401);
  });

  await t.test('public flow configuration exposes no credentials and payment callbacks are non-authoritative', async () => {
    await resetWithPatients();
    const config = await json(await request('/auth/config'));
    assert.equal(config.response.status, 200);
    assert.deepEqual(config.value, {
      mode: 'mock',
      callbackUrl: 'http://localhost:3000/egovph/sso',
      launchUrl: null,
      // The eVerify "Public API Key" is the ONE value here that is meant to reach the browser —
      // window.eKYC().start({ pubKey }) puts it in an iframe URL, so it is public either way.
      // Asserting the sentinel (rather than null) pins it to env.everify.pubKey, so a future
      // rename cannot silently leave the frontend with an undefined pubKey.
      everifyPubKey: CREDENTIAL_SENTINELS.EVERIFY_PUBKEY,
      // Which provider does the Step 3 capture. Public by nature (the frontend must branch on it)
      // and defaults to the safer of the two: face-liveness never attempts a PhilSys match.
      verificationMethod: 'face-liveness',
      // Browser-safe widget inputs are deliberately absent while SSO is mocked.
      ssoPartnerCode: null,
      ssoHost: null,
    });
    const configRaw = JSON.stringify(config.value);
    assert.equal(configRaw.includes('secret'), false);
    // Its server-side partner must never ride along on this unauthenticated endpoint.
    assert.equal(configRaw.includes(CREDENTIAL_SENTINELS.EVERIFY_CLIENT_SECRET), false);
    assert.equal(configRaw.includes(CREDENTIAL_SENTINELS.EVERIFY_CLIENT_ID), false);

    const callback = await json(await request('/payments/callback', {
      method: 'POST', body: { status: 'paid', bill_id: 'bill_forged' },
    }));
    assert.equal(callback.response.status, 202);
    assert.deepEqual(callback.value, { accepted: true });
    assert.equal((await store.findAll(COLLECTIONS.PAYMENTS)).length, 0);
  });

  await t.test('cross-tenant appointment and payment IDs cannot be read or mutated', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const attacker = sign({ sub: 'pat_attacker' });

    const booked = await json(await request('/appointments', {
      token: owner, method: 'POST', body: { specialty: 'Cardiology' },
    }));
    assert.equal(booked.response.status, 201);
    assert.equal(booked.value.notification.to, undefined);
    assert.equal(booked.value.notification.body, undefined);
    const appointmentId = booked.value.appointment.id;
    assert.equal((await request(`/appointments/${appointmentId}`, { token: attacker, method: 'PATCH', body: { status: 'cancelled' } })).status, 404);
    assert.equal((await request(`/appointments/${appointmentId}/remind`, { token: attacker, method: 'POST' })).status, 404);

    const bill = await json(await request('/payments', { token: owner, method: 'POST', body: { billAmount: 300 } }));
    assert.equal(bill.response.status, 201);
    assert.equal((await request(`/payments/${bill.value.id}/status`, { token: attacker })).status, 404);
    assert.equal((await request(`/payments/${bill.value.id}/status`, { token: owner })).status, 200);
    const messages = await store.findAll(COLLECTIONS.MESSAGES);
    assert.equal(messages[0].to, undefined);
    assert.equal(messages[0].body, undefined);

    const ownerMessages = await json(await request('/messages', { token: owner }));
    assert.equal(ownerMessages.response.status, 200);
    assert.equal(ownerMessages.response.headers.get('ratelimit-limit'), '60');
    assert.equal(ownerMessages.value.length, 1);
    assert.equal(ownerMessages.value[0].kind, 'confirmation');
    assert.equal(ownerMessages.value[0].patientId, undefined);
    assert.equal(ownerMessages.value[0].to, undefined);
    assert.equal(ownerMessages.value[0].body, undefined);

    const attackerMessages = await json(await request('/messages', { token: attacker }));
    assert.equal(attackerMessages.response.status, 200);
    assert.deepEqual(attackerMessages.value, []);
    const messageAudits = await store.findAll(COLLECTIONS.AUDIT_LOGS, (entry) => entry.action === 'messages.list');
    assert.equal(messageAudits.length, 2);
  });

  await t.test('patient replies write a reply + staff-ack pair, never persist the text, and are tenant-scoped', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const attacker = sign({ sub: 'pat_attacker' });

    await request('/appointments', { token: owner, method: 'POST', body: { specialty: 'Cardiology' } });
    const initial = await json(await request('/messages', { token: owner }));
    const confirmation = initial.value[0];
    assert.equal(confirmation.kind, 'confirmation');

    // an attacker cannot reply to another patient's message thread
    assert.equal((await request(`/messages/${confirmation.id}/reply`, {
      token: attacker, method: 'POST', body: { text: 'not mine' },
    })).status, 404);

    // an empty body is rejected before anything is written
    assert.equal((await request(`/messages/${confirmation.id}/reply`, {
      token: owner, method: 'POST', body: { text: '' },
    })).status, 400);

    const replied = await json(await request(`/messages/${confirmation.id}/reply`, {
      token: owner, method: 'POST', body: { text: 'When should I arrive?' },
    }));
    assert.equal(replied.response.status, 201);
    assert.equal(replied.value.reply.kind, 'reply_sent');
    assert.equal(replied.value.reply.meta.inReplyTo, confirmation.id);
    assert.equal(replied.value.ack.kind, 'staff_ack');
    assert.equal(replied.value.ack.meta.inReplyTo, confirmation.id);
    // the reply text itself must never come back in the response or be persisted
    assert.equal(JSON.stringify(replied.value).includes('When should I arrive'), false);

    const stored = await store.findAll(COLLECTIONS.MESSAGES);
    const storedReply = stored.find((m) => m.id === replied.value.reply.id);
    assert.equal(storedReply.text, undefined);
    assert.equal(storedReply.body, undefined);

    const thread = await json(await request('/messages', { token: owner }));
    assert.equal(thread.value.length, 3); // confirmation + reply_sent + staff_ack

    // replying to a nonexistent message id is a 404, not a 500
    assert.equal((await request('/messages/msg_doesnotexist/reply', {
      token: owner, method: 'POST', body: { text: 'hi' },
    })).status, 404);
  });

  await t.test('PATCH /patients/me: contact fields are self-editable, name/DOB are locked', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });

    // Valid PH E.164 mobile — accepted and persisted.
    const ok = await json(await request('/patients/me', {
      token: owner, method: 'PATCH', body: { phone: '+639175551234' },
    }));
    assert.equal(ok.response.status, 200);
    assert.equal(ok.value.phone, '+639175551234');

    // Non-E.164 phone shapes — rejected with 400. Format canonicalization happens client-side;
    // the API contract is strictly +63 + 10 digits.
    for (const bad of ['09175551234', '639175551234', '5551234', '+1234', 'not-a-phone']) {
      const res = await request('/patients/me', {
        token: owner, method: 'PATCH', body: { phone: bad },
      });
      assert.equal(res.status, 400, `expected 400 for phone=${bad}, got ${res.status}`);
    }

    // identityVerified and egovSub are never user-writable: one is the OUTPUT of eVerify+liveness,
    // the other is the SSO identity anchor that patientIdFor() derives the record id from.
    for (const bad of [{ identityVerified: true }, { egovSub: 'other-user' }, { philsysId: 'x' }]) {
      const res = await request('/patients/me', { token: owner, method: 'PATCH', body: bad });
      assert.equal(res.status, 400, `expected 400 for body=${JSON.stringify(bad)}, got ${res.status}`);
    }

    // Demographics gate on LIVE eVerify, not on the flag alone: a seeded or mock 'verified'
    // proves nothing about PhilSys, and locking on it would freeze the demo patient as Juan Dela
    // Cruz with no way to correct the very fields eVerify matches on. This suite runs eVerify in
    // mock, so they stay editable here even for a verified patient, and demographicsLocked is
    // false — the same condition the write guard uses.
    await store.update(COLLECTIONS.PATIENTS, 'pat_attacker', { identityVerified: true });
    const stillEditable = await json(await request('/patients/me', { token: sign({ sub: 'pat_attacker' }), method: 'PATCH', body: { firstName: 'Maria' } }));
    assert.equal(stillEditable.response.status, 200, 'mock-mode verification must not lock demographics');
    assert.equal(stillEditable.value.demographicsLocked, false);
    assert.equal(stillEditable.value.firstName, 'Maria');

    // The Account screen edits the name as one field and splits it, so every save rewrites all
    // three name parts together. A two-token name sends middleName: '' — that empty string is the
    // only way to drop a stale middle name, so it has to be accepted and persisted rather than
    // treated as missing. Omitting the key instead is what left the seeded "Dela" in place and
    // produced "Matthew Emmanuel Dela Labrador".
    const renamed = await json(await request('/patients/me', {
      token: owner, method: 'PATCH', body: { firstName: 'Matthew', middleName: '', lastName: 'Labrador' },
    }));
    assert.equal(renamed.response.status, 200);
    assert.equal(renamed.value.middleName, '');
    assert.equal(renamed.value.firstName, 'Matthew');
    assert.equal(renamed.value.lastName, 'Labrador');

    // Empty body rejected — no silent no-op PATCH.
    assert.equal((await request('/patients/me', { token: owner, method: 'PATCH', body: {} })).status, 400);

    // Cross-tenant: an attacker's PATCH updates ONLY their own record (JWT sub scoping),
    // never the owner's. Verify the owner's phone from the first PATCH is still intact.
    const attacker = sign({ sub: 'pat_attacker' });
    await request('/patients/me', { token: attacker, method: 'PATCH', body: { phone: '+639170000000' } });
    const ownerAfter = await json(await request('/patients/me', { token: owner }));
    assert.equal(ownerAfter.value.phone, '+639175551234');
  });

  await t.test('a manually-corrected contact field survives a later SSO re-login (per-field provenance)', async () => {
    await resetWithPatients();
    // Mock SSO always returns the same static profile, including email 'juan.delacruz@example.ph'.
    const first = await json(await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo' } }));
    assert.equal(first.value.patient.email, 'juan.delacruz@example.ph');
    const owner = first.value.token;

    const patched = await json(await request('/patients/me', {
      token: owner, method: 'PATCH', body: { email: 'rosa.corrected@example.ph' },
    }));
    assert.equal(patched.response.status, 200);
    assert.equal(patched.value.email, 'rosa.corrected@example.ph');

    // Re-login (SSO returns the same static, now-stale email) must NOT clobber the manual fix.
    const second = await json(await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo' } }));
    assert.equal(second.response.status, 200);
    assert.equal(second.value.patient.email, 'rosa.corrected@example.ph');
  });

  await t.test('two mock exchange codes are two separate patients — no shared demo row', async () => {
    await resetWithPatients();
    // Mock SSO used to return one hardcoded uniqid, so every visitor of the deployed demo resolved
    // to the same patient id: two people testing at once read each other's profile, appointments
    // and payments, and overwrote each other's edits. The exchange code now decides the identity.
    const alice = await json(await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo_alice_device' } }));
    const bob = await json(await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo_bob_device' } }));
    assert.equal(alice.response.status, 200);
    assert.equal(bob.response.status, 200);
    assert.notEqual(alice.value.patient.id, bob.value.patient.id);
    // ...and neither of them is the canonical seeded 'demo' patient.
    const canonical = await json(await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo' } }));
    assert.notEqual(alice.value.patient.id, canonical.value.patient.id);
    assert.notEqual(bob.value.patient.id, canonical.value.patient.id);

    // Each new demo patient still gets the three seeded labs (its own copies, ownership-scoped)
    // and the PhilHealth benefit — without those the Records screen and the eGovPay step are empty.
    const aliceRecords = await json(await request('/records', { token: alice.value.token }));
    const bobRecords = await json(await request('/records', { token: bob.value.token }));
    assert.equal(aliceRecords.value.length, 3);
    assert.equal(bobRecords.value.length, 3);
    assert.equal(alice.value.patient.benefits.philhealth, true);
    assert.equal(bob.value.patient.benefits.philhealth, true);
    // Distinct record ids, and each copy re-verifies against its own anchor rather than showing
    // up as tampered because it borrowed another patient's content hash.
    const aliceIds = new Set(aliceRecords.value.map((r) => r.id));
    assert.equal(bobRecords.value.some((r) => aliceIds.has(r.id)), false);
    const verified = await json(await request(`/records/${bobRecords.value[0].id}/verify`, { token: bob.value.token }));
    assert.equal(verified.value.verified, true);
    // Alice cannot read Bob's copy at all — 404, same as any other cross-tenant read.
    assert.equal((await request(`/records/${bobRecords.value[0].id}`, { token: alice.value.token })).status, 404);

    // Activity stays on its own side: Alice books, Bob's list is still empty.
    assert.equal((await request('/appointments', { token: alice.value.token, method: 'POST', body: { specialty: 'Cardiology' } })).status, 201);
    const bobAppointments = await json(await request('/appointments', { token: bob.value.token }));
    assert.deepEqual(bobAppointments.value, []);

    // And a profile edit by one is invisible to the other — the failure the demo actually showed.
    await request('/patients/me', { token: alice.value.token, method: 'PATCH', body: { phone: '+639175550001' } });
    const bobMe = await json(await request('/patients/me', { token: bob.value.token }));
    assert.equal(bobMe.value.phone, '+639170000000');
  });

  await t.test('the same exchange code always resolves to the same patient (login stays idempotent)', async () => {
    await resetWithPatients();
    // patientIdFor keeps SSO logins stable per egovSub — a returning device must land back on its
    // own patient, not a fresh empty one, and must not accumulate a second set of demo records.
    const first = await json(await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo_stable_device' } }));
    const second = await json(await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo_stable_device' } }));
    assert.equal(first.value.patient.id, second.value.patient.id);
    const records = await json(await request('/records', { token: second.value.token }));
    assert.equal(records.value.length, 3);
    // The mock access-token login path derives the same identity from the same code.
    const viaToken = await json(await request('/auth/token', { method: 'POST', body: { accessToken: 'mock-access-demo_stable_device' } }));
    assert.equal(viaToken.value.patient.id, first.value.patient.id);
  });

  await t.test('PATCH benefits: unknown key does not reflect raw input into the response message', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    // A rejected key must NOT surface the raw URL segment in the error's `message` field —
    // otherwise a caller can steer the message text by crafting the path. The value may
    // appear in `details` (that's typed developer data), but the top-level message must be static.
    const marker = '<img-onerror-alert>';
    const res = await json(await request(`/patients/me/benefits/${encodeURIComponent(marker)}`, {
      token: owner, method: 'PATCH',
    }));
    assert.equal(res.response.status, 400);
    assert.equal(res.value.error.message, 'Unsupported benefit');
    assert.equal(res.value.error.message.includes(marker), false);
  });

  await t.test('PATCH benefits: rate-limited per user (spam does not overwhelm the store)', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const statuses = [];
    for (let i = 0; i < 22; i += 1) {
      statuses.push((await request('/patients/me/benefits/philhealth', { token: owner, method: 'PATCH' })).status);
    }
    // First 20 succeed (200), then the limiter kicks in with 429s. No 5xx.
    assert.equal(statuses.filter((s) => s === 200).length, 20);
    assert.ok(statuses.slice(20).every((s) => s === 429), `expected 429s after the 20th request; got ${statuses.slice(20).join(',')}`);
  });

  await t.test('POST /payments rejects a cross-tenant appointmentId (no misattribution)', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const attacker = sign({ sub: 'pat_attacker' });

    // Owner books an appointment — attacker tries to attach a payment to it.
    const booked = await json(await request('/appointments', {
      token: owner, method: 'POST', body: { specialty: 'Cardiology' },
    }));
    const ownersApptId = booked.value.appointment.id;

    // Cross-tenant attach must be rejected (404 to avoid disclosing appointment existence),
    // and no payment row should be persisted for that attacker.
    const attempt = await request('/payments', {
      token: attacker, method: 'POST',
      body: { billAmount: 300, appointmentId: ownersApptId },
    });
    assert.equal(attempt.status, 404);
    const attackerPayments = await store.findAll(COLLECTIONS.PAYMENTS, (p) => p.patientId === 'pat_attacker');
    assert.equal(attackerPayments.length, 0);

    // Owner's own bill with their own appointmentId still succeeds, with the linkage stored.
    const ok = await json(await request('/payments', {
      token: owner, method: 'POST',
      body: { billAmount: 300, appointmentId: ownersApptId },
    }));
    assert.equal(ok.response.status, 201);
    assert.equal(ok.value.appointmentId, ownersApptId);

    // A completely made-up appointmentId (matches the regex but doesn't exist) is also 404.
    assert.equal((await request('/payments', {
      token: owner, method: 'POST',
      body: { billAmount: 300, appointmentId: 'apt_does_not_exist_anywhere' },
    })).status, 404);
  });

  await t.test('triage symptoms and report narratives are encrypted at rest', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const triage = await json(await request('/triage', {
      token: owner, method: 'POST', body: { text: 'I have a mild headache', language: 'en' },
    }));
    assert.equal(triage.response.status, 201);
    assert.equal(triage.value.inputSymptoms, 'I have a mild headache');
    assert.equal(triage.value.specialty, 'Neurology');
    assert.equal(triage.value.urgency, 'routine');
    assert.match(triage.value.reasoning, /headache|nervous system/i);
    const storedTriage = await store.findById(COLLECTIONS.TRIAGE, triage.value.id);
    assert.equal(storedTriage.inputSymptoms, undefined);
    assert.match(storedTriage.encrypted, /^v1:/);

    const report = await fileReportWithOtp(owner, { category: 'service', description: 'Sensitive complaint narrative' });
    assert.equal(report.response.status, 201);
    assert.equal(report.value.description, 'Sensitive complaint narrative');
    const storedReport = await store.findById(COLLECTIONS.REPORTS, report.value.id);
    assert.equal(storedReport.description, undefined);
    assert.match(storedReport.encrypted, /^v1:/);
  });

  await t.test('new record PHI is encrypted at rest and accesses are audited', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const created = await json(await request('/records', {
      token: owner,
      method: 'POST',
      body: { type: 'lab', title: 'Sensitive Test', sourceFacility: 'PGH', data: { result: 'positive' }, summary: 'Sensitive summary' },
    }));
    assert.equal(created.response.status, 201);
    assert.equal(created.value.summary, 'Sensitive summary');
    const stored = await store.findById(COLLECTIONS.RECORDS, created.value.id);
    assert.equal(stored.title, undefined);
    assert.equal(stored.summary, undefined);
    assert.equal(stored.type, undefined);
    assert.match(stored.encrypted, /^v1:/);
    const audits = await store.findAll(COLLECTIONS.AUDIT_LOGS, (entry) => entry.resourceId === created.value.id);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'records.create');
  });

  await t.test('a liveness session can only be claimed once under concurrent replay', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const started = await json(await request('/identity/liveness', { token: owner, method: 'POST' }));
    assert.equal(started.response.status, 200);
    const body = { consent: true, livenessSessionId: started.value.sessionId };
    const responses = await Promise.all([
      request('/identity/verify', { token: owner, method: 'POST', body }),
      request('/identity/verify', { token: owner, method: 'POST', body }),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
  });

  await t.test('an eVerify Web SDK session_id can be registered and consumed once, but not re-registered to reopen it', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const sessionId = '11111111-2222-4333-8444-555555555555';

    const registered = await json(await request('/identity/liveness/everify-sdk', {
      token: owner, method: 'POST', body: { sessionId },
    }));
    assert.equal(registered.response.status, 200);
    assert.deepEqual(registered.value, { sessionId, provider: 'everify-sdk' });

    // re-registering the same session_id must not reset an already-claimed/consumed session
    const reRegistered = await request('/identity/liveness/everify-sdk', {
      token: owner, method: 'POST', body: { sessionId },
    });
    assert.equal(reRegistered.status, 400);

    const verified = await json(await request('/identity/verify', {
      token: owner, method: 'POST', body: { consent: true, livenessSessionId: sessionId },
    }));
    assert.equal(verified.response.status, 200);
    assert.equal(verified.value.verification.liveness.provider, 'everify-sdk');

    // the consumed session cannot be replayed
    const replay = await request('/identity/verify', {
      token: owner, method: 'POST', body: { consent: true, livenessSessionId: sessionId },
    });
    assert.equal(replay.status, 400);
  });

  await t.test('an immutable eGovPH sandbox persona uses checked liveness without an impossible PhilSys face match', async () => {
    const ownerId = await resetWithPatients();
    await store.update(COLLECTIONS.PATIENTS, ownerId, {
      identityVerified: false,
      egovSandboxAccount: true,
      phone: '+639090000001',
    });
    const owner = sign({ sub: ownerId });
    const started = await json(await request('/identity/liveness', { token: owner, method: 'POST' }));
    assert.equal(started.response.status, 200);

    const verified = await json(await request('/identity/verify', {
      token: owner,
      method: 'POST',
      body: { consent: true, livenessSessionId: started.value.sessionId },
    }));
    assert.equal(verified.response.status, 200);
    assert.equal(verified.value.verified, true);
    assert.equal(verified.value.verification.provider, 'egov-sandbox');
    assert.equal(verified.value.verification.liveness.provider, 'mock');

    const me = await json(await request('/patients/me', { token: owner }));
    assert.equal(me.value.sandboxAccount, true);
    assert.equal(me.value.identityVerified, true);
    assert.equal(me.value.demographicsLocked, false);
  });

  await t.test('editing a real patient contact to a sandbox number cannot enable the sandbox path', async () => {
    await resetWithPatients();
    const owner = sign({ sub: 'pat_attacker' });
    const updated = await json(await request('/patients/me', {
      token: owner,
      method: 'PATCH',
      body: { phone: '+639090000001' },
    }));
    assert.equal(updated.response.status, 200);
    assert.equal(updated.value.phone, '+639090000001');
    assert.equal(updated.value.sandboxAccount, false);
  });

  await t.test('a raw (unregistered) client-supplied session_id is rejected, not silently trusted', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const forged = await request('/identity/verify', {
      token: owner, method: 'POST', body: { consent: true, livenessSessionId: '99999999-2222-4333-8444-555555555555' },
    });
    assert.equal(forged.status, 400);
  });

  await t.test('malformed and oversized JSON are rejected with safe statuses', async () => {
    await resetWithPatients();
    assert.equal((await request('/auth/egov/exchange', { method: 'POST', rawBody: '{' })).status, 400);
    const oversized = JSON.stringify({ exchangeCode: 'x'.repeat(270 * 1024) });
    assert.equal((await request('/auth/egov/exchange', { method: 'POST', rawBody: oversized })).status, 413);
    const tooDeep = `{"exchangeCode":"demo","nested":${'['.repeat(40)}0${']'.repeat(40)}}`;
    assert.equal((await request('/auth/egov/exchange', { method: 'POST', rawBody: tooDeep })).status, 400);
  });

  await t.test('production refuses weak secrets and implicit mock security integrations', () => {
    const cwd = path.join(__dirname, '..');
    const common = {
      ...process.env,
      NODE_ENV: 'production',
      PHI_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      STORE_DRIVER: 'kv',
      UPSTASH_REDIS_REST_URL: 'https://example.invalid',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
      APP_URL: 'https://app.example.invalid',
    };
    const weak = spawnSync(process.execPath, ['-e', "require('./src/app')"], {
      cwd, encoding: 'utf8', env: { ...common, JWT_SECRET: 'change-me-to-a-long-random-string', ALLOW_MOCK_IN_PRODUCTION: 'true' },
    });
    assert.notEqual(weak.status, 0);
    assert.match(weak.stderr, /JWT_SECRET/);

    const mock = spawnSync(process.execPath, ['-e', "require('./src/app')"], {
      cwd, encoding: 'utf8', env: { ...common, JWT_SECRET: 'strong-production-secret-0123456789abcdef', INTEGRATION_MODE: 'mock', ALLOW_MOCK_IN_PRODUCTION: 'false' },
    });
    assert.notEqual(mock.status, 0);
    assert.match(mock.stderr, /Production cannot use mock/);
  });

  await t.test('staging cannot share production keyspace: STORE_KEY_PREFIX is fail-hard both ways', () => {
    // Staging runs against production's single Upstash database (the Vercel-managed account
    // cannot create a second), so STORE_KEY_PREFIX is the ONLY thing keeping them apart.
    // Both misconfigurations are silent data disasters, so both must refuse to boot.
    const cwd = path.join(__dirname, '..');
    const common = {
      ...process.env,
      NODE_ENV: 'production',
      PHI_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      JWT_SECRET: 'strong-production-secret-0123456789abcdef',
      STORE_DRIVER: 'kv',
      UPSTASH_REDIS_REST_URL: 'https://example.invalid',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
      APP_URL: 'https://app.example.invalid',
      ALLOW_MOCK_IN_PRODUCTION: 'true',
    };
    const boot = (extra) => spawnSync(process.execPath, ['-e', "require('./src/app')"], {
      cwd, encoding: 'utf8', env: { ...common, ...extra },
    });

    // Preview with no prefix would write straight into production's keys.
    const unprefixedPreview = boot({ VERCEL_ENV: 'preview', STORE_KEY_PREFIX: '' });
    assert.notEqual(unprefixedPreview.status, 0);
    assert.match(unprefixedPreview.stderr, /STORE_KEY_PREFIX is required/);

    // A prefix in production points it at an empty keyspace — production would look wiped.
    const prefixedProd = boot({ VERCEL_ENV: 'production', STORE_KEY_PREFIX: 'staging' });
    assert.notEqual(prefixedProd.status, 0);
    assert.match(prefixedProd.stderr, /must be empty in production/);

    // A malformed prefix must be rejected outright, never sanitized into a different keyspace.
    const malformed = boot({ VERCEL_ENV: 'preview', STORE_KEY_PREFIX: 'stag ing:*' });
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stderr, /STORE_KEY_PREFIX must be alphanumeric/);

    // The two correct configurations boot.
    assert.equal(boot({ VERCEL_ENV: 'preview', STORE_KEY_PREFIX: 'staging' }).status, 0);
    assert.equal(boot({ VERCEL_ENV: 'production', STORE_KEY_PREFIX: '' }).status, 0);
  });

  await t.test('key prefix namespaces every Redis keyspace, not just documents', () => {
    // Prefixing documents alone would still let staging consume production's queue numbers
    // (ctr:) and rate-limit budget (rl:), so assert all four namespaces carry it.
    const { keyPrefix } = require('../src/config/env');
    assert.equal(keyPrefix(''), '');
    assert.equal(keyPrefix(undefined), '');
    assert.equal(keyPrefix('staging'), 'staging:');
    assert.equal(keyPrefix('staging:'), 'staging:', 'a trailing colon must not double up');
    assert.throws(() => keyPrefix('bad prefix'), /alphanumeric/);
    assert.throws(() => keyPrefix('doc:*'), /alphanumeric/);

    const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'store', 'kvStore.js'), 'utf8');
    for (const ns of ['doc:', 'idx:', 'ctr:', 'rl:']) {
      assert.match(src, new RegExp(`\\$\\{P\\}${ns}`), `${ns} keyspace must be prefixed`);
    }
  });

  await t.test('/integrations/status is admin-gated and leaks no credential values', async () => {
    await resetWithPatients();
    // Missing admin key → 403 (never 200)
    assert.equal((await request('/integrations/status')).status, 403);
    // Wrong admin key → 403
    assert.equal((await request('/integrations/status', { headers: { 'x-admin-key': 'nope' } })).status, 403);
    // Correct admin key → 200 with structured payload
    const ok = await json(await request('/integrations/status', { headers: { 'x-admin-key': process.env.ADMIN_KEY } }));
    assert.equal(ok.response.status, 200);
    assert.equal(typeof ok.value.globalMode, 'string');
    for (const integ of Object.values(ok.value.integrations)) {
      assert.equal(typeof integ.mode, 'string');
      assert.equal(typeof integ.hasCredentials, 'boolean');
    }
    const raw = JSON.stringify(ok.value);
    // The real assertion: NONE of the sentinel credential values must appear in the response.
    // Because the sentinels are set as the actual env values (see top of file), a handler that
    // serialized any credential-carrying field would emit its sentinel and fail this check.
    for (const [name, value] of Object.entries(CREDENTIAL_SENTINELS)) {
      assert.equal(raw.includes(value), false, `${name} sentinel leaked into /integrations/status response`);
    }
    // Regression cover for the "rpcUrl embeds credentials" finding — even the parsed pieces
    // (userinfo + api-key path segment) must not survive safeOrigin() stripping.
    assert.equal(raw.includes('s3cret_pw'), false, 'rpcUrl userinfo password leaked');
    assert.equal(raw.includes('api_key_ABC'), false, 'rpcUrl path api key leaked');
    assert.equal(raw.includes('user:s3cret_pw'), false, 'rpcUrl userinfo pair leaked');
  });

  await t.test('POST /integrations/audit/sweep is admin-gated and evicts only entries past retention', async () => {
    const ownerId = await resetWithPatients();
    assert.equal((await request('/integrations/audit/sweep', { method: 'POST' })).status, 403);

    // One fresh entry (must survive the sweep) ...
    const freshEntry = await store.create(COLLECTIONS.AUDIT_LOGS, {
      id: 'aud_fresh_test', actorId: ownerId, patientId: ownerId, action: 'records.read',
      resourceType: 'record', resourceId: null, ip: null, userAgent: null,
      createdAt: new Date().toISOString(),
    });
    assert.ok(freshEntry);
    // ... plus one manually backdated well past the retention window (must be evicted).
    const stale = await store.create(COLLECTIONS.AUDIT_LOGS, {
      id: 'aud_stale_test', actorId: ownerId, patientId: ownerId, action: 'records.read',
      resourceType: 'record', resourceId: null, ip: null, userAgent: null,
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    });
    assert.ok(stale);

    const swept = await json(await request('/integrations/audit/sweep', {
      method: 'POST', headers: { 'x-admin-key': process.env.ADMIN_KEY },
    }));
    assert.equal(swept.response.status, 200);
    assert.equal(swept.value.removed, 1);

    assert.equal(await store.findById(COLLECTIONS.AUDIT_LOGS, 'aud_stale_test'), null);
    assert.ok(await store.findById(COLLECTIONS.AUDIT_LOGS, 'aud_fresh_test'));
  });

  await t.test('a report cannot be filed without a code texted to the number on file, and the code is single-use', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const attacker = sign({ sub: 'pat_attacker' });
    const complaint = { category: 'Billing', description: 'Charged twice for one visit' };

    // No code at all → rejected by the schema, before anything reaches eReport.
    assert.equal((await request('/reports', { token: owner, method: 'POST', body: complaint })).status, 400);
    assert.equal((await store.findAll(COLLECTIONS.REPORTS)).length, 0);

    const otp = await json(await request('/reports/otp', { token: owner, method: 'POST' }));
    assert.equal(otp.response.status, 200);
    assert.match(otp.value.mockCode, /^\d{6}$/);
    // Derived from the seeded patient's real phone (+639170000000) — the screen used to render a
    // hardcoded "•••• 4567" belonging to nobody.
    assert.equal(otp.value.maskedPhone, '•••• 0000');

    // Only a salted hash is persisted; the code must not be recoverable from the stored challenge.
    const stored = await store.findById(COLLECTIONS.OTP_CHALLENGES, otp.value.challengeId);
    assert.equal(stored.status, 'pending');
    assert.equal(stored.code, undefined);
    assert.equal(JSON.stringify(stored).includes(otp.value.mockCode), false, 'the OTP leaked into the stored challenge');

    const wrong = String((Number(otp.value.mockCode) + 1) % 1_000_000).padStart(6, '0');
    const rejected = await request('/reports', {
      token: owner, method: 'POST', body: { ...complaint, challengeId: otp.value.challengeId, code: wrong },
    });
    assert.equal(rejected.status, 400);
    assert.equal((await store.findAll(COLLECTIONS.REPORTS)).length, 0, 'a wrong code must not file a complaint');

    const filed = await json(await request('/reports', {
      token: owner, method: 'POST', body: { ...complaint, challengeId: otp.value.challengeId, code: otp.value.mockCode },
    }));
    assert.equal(filed.response.status, 201);
    assert.ok(filed.value.caseNumber);
    assert.equal((await store.findById(COLLECTIONS.OTP_CHALLENGES, otp.value.challengeId)).status, 'consumed');

    // Single use: the correct code cannot file a second complaint.
    assert.equal((await request('/reports', {
      token: owner, method: 'POST', body: { ...complaint, challengeId: otp.value.challengeId, code: otp.value.mockCode },
    })).status, 400);
    assert.equal((await store.findAll(COLLECTIONS.REPORTS)).length, 1);

    // A challenge is bound to the patient it was minted for: another tenant cannot spend it even
    // holding both halves of it.
    const second = await json(await request('/reports/otp', { token: owner, method: 'POST' }));
    assert.equal((await request('/reports', {
      token: attacker, method: 'POST', body: { ...complaint, challengeId: second.value.challengeId, code: second.value.mockCode },
    })).status, 400);
    assert.equal((await store.findAll(COLLECTIONS.REPORTS, (r) => r.patientId === 'pat_attacker')).length, 0);
  });

  await t.test('an expired code is refused, retired, and files nothing', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const otp = await json(await request('/reports/otp', { token: owner, method: 'POST' }));
    assert.equal(otp.value.expiresInSeconds, 300);

    // Backdate past the TTL rather than sleeping five minutes.
    await store.update(COLLECTIONS.OTP_CHALLENGES, otp.value.challengeId, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const res = await json(await request('/reports', {
      token: owner, method: 'POST',
      body: { category: 'Access', description: 'Could not reach the clinic', challengeId: otp.value.challengeId, code: otp.value.mockCode },
    }));
    assert.equal(res.response.status, 400);
    assert.match(res.value.error.message, /expired/i);
    assert.equal((await store.findById(COLLECTIONS.OTP_CHALLENGES, otp.value.challengeId)).status, 'expired');
    assert.equal((await store.findAll(COLLECTIONS.REPORTS)).length, 0);
  });

  await t.test('the attempt cap retires a code rather than letting its 10^6 search space be walked', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const otp = await json(await request('/reports/otp', { token: owner, method: 'POST' }));
    const wrong = String((Number(otp.value.mockCode) + 7) % 1_000_000).padStart(6, '0');
    const body = (code) => ({ category: 'Access', description: 'Could not reach the clinic', challengeId: otp.value.challengeId, code });

    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await request('/reports', { token: owner, method: 'POST', body: body(wrong) })).status);
    }
    assert.deepEqual(statuses, [400, 400, 400, 400, 400]);

    const challenge = await store.findById(COLLECTIONS.OTP_CHALLENGES, otp.value.challengeId);
    assert.equal(challenge.attempts, 5);
    assert.equal(challenge.status, 'locked', 'the challenge must be retired at the cap, not merely refused');

    // Even the RIGHT code is dead once the cap is hit — otherwise the cap only slows an attacker down.
    const correct = await json(await request('/reports', { token: owner, method: 'POST', body: body(otp.value.mockCode) }));
    assert.equal(correct.response.status, 400);
    assert.match(correct.value.error.message, /too many/i);
    assert.equal((await store.findAll(COLLECTIONS.REPORTS)).length, 0);
  });

  await t.test('no phone on file mints no code, and OTP requests are rate limited', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    // pat_attacker is seeded without a phone. There is nothing to prove control of, so the flow
    // stops here and the client sends them to Account rather than filing something unverified.
    const noPhone = await json(await request('/reports/otp', { token: sign({ sub: 'pat_attacker' }), method: 'POST' }));
    assert.equal(noPhone.response.status, 400);
    assert.match(noPhone.value.error.message, /mobile number/i);
    assert.equal(noPhone.value.challengeId, undefined);

    // Every request spends SMS credit and rings a real handset, so the budget is small.
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await request('/reports/otp', { token: owner, method: 'POST' })).status);
    }
    assert.deepEqual(statuses.slice(0, 5), Array(5).fill(200));
    assert.equal(statuses[5], 429);
  });

  await t.test('in live SMS mode the code goes out over eMessage and is never returned by the API', () => {
    // The mock-mode `mockCode` escape hatch is what makes this flow testable offline, so the gate
    // on it is load-bearing: a live-credentialed deployment must never hand the code back to the
    // caller. Run in a fresh process against a loopback stand-in for the eMessage SMS push
    // endpoint, because config/env.js reads EMESSAGE_MODE once at module load.
    const cwd = path.join(__dirname, '..');
    const script = `
      const nodeHttp = require('node:http');
      let pushed = null;
      const srv = nodeHttp.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
          pushed = JSON.parse(raw);
          res.statusCode = 201;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: { message: 'SMS was successfully created.' } }));
        });
      });
      srv.listen(0, '127.0.0.1', async () => {
        process.env.EMESSAGE_MODE = 'live';
        process.env.EMESSAGE_BASE_URL = 'http://127.0.0.1:' + srv.address().port;
        process.env.EMESSAGE_AUTH_TOKEN = 'test-only-emessage-token';
        const { seedDemoData } = require('./src/store');
        const otpService = require('./src/services/otpService');
        const patient = await seedDemoData();
        const issued = await otpService.requestOtp({ patientId: patient.id, purpose: otpService.PURPOSES.REPORT });
        srv.close();

        const sent = String((pushed && pushed.message) || '').match(/\\b(\\d{6})\\b/);
        const problems = [];
        if (issued.mockCode !== undefined) problems.push('live mode returned mockCode');
        if (!sent) problems.push('no 6-digit code in the SMS body');
        if (!pushed || pushed.number !== patient.phone) problems.push('SMS was not addressed to the patient record phone');
        if (sent && JSON.stringify(issued).includes(sent[1])) problems.push('the code leaked into the API response');
        // The code that was texted is the one that verifies — the hash really is of the sent code.
        if (sent) {
          await otpService.claimOtp({
            patientId: patient.id, purpose: otpService.PURPOSES.REPORT,
            challengeId: issued.challengeId, code: sent[1],
          }).catch((err) => problems.push('the texted code did not verify: ' + err.message));
        }
        if (problems.length) { console.error(problems.join('; ')); process.exit(1); }
        process.exit(0);
      });
    `;
    const result = spawnSync(process.execPath, ['-e', script], { cwd, encoding: 'utf8', env: { ...process.env } });
    assert.equal(result.status, 0, result.stderr);
  });

  await t.test('GET /reports lists only the caller\'s own reports and never the description', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const attacker = sign({ sub: 'pat_attacker' });

    const filed = await fileReportWithOtp(owner, { category: 'Billing', description: 'Charged twice for one visit' });
    assert.equal(filed.response.status, 201);

    const mine = await json(await request('/reports', { token: owner }));
    assert.equal(mine.response.status, 200);
    assert.equal(mine.value.reports.length, 1);
    assert.equal(mine.value.reports[0].caseNumber, filed.value.caseNumber);
    assert.equal(mine.value.reports[0].category, 'Billing');
    // Summary rows only — the encrypted narrative must not be decrypted just to render a list,
    // and the raw ciphertext/patientId must not ride along either.
    assert.equal(mine.value.reports[0].description, undefined);
    assert.equal(mine.value.reports[0].encrypted, undefined);
    assert.equal(mine.value.reports[0].patientId, undefined);
    assert.equal(JSON.stringify(mine.value).includes('Charged twice'), false, 'report description leaked into the list');

    // Another tenant sees an empty list, not someone else's cases.
    const theirs = await json(await request('/reports', { token: attacker }));
    assert.equal(theirs.response.status, 200);
    assert.deepEqual(theirs.value.reports, []);

    // The list must not become a way around the owner scoping on the detail route.
    assert.equal((await request(`/reports/${filed.value.caseNumber}`, { token: attacker })).status, 404);
    assert.equal((await request(`/reports/${filed.value.caseNumber}`, { token: owner })).status, 200);
    assert.equal((await request('/reports')).status, 401);
  });

  await t.test('GET /records/:id/verify is identity-gated like every other record route', async () => {
    const ownerId = await resetWithPatients();
    await store.update(COLLECTIONS.PATIENTS, ownerId, { identityVerified: false });
    const owner = sign({ sub: ownerId });
    assert.equal((await request('/records', { token: owner })).status, 400);
    const verify = await request('/records/rec_demo_cbc/verify', { token: owner });
    assert.equal(verify.status, 400, 'unverified identity must not be able to read a record\'s verify badge/title/facility');
  });

  await t.test('GET /records/doctor-summary reaches its static route without fanning out chain verification', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const summary = await json(await request('/records/doctor-summary', { token: owner }));
    assert.equal(summary.response.status, 200, JSON.stringify(summary.value));
    assert.equal(summary.value.recordCount, 3);
    assert.equal(summary.value.verifiedLabs.length, 3);

    // Regression guard for the quota incident: live record creation may submit one transaction,
    // but must never invoke ethers' receipt-polling helper.
    const chainSource = require('node:fs').readFileSync(path.join(__dirname, '../src/integrations/egovChain.js'), 'utf8');
    assert.equal(/^\s*(?:const\s+\w+\s*=\s*)?await\s+tx\.wait\s*\(/m.test(chainSource), false, 'eGovChain must not poll receipts with tx.wait()');
  });

  await t.test('dual-version PHI decryption: legacy (v1, no encryptedVersion) demo records stay readable', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const raw = await store.findById(COLLECTIONS.RECORDS, 'rec_demo_cbc');
    assert.equal(raw.encryptedVersion, undefined, 'the seeded demo record must exercise the legacy (v1) format, not v2');
    const record = await json(await request('/records/rec_demo_cbc', { token: owner }));
    assert.equal(record.response.status, 200);
    assert.equal(record.value.title, 'Complete Blood Count (CBC)');
    assert.ok(record.value.data && record.value.data.hemoglobin, 'legacy record data must decrypt');
    const verify = await json(await request('/records/rec_demo_cbc/verify', { token: owner }));
    assert.equal(verify.response.status, 200);
    assert.equal(verify.value.integrityOk, true, 'recomputed content hash must match the anchor for a legacy record');
    assert.equal(verify.value.verified, true);
  });

  await t.test('admin routes authenticate before rate-limiting: unauth spam cannot lock out a real operator', async () => {
    await resetWithPatients();
    // requireAdmin runs BEFORE the shared 'admin' rate-limit bucket on escalate-stale, recurring
    // insights, and nurse-confirm — so an unauthenticated caller is rejected every time and never
    // consumes budget from the bucket a real admin needs.
    const unauthStatuses = [];
    for (let i = 0; i < 15; i += 1) {
      unauthStatuses.push((await request('/reports/escalate-stale', { method: 'POST' })).status);
    }
    assert.ok(unauthStatuses.every((s) => s === 403), `expected every unauth call to be 403, got ${unauthStatuses.join(',')}`);
    const asAdmin = await request('/reports/escalate-stale', { method: 'POST', headers: { 'x-admin-key': process.env.ADMIN_KEY } });
    assert.equal(asAdmin.status, 200, 'a real admin must not be rate-limited by unauthenticated spam against the same route');
  });

  await t.test('an escalated report is never silently un-escalated by a later patient status check', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const filed = await fileReportWithOtp(owner, { category: 'Access', description: 'Could not reach the clinic' });
    const row = await store.findOne(COLLECTIONS.REPORTS, (r) => r.caseNumber === filed.value.caseNumber);
    await store.update(COLLECTIONS.REPORTS, row.id, { createdAt: new Date(Date.now() - 100 * 3600e3).toISOString() });

    const escalated = await reportService.escalateStale();
    assert.equal(escalated.length, 1);
    assert.equal(escalated[0].status, 'escalated');

    // `status` is eGovMed's own state, not eReport's — there is no upstream read-back to merge
    // (see docs/integrations.md), so a later lookup must not reset the local escalation
    // back to 'open'. Guards against anyone reintroducing an upstream status merge.
    const tracked = await json(await request(`/reports/${filed.value.caseNumber}`, { token: owner }));
    assert.equal(tracked.response.status, 200);
    assert.equal(tracked.value.status, 'escalated');
    assert.equal(tracked.value.escalated, true);

    // And it stays escalated on a second sweep — not re-escalatable, not silently reset.
    assert.equal((await reportService.escalateStale()).length, 0);
  });

  await t.test('a cold-start demo reseed never clobbers a demo patient\'s own edits (phone/email/benefits)', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    await request('/patients/me', { token: owner, method: 'PATCH', body: { phone: '+639175551234', email: 'corrected@example.ph' } });
    await request('/patients/me/benefits/whiteCard', { token: owner, method: 'PATCH' });

    // Simulate a serverless cold start re-running the idempotent seed on the same store.
    await seedDemoData();

    const after = await json(await request('/patients/me', { token: owner }));
    assert.equal(after.value.phone, '+639175551234');
    assert.equal(after.value.email, 'corrected@example.ph');
    assert.equal(after.value.benefits.whiteCard, true);
  });

  await t.test('a fully-covered bill settles locally without calling the payment gateway for ₱0', async () => {
    const ownerId = await resetWithPatients();
    await store.update(COLLECTIONS.PATIENTS, ownerId, { benefits: { whiteCard: { active: true } } });
    const owner = sign({ sub: ownerId });
    const bill = await json(await request('/payments', { token: owner, method: 'POST', body: { billAmount: 500 } }));
    assert.equal(bill.response.status, 201);
    assert.equal(bill.value.balance, 0);
    assert.equal(bill.value.status, 'paid');
    assert.equal(bill.value.provider, 'covered');
    assert.equal(bill.value.checkoutUrl, null, 'a ₱0 bill must not carry a dead mock-checkout link');
  });

  await t.test('a second demo sign-in must not delete a bill that is still at the eGovPay checkout', async () => {
    // The bug behind "Bill not found" after a completed checkout. Mock SSO hands every visitor of
    // the deployed demo the SAME patient, and the fresh-demo reset deleted that patient's payments
    // outright on every login. eGovPay's hosted checkout is a full page navigation away from the
    // app, so a bill created seconds earlier was gone the moment anyone else signed in — and the
    // returning browser, holding only that bill id, got a 404 from GET /payments/:id/status.
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const bill = await json(await request('/payments', { token: owner, method: 'POST', body: { billAmount: 750 } }));
    assert.equal(bill.response.status, 201);
    // Mock eGovPay settles instantly; live mode leaves the bill 'pending' until the citizen
    // finishes at the gateway, and that window is what this test is about.
    await store.update(COLLECTIONS.PAYMENTS, bill.value.id, { status: 'pending' });

    const second = await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo' } });
    assert.equal(second.status, 200);

    const resumed = await json(await request(`/payments/${bill.value.id}/status`, { token: owner }));
    assert.equal(resumed.response.status, 200, 'an in-flight bill must survive the shared-demo reset');
    assert.equal(resumed.value.id, bill.value.id);

    // Settled bills are still cleared, so a new visitor doesn't inherit the last one's history.
    const done = await json(await request('/payments', { token: owner, method: 'POST', body: { billAmount: 500 } }));
    assert.equal(done.value.status, 'paid');
    assert.equal((await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo' } })).status, 200);
    assert.equal((await request(`/payments/${done.value.id}/status`, { token: owner })).status, 404);
  });

  await t.test('the bill row is written before the gateway call, so a failed checkout leaves a record not a phantom id', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const egovPay = require('../src/integrations/egovPay');
    const original = egovPay.createCheckout;
    egovPay.createCheckout = async () => { throw new Error('gateway unreachable'); };
    try {
      assert.equal((await request('/payments', { token: owner, method: 'POST', body: { billAmount: 750 } })).status, 500);
    } finally {
      egovPay.createCheckout = original;
    }
    const rows = await store.findAll(COLLECTIONS.PAYMENTS, (p) => p.patientId === ownerId);
    assert.equal(rows.length, 1, 'the attempt must be recorded, not dropped');
    assert.equal(rows[0].status, 'failed');
    // No gateway reference exists to poll — the status endpoint must report the local state
    // rather than asking eGovPay about `null`.
    const status = await json(await request(`/payments/${rows[0].id}/status`, { token: owner }));
    assert.equal(status.response.status, 200);
    assert.equal(status.value.status, 'failed');
  });

  await t.test('the mock checkout link lands on a route the app serves, not the /mock-checkout/ dead end', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const bill = await json(await request('/payments', { token: owner, method: 'POST', body: { billAmount: 750 } }));
    assert.equal(bill.value.provider, 'mock');
    const url = new URL(bill.value.checkoutUrl);
    assert.equal(url.pathname, '/payment/return');
    assert.equal(url.searchParams.get('bill'), bill.value.id, 'the return link must carry the bill id, not just eGovPay\'s reference');
    assert.notEqual(url.searchParams.get('ref'), bill.value.id, 'the gateway reference is not the bill id');
  });

  await t.test('POST /appointments rejects a cross-tenant triageId (no misattribution)', async () => {
    const ownerId = await resetWithPatients();
    const owner = sign({ sub: ownerId });
    const attacker = sign({ sub: 'pat_attacker' });

    const triage = await json(await request('/triage', { token: owner, method: 'POST', body: { text: 'mild headache' } }));
    assert.equal(triage.response.status, 201);

    const attempt = await request('/appointments', {
      token: attacker, method: 'POST', body: { specialty: 'Cardiology', triageId: triage.value.id },
    });
    assert.equal(attempt.status, 404);
    const attackerAppts = await store.findAll(COLLECTIONS.APPOINTMENTS, (a) => a.patientId === 'pat_attacker');
    assert.equal(attackerAppts.length, 0);

    const ok = await json(await request('/appointments', {
      token: owner, method: 'POST', body: { specialty: 'Cardiology', triageId: triage.value.id },
    }));
    assert.equal(ok.response.status, 201);
    assert.equal(ok.value.appointment.triageId, triage.value.id);
  });

  await t.test('patientIdFor is a frozen golden value: changing the derivation would fork every existing patient', async () => {
    await resetWithPatients();
    const login = await json(await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: 'demo' } }));
    assert.equal(login.response.status, 200);
    assert.equal(login.value.patient.id, 'pat_86cdde238746b98be824');
  });

  await t.test('jsonComplexity rejects a literal "__proto__" JSON key before it reaches application code', async () => {
    await resetWithPatients();
    const res = await request('/auth/egov/exchange', {
      method: 'POST', rawBody: '{"exchangeCode":"demo","evil":{"__proto__":{"polluted":true}}}',
    });
    assert.equal(res.status, 400);
  });

  await t.test('the outbound HTTP guard refuses non-https hosts and refuses to follow a redirect', async () => {
    await assert.rejects(() => http.get('http://example.invalid/'), /non-https/);

    const redirector = await new Promise((resolve) => {
      const srv = require('node:http').createServer((_req, res) => {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
      });
      srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
    try {
      const port = redirector.address().port;
      await assert.rejects(() => http.get(`http://127.0.0.1:${port}/`), /redirect/);
    } finally {
      await new Promise((resolve) => redirector.close(resolve));
    }
  });

  await t.test('the offline triage classifier can reach a real "urgent" tier distinct from "emergency"', async () => {
    const egovAi = require('../src/integrations/egovAi');
    const urgent = await egovAi.classifySymptoms({ text: 'high fever for three days' });
    assert.equal(urgent.urgency, 'urgent');
    assert.notEqual(urgent.specialty, 'Emergency Medicine');
    const routine = await egovAi.classifySymptoms({ text: 'sipon lang' });
    assert.equal(routine.urgency, 'routine');
    const emergency = await egovAi.classifySymptoms({ text: 'chest pain' });
    assert.equal(emergency.urgency, 'emergency');
  });

  await t.test('sanitize() merges the rule-based floor\'s red flags even when the model returns none, and enforces the emergency floor', async () => {
    const cwd = path.join(__dirname, '..');
    const script = `
      const http = require('node:http');
      const srv = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          if (req.url.includes('/token')) { res.end(JSON.stringify({ access_token: 'tok', expires_in_seconds: 3600 })); return; }
          // Structurally valid but under-triaged, flag-less model output for an emergency input —
          // simulates a degraded/prompt-injected live model missing what the offline rules catch.
          res.end(JSON.stringify({ data: JSON.stringify({
            specialty: 'Dermatology', urgency: 'routine', red_flags: [],
            summary_en: 'ok', recommended_action: 'Book Dermatology', confidence: 0.9,
          }) }));
        });
      });
      srv.listen(0, '127.0.0.1', async () => {
        const port = srv.address().port;
        process.env.EGOV_AI_MODE = 'live';
        process.env.EGOV_AI_BASE_URL = 'http://127.0.0.1:' + port;
        process.env.EGOV_AI_ACCESS_CODE = 'test-code';
        const egovAi = require('./src/integrations/egovAi');
        const result = await egovAi.classifySymptoms({ text: 'chest pain and difficulty breathing' });
        srv.close();
        const ok = result.urgency === 'emergency'
          && result.specialty === 'Emergency Medicine'
          && result.redFlags.includes('Chest pain / possible cardiac event')
          && result.redFlags.includes('Breathing difficulty');
        if (!ok) { console.error('floor did not override: ' + JSON.stringify(result)); process.exit(1); }
        process.exit(0);
      });
    `;
    const result = spawnSync(process.execPath, ['-e', script], { cwd, encoding: 'utf8', env: { ...process.env } });
    assert.equal(result.status, 0, result.stderr);
  });

  await t.test('authentication attempts are rate limited', async () => {
    await store.reset();
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await request('/auth/egov/exchange', { method: 'POST', body: { exchangeCode: `demo-${i}` } })).status);
    }
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.equal(statuses[10], 429);
  });
});
