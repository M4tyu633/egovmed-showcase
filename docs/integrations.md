# eGov integrations

Credentials and current service documentation are available through the [eGov API Developer Portal](https://platforms.e.gov.ph/dashboard/developers). Each service has its own credit allowance. Check the portal before live testing; do not assume one service's balance applies to another.

## Gateway configuration

| Service | Backend variable | Gateway base |
| --- | --- | --- |
| eGov SSO | `EGOVPH_BASE_URL` | `https://platforms-api.e.gov.ph/egov-sso` |
| eGov AI | `EGOV_AI_BASE_URL` | `https://platforms-api.e.gov.ph/egov-ai` |
| eVerify | `EVERIFY_BASE_URL` | `https://platforms-api.e.gov.ph/everify` |
| Face Liveness | `FACE_LIVENESS_BASE_URL` | `https://platforms-api.e.gov.ph/face-liveness` |
| eMessage | `EMESSAGE_BASE_URL` | `https://platforms-api.e.gov.ph/emessage` |
| eGovPay | `EGOVPAY_BASE_URL` | `https://platforms-api.e.gov.ph/egovpay` |
| eReport | `EREPORT_BASE_URL` | `https://platforms-api.e.gov.ph/ereport` |
| eGovChain | `EGOVCHAIN_RPC_URL` | `https://platforms-api.e.gov.ph/egovchain/{token}` |

The blockchain URL contains a credential and must stay server-side. Copy the complete RPC URL from the portal into a private environment variable. No usable key is included in this repository.

## Sign-in

The official eGov login widget collects the sandbox mobile number, one-time code, and PIN. The frontend passes the resulting exchange code to `POST /auth/egov/exchange`. The backend exchanges it at `/api/token`, fetches the profile from `/api/partner/sso_authentication`, and issues an application session.

The widget receives the public partner code. The partner secret is used only by the backend. Expired or reused exchange codes require a fresh sign-in.

## Symptom triage

The eGov AI adapter obtains a bearer token and calls `/api/v1/egov/integration/ai_assistant/generate`. It requests structured specialty, urgency, reasoning, and red flags. The response is parsed and validated; a bilingual rule-based classifier supplies fallback behavior and an urgency floor.

A returned triage result alone does not prove an upstream AI call succeeded: the adapter deliberately falls back when the provider is unavailable or its output is unusable. Provider mode and response provenance should be inspected when validating an integration.

## Identity and liveness

`VERIFICATION_METHOD=everify` selects the eVerify Web SDK. Its session identifier is registered with the backend and used for demographic verification. A session from the separate hosted Face Liveness service is not interchangeable with an eVerify SDK session.

The hosted path uses `POST /v1/liveness/session` and `GET /v1/liveness/result/{token}`. Sessions are tied to a patient, expire, and can be claimed only once. Consent is recorded before identity verification.

The eVerify SDK script is currently loaded from `https://hackathon-everify-face-liveness.e.gov.ph/js/everify-liveness-sdk.min.js`. This is the provider's browser SDK asset, not a legacy backend API base. It remains in the script loader and content security policy because the capture flow depends on it.

Official eGov SSO sandbox personas are fictional. The application marks these accounts from their SSO provenance and uses the sandbox liveness path without asserting that a tester's face matches the fictional person's PhilSys record. A real account still requires the demographic verification path.

## Notifications

eMessage delivers appointment confirmations, reminders, and report one-time codes through `/messaging/v1/sms/push`. Notification failures do not cancel a completed booking. Report filing requires a valid one-time code and fails if verification cannot be completed.

Sandbox phone numbers do not receive carrier SMS. `NOTIFY_DEFAULT_PHONE` is an optional controlled-demo destination for accounts without an explicitly updated phone number. Leave it blank for ordinary use. A configured destination may also be included as the complainant contact when filing a report.

## Payments

The backend creates an eGovPay transaction, stores the bill, and returns its hosted checkout URL. The payment token and signing material stay server-side. The application checks provider status before accepting settlement; a callback by itself cannot mark a bill paid.

A fully covered bill is settled locally without creating a zero-value gateway transaction. Benefit eligibility and discount rules are prototype application logic, not live PhilHealth, White Card, or SSS integrations.

## Record fingerprints

The eGovChain adapter signs a zero-value transaction containing the record's SHA-256 fingerprint. Writing an anchor performs one nonce read and one transaction broadcast. Explicit verification performs one transaction read and checks the content, signer, recipient, and mined block.

Do not add receipt polling or provider subscriptions. Credit accounting and allowances are service-specific; keep each live action bounded even when a service has a daily allowance.

## Reports

After one-time-code verification, the backend submits a complaint to eReport and stores the returned case number. The configured complaint type and location must match the portal's accepted values.

Government-side report lookup requires a separate complainant verification flow. This adapter does not mirror assigned, resolved, or other government queue statuses. The UI exposes eGovMed's local open/escalated state; escalation marks a local follow-up state rather than sending a new government action.
