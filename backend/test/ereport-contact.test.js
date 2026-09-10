'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// The number filed with a complaint is what a caseworker rings back, and eGovPH's sandbox
// personas carry +63909... numbers nobody can answer. This asserts the whole chain end to end:
// recipient resolution -> reportService -> the eReport adapter's request body. The adapter used to
// read `patient.phone || contact`, which silently discarded the resolved recipient, and nothing
// caught it because no test ever looked at the outgoing payload.
const DEFAULT_PHONE = '+639000000001';

function loadWithStubbedHttp() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  }
  process.env.NOTIFY_DEFAULT_PHONE = DEFAULT_PHONE;
  process.env.EREPORT_MODE = 'live';
  process.env.EREPORT_BASE_URL = 'https://ereport.example.gov.ph';
  process.env.EREPORT_ACCESS_CODE = 'test-access-code';
  process.env.EREPORT_REGION_CODE = '13';
  process.env.EREPORT_PROVINCE_CODE = '1339';
  process.env.EREPORT_MUNICIPALITY_CODE = '133901';
  process.env.EREPORT_BARANGAY_CODE = '133901001';

  const sent = [];
  const httpPath = require.resolve('../src/lib/http');
  delete require.cache[httpPath];
  require.cache[httpPath] = {
    id: httpPath,
    filename: httpPath,
    loaded: true,
    exports: {
      post: async (url, body) => {
        sent.push({ url, body });
        if (url.endsWith('/api/integration/token')) return { access_token: 'tok', expires_at: null };
        return { code: 200, message: 'ok', case_number: 'PFM-010101-0001' };
      },
      get: async () => ({}),
    },
  };
  return { eReport: require('../src/integrations/eReport'), sent };
}

test('eReport files the resolved contact, not the raw SSO number', async (t) => {
  await t.test('the demo default is what reaches submit_complaint', async () => {
    const { eReport, sent } = loadWithStubbedHttp();
    const { smsRecipientFor } = require('../src/lib/recipient');
    // Exactly what reportService.fileReport passes when the request carries no explicit contact.
    const patient = { firstName: 'Juan', lastName: 'Dela Cruz', phone: '+639090000001' };
    const contact = smsRecipientFor(patient).to;
    assert.equal(contact, DEFAULT_PHONE, 'resolver should prefer the demo default over an SSO sandbox number');

    await eReport.fileReport({ category: 'Test', description: 'Test', patient, contact });

    const submit = sent.find((r) => r.url.endsWith('/api/integration/submit_complaint'));
    assert.ok(submit, 'a complaint should have been submitted');
    // eReport wants 639XXXXXXXXX, no plus.
    assert.equal(submit.body.mobile, '639686322055');
    assert.notEqual(submit.body.mobile, '639090000001', 'the undialable sandbox number must not be filed');
  });

  await t.test('a contact the citizen typed for this complaint still wins', async () => {
    const { eReport, sent } = loadWithStubbedHttp();
    await eReport.fileReport({
      category: 'Test',
      description: 'Test',
      patient: { phone: '+639090000001' },
      contact: '+639171234567',
    });
    const submit = sent.find((r) => r.url.endsWith('/api/integration/submit_complaint'));
    assert.equal(submit.body.mobile, '639171234567');
  });

  await t.test('with no contact resolved it still falls back to the patient number', async () => {
    // The production shape: NOTIFY_DEFAULT_PHONE unset means recipientFor returns patient.phone,
    // so this path must not regress into filing an empty mobile.
    const { eReport, sent } = loadWithStubbedHttp();
    await eReport.fileReport({ category: 'Test', description: 'Test', patient: { phone: '+639171234567' }, contact: null });
    const submit = sent.find((r) => r.url.endsWith('/api/integration/submit_complaint'));
    assert.equal(submit.body.mobile, '639171234567');
  });
});
