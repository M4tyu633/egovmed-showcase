import { fallbackTriage } from './triageFallback.js';

// All data is local demo state. Field shapes follow the original backend services.
const now = () => new Date().toISOString();
let sequence = 1;
const id = (prefix) => `demo_${prefix}_${sequence++}`;
const patient = { id: 'demo_patient', firstName: 'Rosa', middleName: '', lastName: 'Reyes', phone: '+639000000000', email: 'rosa@example.com', dateOfBirth: '1970-05-12', sex: 'F', sandboxAccount: true, identityVerified: false, benefits: { philhealth: { active: true }, whiteCard: { active: false }, sss: { active: true } } };
const appointments = [], payments = [], messages = [], reports = [];
let livenessSession = null, otp = null;
const records = [
  { id: 'rec_demo_cbc', type: 'lab', title: 'Complete Blood Count (CBC)', sourceFacility: 'Ospital ng Maynila', createdAt: '2026-06-12T09:15:00.000Z', summary: 'Sample record from the original demo: mild anemia noted.', data: { hemoglobin: '11.2 g/dL', wbc: '7.5 x10^9/L', platelets: '250 x10^9/L' } },
  { id: 'rec_demo_lipid', type: 'lab', title: 'Lipid Panel', sourceFacility: 'Makati Medical Center', createdAt: '2026-05-03T10:40:00.000Z', summary: 'Sample lipid panel from the original demo.', data: { total_cholesterol: '215 mg/dL', ldl: '138 mg/dL', hdl: '48 mg/dL', triglycerides: '150 mg/dL' } },
  { id: 'rec_demo_ecg', type: 'lab', title: 'ECG Report', sourceFacility: 'Philippine Heart Center', createdAt: '2026-04-21T14:20:00.000Z', summary: 'Sample record from the original demo: normal sinus rhythm.', data: { rhythm: 'Normal sinus rhythm', rate_bpm: 72, pr_interval_ms: 160, qrs_duration_ms: 92, qt_interval_ms: 380 } },
].map(record => ({ ...record, isDemo: true, anchor: { verified: true, provider: 'offline-demo', demo: true }, hash: 'demo-record-fingerprint' }));

// Same illustrative benefit rates as the original paymentService. Not live coverage.
const rules = { whiteCard: ['White Card', 1], aics: ['DSWD AICS', .5], philhealth: ['PhilHealth', .6], ecc: ['ECC', .4], owwa: ['OWWA', .3], fourps: ['4Ps', .15], sss: ['SSS', .2], gsis: ['GSIS', .2], pwd: ['PWD ID discount', .2], senior: ['Senior Citizen discount', .2], soloParent: ['Solo Parent ID discount', .1], pagibig: ['Pag-IBIG', .1] };
function quote(amount) {
  const total = Number(amount);
  if (!Number.isFinite(total) || total < 0) throw new Error('Enter a valid demo bill amount.');
  let balance = total;
  const applied = [];
  for (const [program, [label, rate]] of Object.entries(rules)) {
    if (!patient.benefits[program]?.active) continue;
    const covered = Math.round(Math.min(balance, total * rate) * 100) / 100;
    balance = Math.round((balance - covered) * 100) / 100;
    applied.push({ program, label, amount: covered, mock: true });
  }
  return { applied, coveredTotal: total - balance, balance, source: 'mock', mock: true, note: 'Illustrative demo benefits, not verified coverage.' };
}
function requireItem(items, key, value) {
  const item = items.find(entry => entry[key] === value);
  if (!item) throw new Error('This demo item was not found. Start a new demo visit.');
  return item;
}

export async function demoRequest(path, { method = 'GET', body = {} } = {}) {
  let result;
  if (path === '/auth/config') result = { mode: 'mock', verificationMethod: 'face-liveness', demo: true };
  else if (path === '/auth/egov/exchange') {
    appointments.length = 0; payments.length = 0; messages.length = 0; reports.length = 0;
    patient.identityVerified = false; livenessSession = null; otp = null;
    result = { token: 'offline-demo-session', patient };
  }
  else if (path === '/patients/me') { if (method === 'PATCH') Object.assign(patient, body); result = patient; }
  else if (path.startsWith('/patients/me/benefits/')) {
    const key = decodeURIComponent(path.split('/').pop());
    if (!(key in rules)) throw new Error('Unknown demo benefit.');
    patient.benefits[key] = { active: method !== 'DELETE', source: 'mock' }; result = patient;
  }
  else if (path === '/triage') result = { ...fallbackTriage(body.text, body.language), id: id('triage'), engine: 'offline-demo', confidence: null, reasoning: 'Interactive demonstration using the original rule-based routing. No AI service was called; this is not medical advice.', demo: true };
  else if (path === '/identity/liveness') { livenessSession = id('liveness'); result = { sessionId: livenessSession, provider: 'mock', demo: true }; }
  else if (path === '/identity/verify') {
    if (!livenessSession || body.livenessSessionId !== livenessSession) throw new Error('Start the demo identity step first.');
    livenessSession = null; patient.identityVerified = true; result = { verified: true, provider: 'mock', demo: true };
  }
  else if (path === '/appointments' && method === 'POST') {
    if (!patient.identityVerified) throw new Error('Complete the simulated identity step first.');
    const appointment = { id: id('appointment'), patientId: patient.id, specialty: body.specialty, hospital: body.hospital || 'PGH', scheduledFor: body.scheduledFor || null, queueNumber: appointments.length + 1, status: 'booked', createdAt: now(), demo: true };
    appointments.push(appointment);
    const notification = { id: id('message'), kind: 'confirmation', status: 'sent', channel: 'demo', provider: 'mock', createdAt: now(), meta: { specialty: appointment.specialty, hospital: appointment.hospital, queueNumber: appointment.queueNumber }, demo: true };
    messages.push(notification); result = { appointment, notification };
  }
  else if (path === '/appointments') result = appointments;
  else if (path === '/payments/quote') result = quote(body.billAmount);
  else if (path === '/payments' && method === 'POST') {
    if (body.appointmentId) requireItem(appointments, 'id', body.appointmentId);
    const benefit = quote(body.billAmount);
    const payment = { id: id('payment'), patientId: patient.id, appointmentId: body.appointmentId || null, billAmount: body.billAmount, ...benefit, benefitsApplied: benefit.applied, channel: body.channel, status: 'paid', provider: 'mock', reference: id('receipt'), checkoutUrl: null, createdAt: now(), demo: true };
    payments.push(payment); result = payment;
  }
  else if (path === '/payments') result = payments;
  else if (/^\/payments\/.+\/status$/.test(path)) result = requireItem(payments, 'id', decodeURIComponent(path.split('/')[2]));
  else if (path === '/messages') result = messages;
  else if (/^\/messages\/.+\/reply$/.test(path)) {
    const message = requireItem(messages, 'id', decodeURIComponent(path.split('/')[2]));
    message.replies = [...(message.replies || []), { id: id('reply'), text: String(body.text || ''), createdAt: now(), provider: 'mock', demo: true }]; result = message;
  }
  else if (path === '/records/doctor-summary') result = { summary: 'Demo health summary: three sample records from the original hackathon fixtures. No live AI analysis was performed.\nUse the record cards to inspect the sample values and their source facilities.', verifiedLabs: records.map(r => ({ title: r.title, sourceFacility: r.sourceFacility })), recordCount: records.length, triageCount: 0, demo: true };
  else if (path === '/records' && method === 'POST') { const record = { ...body, id: id('record'), createdAt: now(), isDemo: true, anchor: { verified: true, demo: true, provider: 'mock' } }; records.push(record); result = record; }
  else if (path === '/records') result = records;
  else if (/^\/records\/.+\/verify$/.test(path)) { requireItem(records, 'id', decodeURIComponent(path.split('/')[2])); result = { verified: true, provider: 'mock', demo: true, hash: 'demo-record-fingerprint' }; }
  else if (path.startsWith('/records/')) result = requireItem(records, 'id', decodeURIComponent(path.split('/')[2]));
  else if (path === '/reports/otp') { otp = id('otp'); result = { challengeId: otp, maskedPhone: 'Demo number — no SMS sent', mockCode: '123456', demo: true }; }
  else if (path === '/reports' && method === 'POST') {
    if (!otp || body.challengeId !== otp || body.code !== '123456') throw new Error('For this demo, use the displayed code 123456.');
    otp = null;
    const report = { id: id('report'), caseNumber: `DEMO-${String(reports.length + 1).padStart(4, '0')}`, category: body.category, description: body.description, status: 'received', createdAt: now(), updatedAt: now(), timeline: [{ status: 'received', at: now(), note: 'Saved in this demonstration only. No real report was submitted.' }], demo: true };
    reports.push(report); result = report;
  }
  else if (path === '/reports') result = { reports };
  else if (path.startsWith('/reports/')) result = requireItem(reports, 'caseNumber', decodeURIComponent(path.split('/')[2]));
  else throw new Error('This action is unavailable in the offline demo.');
  return JSON.parse(JSON.stringify(result));
}
