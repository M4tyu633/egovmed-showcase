import test from 'node:test';
import assert from 'node:assert/strict';
import { demoRequest as request } from '../src/lib/demo.js';

test('offline patient journey completes without network services', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('The offline demo must not call fetch.'); };
  try {
    assert.equal((await request('/auth/config')).mode, 'mock');
    const login = await request('/auth/egov/exchange', { method: 'POST' });
    assert.equal(login.patient.firstName, 'Rosa');
    login.patient.firstName = 'Changed outside the adapter';
    assert.equal((await request('/patients/me')).firstName, 'Rosa');
    const triage = await request('/triage', { method: 'POST', body: { text: 'mild cough', language: 'en' } });
    assert.equal(triage.engine, 'offline-demo');
    assert.equal(triage.confidence, null);
    await assert.rejects(request('/appointments', { method: 'POST', body: { specialty: triage.specialty } }));
    const capture = await request('/identity/liveness', { method: 'POST' });
    assert.equal(capture.url, undefined);
    assert.equal((await request('/identity/verify', { method: 'POST', body: { livenessSessionId: capture.sessionId } })).demo, true);
    await assert.rejects(request('/identity/verify', { method: 'POST', body: { livenessSessionId: capture.sessionId } }));
    const { appointment } = await request('/appointments', { method: 'POST', body: { specialty: triage.specialty, hospital: 'PGH' } });
    assert.equal((await request('/appointments')).length, 1);
    const payment = await request('/payments', { method: 'POST', body: { billAmount: 300, channel: 'GCash', appointmentId: appointment.id } });
    assert.equal(payment.status, 'paid');
    assert.equal(payment.provider, 'mock');
    assert.equal(payment.checkoutUrl, null);
    assert.equal(payment.balance, 60);
    assert.equal((await request(`/payments/${payment.id}/status`)).id, payment.id);
    assert.equal((await request('/records')).length, 3);
    const otp = await request('/reports/otp', { method: 'POST' });
    await assert.rejects(request('/reports', { method: 'POST', body: { challengeId: otp.challengeId, code: '000000' } }));
    const report = await request('/reports', { method: 'POST', body: { challengeId: otp.challengeId, code: otp.mockCode, category: 'Sample report', description: 'A fictional demonstration.' } });
    assert.equal(report.demo, true);
    assert.equal((await request(`/reports/${report.caseNumber}`)).caseNumber, report.caseNumber);
    await assert.rejects(request('/reports', { method: 'POST', body: { challengeId: otp.challengeId, code: otp.mockCode } }));
    await assert.rejects(request('/not-a-demo-endpoint'));
  } finally { globalThis.fetch = original; }
});
