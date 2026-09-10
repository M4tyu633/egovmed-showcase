'use strict';
const chain = require('../integrations/egovChain');
const egovAi = require('../integrations/egovAi');
const triageService = require('./triageService');
const { getStore, COLLECTIONS } = require('../store');
const { sha256Hex, encryptJson, decryptJson, randomId } = require('../lib/crypto');
const { notFound } = require('../lib/errors');

/** Canonical content hash of a record — recomputed at verify time to prove the off-chain data is untampered. */
function contentHash(record, data) {
  if (record.encryptedVersion === 2) {
    const payload = decryptJson(record.encrypted);
    return sha256Hex({
      patientId: record.patientId,
      type: payload.type,
      title: payload.title,
      sourceFacility: payload.sourceFacility,
      data: data === undefined ? payload.data : data,
      summary: payload.summary,
    });
  }
  return sha256Hex({
    patientId: record.patientId,
    type: record.type,
    title: record.title,
    sourceFacility: record.sourceFacility,
    data: data === undefined ? (record.encrypted ? decryptJson(record.encrypted) : null) : data,
  });
}

/**
 * Create a health record: PHI is encrypted OFF-CHAIN; only the sha256 fingerprint is
 * anchored on eGovChain. This is what makes labs from other hospitals trustable → no repeat labs.
 */
async function createRecord({ patientId, type, title, sourceFacility, data, summary }) {
  const store = getStore();
  const now = new Date().toISOString();
  const payload = { type, title, sourceFacility: sourceFacility || 'PGH', data: data ?? null, summary: summary || null };
  const hash = sha256Hex({ patientId, ...payload });
  // Only a non-identifying record-type tag goes to the anchor — never patientId/title (see egovChain.js).
  const anchor = await chain.anchorHash(hash, { type });

  const record = {
    id: randomId('rec_'),
    patientId,
    // v2 encrypts clinical metadata as well as the structured payload. Legacy records remain readable.
    encryptedVersion: 2,
    encrypted: encryptJson(payload),
    anchor,
    createdAt: now,
    updatedAt: now,
  };
  await store.create(COLLECTIONS.RECORDS, record);
  return present(record);
}

async function listRecords(patientId) {
  const store = getStore();
  const records = await store.findAll(COLLECTIONS.RECORDS, (r) => r.patientId === patientId);
  return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(present);
}

// Ownership-scoped single-record read. 404 (not 403) on mismatch so record existence isn't disclosed.
async function getRecord(id, { includeData = false, patientId } = {}) {
  const store = getStore();
  const record = await store.findById(COLLECTIONS.RECORDS, id);
  if (!record) throw notFound('Record not found');
  if (patientId && record.patientId !== patientId) throw notFound('Record not found');
  const view = present(record);
  if (includeData && record.encrypted) {
    const payload = decryptJson(record.encrypted);
    view.data = record.encryptedVersion === 2 ? payload.data : payload;
  }
  return view;
}

/**
 * Confirm a record is untampered AND anchored → drives the "verified from another hospital ✓" badge.
 * Real tamper-evidence: recompute the content hash NOW and compare to the anchored hash — a badge is
 * only shown when the off-chain data still matches the fingerprint on eGovChain.
 */
async function verifyRecord(id, patientId) {
  const store = getStore();
  const record = await store.findById(COLLECTIONS.RECORDS, id);
  if (!record) throw notFound('Record not found');
  if (patientId && record.patientId !== patientId) throw notFound('Record not found');

  let integrityOk = false;
  try {
    integrityOk = contentHash(record) === record.anchor?.hash;
  } catch { integrityOk = false; }
  const onChain = await chain.verifyAnchor(record.anchor?.hash, record.anchor?.txHash);
  const verified = integrityOk && onChain.verified;

  // A successful explicit check is durable: the chain is immutable, so later summary reads can
  // recompute local integrity and use this last-known confirmation without spending another RPC
  // credit per lab. Never turn a prior confirmation off for a transient RPC outage.
  if (onChain.verified && !record.anchor?.verified) {
    record.anchor = { ...record.anchor, verified: true, verifiedAt: new Date().toISOString() };
    await store.update(COLLECTIONS.RECORDS, id, { anchor: record.anchor });
  }

  const view = present(record);
  return {
    recordId: id,
    title: view.title,
    sourceFacility: view.sourceFacility,
    verified,
    integrityOk,
    anchoredOnChain: onChain.verified,
    badge: verified ? `Lab result verified from ${view.sourceFacility} ✓` : 'Unverified',
    anchor: record.anchor,
  };
}

/**
 * Doctor view: AI-summarized history plus the labs whose last explicit chain check passed.
 *
 * Do not call verifyRecord() in a loop here. In live mode each check is a metered eth_call, and
 * merely opening Records used to fan out one RPC request per lab. A citizen can still perform a
 * fresh, single-record check by opening that record; this summary intentionally uses the stored
 * last-known anchor status and recomputes local integrity without touching the gateway.
 */
async function buildDoctorSummary(patientId) {
  const store = getStore();
  const [rawRecords, triage] = await Promise.all([
    store.findAll(COLLECTIONS.RECORDS, (r) => r.patientId === patientId),
    triageService.listForPatient(patientId),
  ]);
  const records = rawRecords
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(present);
  const summary = await egovAi.summarizeHistory({ records, triage });
  const verifiedLabs = rawRecords.flatMap((raw) => {
    if (!raw.anchor?.verified) return [];
    let integrityOk = false;
    try { integrityOk = contentHash(raw) === raw.anchor.hash; } catch { integrityOk = false; }
    if (!integrityOk) return [];
    const lab = present(raw);
    return lab.type === 'lab' ? [{ id: lab.id, title: lab.title, sourceFacility: lab.sourceFacility }] : [];
  });
  return { summary, verifiedLabs, recordCount: records.length, triageCount: triage.length };
}

function present(r) {
  const { encrypted, encryptedVersion, ...rest } = r;
  if (r.encryptedVersion === 2 && encrypted) {
    const payload = decryptJson(encrypted);
    return { ...rest, ...payload, data: undefined, hasData: payload.data !== null && payload.data !== undefined };
  }
  return { ...rest, hasData: !!encrypted };
}

module.exports = { createRecord, listRecords, getRecord, verifyRecord, buildDoctorSummary };
