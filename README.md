# TON Resume Monorepo

MVP Telegram Mini App + Bot + Backend for issuing and verifying non-transferable TON-based resumes.

## Structure
- `apps/api` – Fastify API with SQLite storage, AES-GCM encryption, Telegram initData validation.
- `apps/bot` – Telegraf bot that opens the mini app via `web_app` button.
- `apps/miniapp` – Vite + TS Telegram WebApp UI (Issuer / Holder / Verifier tabs) with TON Connect UI.
- `packages/shared` – Shared types, zod schemas, and canonical JSON helper.

## Getting started
1. Install pnpm (v8).
2. Copy `.env.example` to `.env` and fill:
   - `BOT_TOKEN` – Telegram bot token (shared by API + bot for initData validation).
   - `MINIAPP_URL` – Public URL of the mini app (use HTTPS tunnel like ngrok/cloudflared when testing in Telegram).
   - `API_BASE_URL` / `VITE_API_BASE_URL` – API URL (default `http://localhost:4000`).
   - `OFFCHAIN_MASTER_KEY` – 32+ char key for AES-256-GCM encryption.
   - `API_PORT` – API port (default `4000`).
3. Install deps: `pnpm install`.
4. Run all services: `pnpm dev` (starts API, bot, mini app).

## Telegram setup
1. Use BotFather to set up the bot with the token above.
2. Configure BotFather WebApp parameters to point to `MINIAPP_URL`.
3. Start the bot and tap **Open TON Resume** to launch the mini app.

## API endpoints (v1)
- `POST /v1/auth/telegram/validate` – validates `initData`, returns token.
- `GET /v1/portfolio` – holder credentials (auth).
- `POST /v1/mint-intent` – issuer creates credential (auth issuer).
- `POST /v1/revoke` – issuer revokes (auth issuer).
- `POST /v1/verify` – verify by `id` or `hash` (public).
- `POST /v1/privacy/update` – holder toggles visibility (auth holder).

### Data model
SQLite `credentials` table stores encrypted payload, content hash, status, issuer tier, and privacy level. On-chain interactions are stubbed; add TON smart contract integration where TODO markers are placed.

### Security
- Telegram initData signature verification with `WebAppData` HMAC.
- AES-256-GCM encryption with canonical JSON + SHA-256 hash.
- Basic rate limiting via `@fastify/rate-limit`.

## Mini App
- Loads Telegram WebApp SDK (`Telegram.WebApp.ready/expand`).
- Authenticates via `/v1/auth/telegram/validate` using `initData`.
- Issuer can mint and revoke credentials, Holder sees portfolio and privacy controls, Verifier checks by ID/hash.
- TON Connect UI shows wallet connect/address (on-chain mint/revoke left as TODO in API).

## Tests
`pnpm --filter api test` runs vitest unit tests for canonical hashing and initData validation.
