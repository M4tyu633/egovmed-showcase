# Configuration

The complete variable lists are in [backend/.env.example](../backend/.env.example) and [frontend/.env.example](../frontend/.env.example). Copy the examples to `.env` inside each package. Local environment files are ignored by Git.

## Local evaluation

The examples select `NODE_ENV=development`, `STORE_DRIVER=memory`, and `INTEGRATION_MODE=mock`. This configuration needs no government API credentials. Each new mock browser identity receives demonstration content. The development server initializes local sample data; it is not a hospital data import.

Run `npm ci` in each package, start the backend with `npm run dev`, then start the frontend with the same command. The frontend is served at `http://localhost:3000`; the backend is at `http://localhost:4000`.

## Secrets

Generate separate values for `JWT_SECRET` and `PHI_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run the command once for each secret and place the values in the backend's private `.env`. Generate an independent `ADMIN_KEY` if using administrative endpoints. Do not reuse the local example values for persistent or shared environments.

Keep the encryption key stable for the lifetime of stored records. Changing it without a data migration makes existing ciphertext unreadable.

## Enable a live service

1. Obtain credentials for that service from the eGov API Developer Portal.
2. Set its gateway URL and private credentials in the backend environment.
3. Set only that service's mode to `live`, for example `EGOV_AI_MODE=live`.
4. Restart the backend and make one bounded test request.

Explicit per-service variables override `INTEGRATION_MODE`. The available mode variables are `EGOVPH_MODE`, `EGOV_AI_MODE`, `EVERIFY_MODE`, `FACE_LIVENESS_MODE`, `EMESSAGE_MODE`, `EGOVCHAIN_MODE`, `EGOVPAY_MODE`, and `EREPORT_MODE`.

For eVerify demographic matching, set `VERIFICATION_METHOD=everify`, the eVerify client credentials, and `EVERIFY_PUBKEY`. The frontend reads these public flow settings from `GET /auth/config`; it does not need a secret.

## Persistent storage and shared environments

`STORE_DRIVER=kv` uses Upstash Redis and requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. An independent database is preferable for an independent deployment. Never copy production credentials into this review repository.

Production requires strong secrets and persistent storage. With `ALLOW_MOCK_IN_PRODUCTION=false`, all eight integrations must be live and credentialed before the backend starts. The mock override is intended only for an explicitly identified demonstration environment.

`STORE_KEY_PREFIX` namespaces Redis keys. The existing production keyspace uses an empty prefix. Vercel preview environments using Redis must have a nonempty prefix; the backend enforces this distinction at startup.

## Frontend and origin configuration

`VITE_API_BASE_URL=/api` uses Vite's local proxy. `VITE_API_PROXY` can change the development proxy target. A separately hosted frontend must use the intended backend origin.

The backend's `APP_URL`, frontend's `VITE_API_BASE_URL`, and allowed origins in `frontend/vercel.json` must agree. `API_PUBLIC_URL` supplies the backend's public callback origin. A live identity or checkout flow requires provider-approved HTTPS callback URLs.

Every `VITE_*` value is public in the compiled JavaScript. Only public keys or configuration belong there.

## Repository isolation

This repository has no Vercel project link, deployment credentials, or deployment workflow. Both package-level Vercel configurations set `git.deploymentEnabled` to `false`. They retain the existing routing and security-header definitions as source references.

The shared repository contains no production application URL, production API URL, or production credentials. Evaluation is local by default. The submission's live demonstration is managed separately.
