# Backend

Node.js and Express API for authentication, triage, identity, appointments, payments, medical records, messaging, and service concerns.

## Run

```bash
npm ci
node -e "require('fs').copyFileSync('.env.example', '.env')"
npm run dev
```

The default environment uses mock integrations and temporary in-memory storage. The API listens on `http://localhost:4000`. Run `npm test` for the regression suite.

## Main endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | Health response |
| `GET /auth/config` | Public sign-in and verification configuration |
| `POST /auth/egov/exchange` | Exchange an eGov SSO code for an application session |
| `/patients/me` | Patient profile and contact information |
| `/triage` | Symptom classification |
| `/identity` | Consent, liveness, and identity verification |
| `/appointments` | Bookings and reminders |
| `/payments` | Bills, checkout, and provider status |
| `/records` | Identity-gated medical records and integrity checks |
| `/messages` | Patient messages |
| `/reports` | One-time-code-gated filing and local case tracking |
| `GET /integrations/status` | Administrative integration configuration, with secrets omitted |

Patient routes require `Authorization: Bearer <session-token>`. Administrative routes require `x-admin-key`. The public health/authentication routes and payment callback have their own validation and access behavior.

See [configuration](../docs/configuration.md), [architecture](../docs/architecture.md), and [integrations](../docs/integrations.md).
