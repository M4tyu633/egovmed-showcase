'use strict';
const eMessage = require('../integrations/eMessage');
const { getStore, COLLECTIONS } = require('../store');
const { randomId } = require('../lib/crypto');
const { notFound, conflict } = require('../lib/errors');
// One place decides who a notification is addressed to — see lib/recipient.js for the order.
const { recipientFor } = require('../lib/recipient');

const messageAudit = (notification, patientId, kind, meta) => ({
  id: notification.id,
  patientId,
  kind,
  status: notification.status,
  channel: notification.channel,
  provider: notification.provider,
  createdAt: new Date().toISOString(),
  // Non-PHI context (department/hospital/queue no.) only — never the message body — so the
  // Messages screen can render a real subject line instead of a generic "You have an update".
  ...(meta ? { meta } : {}),
});

async function book({ patientId, specialty, hospital = 'PGH', scheduledFor, triageId }) {
  const store = getStore();
  const patient = await store.findById(COLLECTIONS.PATIENTS, patientId);
  if (!patient) throw notFound('Patient not found');

  // Same ownership check paymentService.createBill applies to appointmentId — otherwise a caller
  // could attach their booking to any known triage id, corrupting attribution. 404 (not 403) on
  // mismatch so the triage result's existence isn't disclosed.
  if (triageId) {
    const triage = await store.findById(COLLECTIONS.TRIAGE, triageId);
    if (!triage || triage.patientId !== patientId) throw notFound('Triage result not found');
  }

  // Atomic per-(hospital,specialty) queue number — no read-then-count race.
  const queueNumber = await store.incr(`queue:${hospital}:${specialty}`);

  const appt = {
    id: randomId('apt_'),
    patientId,
    specialty,
    hospital,
    scheduledFor: scheduledFor || null,
    triageId: triageId || null,
    queueNumber,
    status: 'booked',
    createdAt: new Date().toISOString(),
  };
  await store.create(COLLECTIONS.APPOINTMENTS, appt);

  // Notify the verified contact — BEST EFFORT. A failed/absent notification must never
  // fail the booking or leave it orphaned (the appointment is the source of truth).
  const { to, channel } = recipientFor(patient);
  let notification;
  if (!to) {
    notification = { status: 'skipped', reason: 'no_verified_contact' };
  } else {
    try {
      notification = await eMessage.send({
        to,
        channel,
        subject: 'eGovMed appointment confirmed',
        body: `Hi ${patient.firstName}, your ${specialty} appointment at ${hospital} is booked. Queue #${queueNumber}.`,
      });
      await store.create(COLLECTIONS.MESSAGES, messageAudit(notification, patientId, 'confirmation', { specialty, hospital, queueNumber, scheduledFor: appt.scheduledFor }));
    } catch (err) {
      notification = { status: 'failed', reason: 'notification_failed' };
    }
  }

  if (notification.id) {
    const { id, status, channel, provider } = notification;
    notification = { id, status, channel, provider };
  }
  return { appointment: appt, notification };
}

async function listForPatient(patientId) {
  const store = getStore();
  return (await store.findAll(COLLECTIONS.APPOINTMENTS, (a) => a.patientId === patientId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function sendReminder(appointmentId, patientId) {
  const store = getStore();
  const appt = await store.findById(COLLECTIONS.APPOINTMENTS, appointmentId);
  if (!appt || appt.patientId !== patientId) throw notFound('Appointment not found');
  const patient = await store.findById(COLLECTIONS.PATIENTS, appt.patientId);
  if (!patient) throw notFound('Patient not found');
  const recipient = recipientFor(patient);
  if (!recipient.to) return { status: 'skipped', reason: 'no_verified_contact' };
  const notification = await eMessage.send({
    to: recipient.to,
    channel: recipient.channel,
    subject: 'Appointment reminder',
    body: `Reminder: your ${appt.specialty} appointment at ${appt.hospital}. Queue #${appt.queueNumber}.`,
  });
  await store.create(COLLECTIONS.MESSAGES, messageAudit(notification, appt.patientId, 'reminder', { specialty: appt.specialty, hospital: appt.hospital, queueNumber: appt.queueNumber, scheduledFor: appt.scheduledFor }));
  const { id, status, channel, provider } = notification;
  return { id, status, channel, provider };
}

async function updateStatus(appointmentId, status, patientId) {
  const store = getStore();
  const appt = await store.findById(COLLECTIONS.APPOINTMENTS, appointmentId);
  if (!appt || appt.patientId !== patientId) throw notFound('Appointment not found');
  if (status !== 'cancelled' || appt.status !== 'booked') {
    throw conflict(`Cannot transition appointment from ${appt.status} to ${status}`);
  }
  return store.update(COLLECTIONS.APPOINTMENTS, appointmentId, { status });
}

module.exports = { book, listForPatient, sendReminder, updateStatus };
