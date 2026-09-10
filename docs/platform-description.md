eGovMed brings the public-hospital patient journey into one app. Patients can describe symptoms, find a department, verify their identity, book a visit, pay, and access their medical records. The interface supports English and Tagalog, with symptom input in Taglish too.

Built by Bisaya-Hackers, a Top 30 team in eGov Hackathon 2026, the prototype is designed around a proposed Philippine General Hospital (PGH) pilot.

## System architecture

React handles the patient interface. The Express backend validates requests, checks patient access, stores encrypted medical content, and connects to the eGov APIs. Local evaluation uses mock adapters and temporary storage.

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

## Patient journey and eGov API integration

Solid arrows show the patient journey. Dotted arrows identify the service used at each step.

```mermaid
flowchart TD
    Login[Sign in] --> Symptoms[Describe symptoms]
    Symptoms --> Triage[Review suggested department and urgency]
    Triage --> Consent[Give consent]
    Consent --> Identity[Verify identity]
    Identity --> Book[Book a visit]
    Book --> Pay[Pay amount due]
    Identity --> Records[Access medical records]
    Login --> Report[Submit a service concern]

    Login -.-> SSO[eGov SSO]
    Triage -.-> AI[eGov AI]
    Identity -.-> Face[Face Liveness]
    Identity -.-> Verify[eVerify]
    Book -.-> Message[eMessage]
    Pay -.-> Payment[eGovPay]
    Records -.-> Chain[eGovChain]
    Report -.-> Message
    Report -.-> Complaint[eReport]

    classDef service fill:#123e46,color:#ffffff,stroke:#40b8a5
    class SSO,AI,Face,Verify,Message,Payment,Chain,Complaint service
```

## How medical records are protected

Medical content stays encrypted off-chain. eGovChain stores a SHA-256 fingerprint, which can be compared with the stored record to detect changes. Submission and confirmation are separate steps.

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

## Source code and local evaluation

The public repository includes the application source, setup instructions, environment examples, architecture diagrams, API integration notes, and backend tests. It runs locally in mock mode by default, so reviewers do not need government API credentials or credits.

[View the public repository](https://github.com/M4tyu633/egovmed-showcase)

## Prototype scope

This is a hackathon prototype, not an official PGH deployment. Hospital schedules, queues, sample records, and benefit eligibility are demonstration workflows. AI triage suggests a next step and does not provide a diagnosis. Report tracking shows local follow-up status rather than the government's case-resolution status.
