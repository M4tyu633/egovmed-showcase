# Security and prototype limitations

## Implemented controls

- **Patient isolation:** routes authorize resource access against the authenticated patient. Guessing another patient's record, appointment, payment, or case identifier does not grant access.
- **Encrypted content:** medical payloads, symptom text, and complaint narratives are encrypted using AES-256-GCM. On-chain data is restricted to a record fingerprint.
- **Consent and audit:** identity verification records consent, and record access creates an audit entry. Message bodies are excluded from audit logs.
- **Single-use verification:** liveness sessions and report one-time codes are patient-bound, expire, and reject replay. Redis provides an atomic claim operation for concurrent requests.
- **Payment integrity:** callbacks are non-authoritative. Status must be reconciled with the payment provider before a bill is treated as settled.
- **Request controls:** Zod validation, JSON size and complexity limits, route-specific rate limits, JWT verification, and constant-time administrative key comparison protect API boundaries.
- **Browser and transport controls:** explicit CORS origins, security headers, and an HTTPS-only outbound transport restrict cross-origin and provider traffic. Loopback HTTP is allowed for local development.
- **Triage fallback:** deterministic rules enforce an urgency floor when upstream classification is degraded or invalid.

The regression suite in `backend/test` exercises these controls with local fixtures and mocked integrations. Passing tests are evidence for those cases, not a security certification or proof of clinical safety.

## Production work

The proposed PGH pilot has not established a live hospital connection. Appointment capacity, queue assignment, sample medical records, and benefit eligibility are prototype workflows. Connecting them to real hospital systems requires agreed data models, access controls, and operational ownership.

Triage is decision support. The keyword fallback is not a clinically validated model and does not reliably understand every negation, context, or language variation. A qualified clinician must confirm routing and urgency.

Record fingerprint verification detects a mismatch against an anchored transaction; it does not prove that the original clinical content was accurate. Encryption-key rotation needs a migration process before it is used with persistent clinical data.

eReport's visible status is local application state. The prototype does not synchronize government-side case resolution. SMS delivery and identity verification depend on provider availability and the supplied account data.

## Evaluation data

Use fictional symptoms and official sandbox accounts for evaluation. Mock mode provides seeded sample records and simulated benefits. Real patient information is not needed to review this repository.

## Interface assets

Application illustrations and icons are included with the source. GCash and Maya marks identify payment channels; the app does not imply endorsement by those providers. Confirm permission to redistribute or use third-party brand assets before a production release.
