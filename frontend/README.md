# Patient application

React 18 and Vite interface for the eGovMed patient journey, with English and Tagalog copy, adjustable text size, and GSAP screen transitions.

## Run

```bash
npm ci
node -e "require('fs').copyFileSync('.env.example', '.env')"
npm run dev
```

Start the backend separately, then open `http://localhost:3000`. The `/api` proxy targets `http://localhost:4000` by default.

```bash
npm run build
```

The production build is written to `dist/`. It does not deploy the application.

## Structure

- `src/App.jsx`: screen navigation, application state, and backend actions.
- `src/screens`: sign-in, symptom intake, triage, verification, booking, payments, records, messages, account, and reports.
- `src/components`: shared inputs, navigation, interface elements, and transitions.
- `src/lib`: backend client and provider SDK loaders.
- `src/i18n/dict.js`: English and Tagalog copy.
- `src/styles/index.css`: design tokens and component styles.

The gear menu exposes demonstration controls. Public provider configuration is obtained from the backend. Partner secrets and service tokens never belong in frontend environment variables.

See [configuration](../docs/configuration.md) for origins and live verification settings.
