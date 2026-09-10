'use strict';
const egovAi = require('../integrations/egovAi');
const { getStore, COLLECTIONS } = require('../store');
const { randomId, encryptJson, decryptJson } = require('../lib/crypto');
const { notFound } = require('../lib/errors');

async function runTriage({ patientId, text, language = 'auto' }) {
  const store = getStore();
  let patientContext = {};
  if (patientId) {
    const patient = await store.findById(COLLECTIONS.PATIENTS, patientId);
    if (patient) patientContext = { age: ageFrom(patient.birthDate), sex: patient.sex };
  }

  const result = await egovAi.classifySymptoms({ text, language, patientContext });

  const clinical = {
    inputSymptoms: text,
    language,
    specialty: result.specialty,
    urgency: result.urgency,
    redFlags: result.redFlags,
    summaryEn: result.summaryEn,
    reasoning: result.reasoning,
    recommendedAction: result.recommendedAction,
    confidence: result.confidence,
    engine: result.engine,
  };
  const record = {
    id: randomId('tri_'),
    patientId: patientId || null,
    encryptedVersion: 1,
    encrypted: encryptJson(clinical),
    nurseConfirmed: false, // decision support only — a nurse confirms
    createdAt: new Date().toISOString(),
  };
  await store.create(COLLECTIONS.TRIAGE, record);
  return present(record);
}

async function listForPatient(patientId) {
  const store = getStore();
  return (await store.findAll(COLLECTIONS.TRIAGE, (t) => t.patientId === patientId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(present);
}

async function confirmByNurse(triageId, { confirmedSpecialty, note } = {}) {
  const store = getStore();
  const t = await store.findById(COLLECTIONS.TRIAGE, triageId);
  if (!t) throw notFound('Triage result not found');
  const view = present(t);
  const updated = await store.update(COLLECTIONS.TRIAGE, triageId, {
    nurseConfirmed: true,
    encryptedVersion: 1,
    encrypted: encryptJson({
      inputSymptoms: view.inputSymptoms,
      language: view.language,
      specialty: view.specialty,
      urgency: view.urgency,
      redFlags: view.redFlags,
      summaryEn: view.summaryEn,
      reasoning: view.reasoning,
      recommendedAction: view.recommendedAction,
      confidence: view.confidence,
      engine: view.engine,
      confirmedSpecialty: confirmedSpecialty || view.specialty,
      nurseNote: note || null,
    }),
  });
  return present(updated);
}

function present(t) {
  if (t?.encryptedVersion === 1 && t.encrypted) {
    const { encrypted, encryptedVersion, ...rest } = t;
    return { ...rest, ...decryptJson(encrypted) };
  }
  return t;
}

function ageFrom(birthDate) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d)) return null;
  const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5));
  return age >= 0 && age <= 130 ? age : null; // reject future/absurd dates
}

module.exports = { runTriage, listForPatient, confirmByNurse };
