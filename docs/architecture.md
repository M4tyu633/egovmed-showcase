# Architecture

eGovMed separates the patient interface, application logic, storage, and government integrations. The Express API can support an additional client, such as an assisted kiosk, without duplicating business logic.

## System flow

```mermaid
flowchart LR
    Patient[Patient] --> UI[React patient application]
    UI --> Widget[eGov SSO login widget]
    Widget -->|Exchange code| UI
    UI -->|HTTPS requests| API[Express API]
    API --> Validation[Validation, authentication, rate limits]
    Validation --> Services[Application services]
    Services --> Store[(Encrypted records and application state)]
    Services --> Adapters[eGov integration adapters]
    Adapters --> Gateway[API Developer Portal gateway]
    Gateway --> Gov[eGov services]
```

The live backend stores sessions, records, consent receipts, notifications, and workflow state in Upstash Redis. Local evaluation uses the same storage interface with an in-memory implementation. The frontend receives public profile fields and a session JWT; government partner secrets remain on the backend.

## Patient journey and integration points

```mermaid
flowchart TD
    Login[Sign in] --> Symptoms[Describe symptoms]
    Symptoms --> Triage[Review specialty and urgency]
    Triage --> Consent[Give verification consent]
    Consent --> Verify[Verify identity]
    Verify --> Book[Book appointment]
    Book --> Pay[Pay amount due]
    Verify --> Records[Access medical records]
    Login --> Report[File a service concern]

    Login -.-> SSO[eGov SSO]
    Triage -.-> AI[eGov AI]
    Verify -.-> Identity[Face Liveness and eVerify]
    Book -.-> SMS[eMessage]
    Pay -.-> Payment[eGovPay]
    Records -.-> Chain[eGovChain]
    Report -.-> OTP[eMessage one-time code]
    Report -.-> Complaints[eReport]
```

## Data boundaries

- **Browser:** interface state, public configuration, and a session-scoped application token. The SSO exchange code is consumed immediately.
- **Backend:** validates input, authorizes access to each patient's resources, applies workflow rules, and calls government services.
- **Storage:** clinical record payloads, symptom text, and complaint narratives are encrypted with AES-256-GCM. Operational fields needed for lookup remain separate from encrypted content.
- **Blockchain:** only a record fingerprint is placed in transaction calldata. Clinical text and patient identifiers are not written on-chain.
- **External services:** receive the data needed for the requested operation, such as demographics for identity matching or the destination number for an SMS.

## Record integrity

```mermaid
sequenceDiagram
    participant Client
    participant API as eGovMed API
    participant Store as Encrypted storage
    participant Chain as eGovChain
    Client->>API: Create medical record
    API->>API: Canonicalize content and calculate SHA-256 hash
    API->>Chain: Read signer nonce
    API->>Chain: Submit signed transaction containing hash
    API->>Store: Save encrypted content and transaction reference
    Client->>API: Verify record
    API->>Store: Read and decrypt record
    API->>Chain: Read transaction once
    API->>API: Compare hash, signer, recipient, and inclusion in a block
    API-->>Client: Verification result
```

The current adapter uses signed transaction calldata and does not require a deployed application contract. Submission and verification are separate operations; a submitted transaction is not presented as confirmed. No background blockchain polling is used.

## Code organization

Routes in `backend/src/routes` handle HTTP concerns. Services in `backend/src/services` implement booking, payments, identity, records, and reports. Adapters in `backend/src/integrations` isolate each provider's protocol. Storage drivers implement a shared interface in `backend/src/store`.

The frontend's `App.jsx` coordinates screen state and backend actions. Screens render that state; shared components provide navigation, input, and overlays. English and Tagalog copy lives in `frontend/src/i18n/dict.js`.
