# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

This is **TheLuupe Marketplace** — a heavily customized fork of [Sharetribe Web Template](https://github.com/sharetribe/web-template). It is a two-sided creative marketplace where photographers and creative professionals (sellers) list and sell digital assets, and buyers purchase or commission them. The upstream template handles core marketplace mechanics; TheLuupe adds its own transaction processes, integrations, and business logic on top.

## Commands

```bash
# Development (runs frontend + backend concurrently)
yarn dev

# Run frontend only (port 3000)
yarn dev-frontend

# Run backend API server only (port 3500)
yarn dev-backend

# Build for production
yarn build

# Run all tests (server + client)
yarn test-ci

# Run only server-side tests
yarn test-server

# Run a single test file
yarn test-server -- --testPathPattern=server/api-util/negotiation.test.js
# OR for client tests:
yarn test -- --testPathPattern=src/util/someFile.test.js

# Lint / format
yarn format        # auto-fix
yarn format-ci     # check only (used in CI)

# Check environment config before starting
yarn config-check
```

Node version is managed via `.nvmrc` (currently `24.13.0`). Use `nvm use` before running anything.

## Architecture overview

### Dual-server model

The app runs two separate Node processes in development:

- **Frontend dev server** (`sharetribe-scripts start`) — Webpack + React, port 3000. Talks to Sharetribe's API via the SDK and proxies `/api/*` requests to the backend.
- **Backend API server** (`server/apiServer.js`) — Express, port 3500. Handles everything that requires server-side credentials: Stripe, Google Cloud Storage, Auth0, Slack, Phototag, Voucherify, etc.

In production, `server/index.js` serves both SSR rendering and the API routes on a single Express process.

### Frontend structure

```
src/
  containers/     # Page-level components, each with a .duck.js (Redux slice + loadData)
  components/     # Shared reusable components
  ducks/          # Global Redux slices (auth, marketplaceData, assets, etc.)
  transactions/   # Transaction process graphs (one file per process)
  routing/        # Route configuration — routeConfiguration.js is the master list
  util/           # Pure utilities: api.js (all fetch calls), sdkLoader.js, etc.
  translations/   # en.json (and de/es/fr) — local fallbacks; hosted translations override
  config/         # configDefault.js — local fallbacks; hosted assets override
```

**Data flow:** Pages use `loadData` (in `.duck.js`) for SSR data fetching → Redux store → component. Never use `useEffect` for initial data loading; that pattern breaks SSR.

**All client→server API calls** go through `src/util/api.js`. Add new calls there, not inline.

### Backend structure

```
server/
  api/              # Express route handlers (one file per concern)
  api-util/         # Shared server utilities and third-party clients
  api-util/transactions/  # Server-side transaction process definitions
  scripts/events/   # Event-driven scripts triggered by Sharetribe webhooks
  api/scripts-retry/      # Retry scripts for failed async operations
```

### Transaction processes

Five processes, each defined in both frontend (`src/transactions/`) and backend (`server/api-util/transactions/`):

| Process | File | When used |
|---|---|---|
| `default-purchase` | `transactionProcessPurchase.js` | Digital product checkout with Stripe |
| `default-purchase-no-stripe` | `transactionProcessPurchaseNoStripe.js` | Off-platform payment |
| `default-booking` | `transactionProcessBooking.js` | Time-based services |
| `default-inquiry` | `transactionProcessInquiry.js` | Contact/inquiry flow |
| `default-negotiation` | `transactionProcessNegotiation.js` | Offer/counter-offer flow |

The negotiation process has two modes: **forward** (customer requests, provider offers) and **reverse** (provider lists an offer, customer responds). The listing's `publicData` determines which mode applies.

> **Always ask for user approval before changing transaction processes**, and remind them that matching changes must be made to the Sharetribe backend via Console or the Integration API.

### Key domain enums (`server/api-util/metadataHelper.js`)

- **User types:** `buyer`, `creative-seller`, `studio-brand`
- **Listing types:** `product-listing`, `hidden-product-listing`, `service-listing`, `portfolio-showcase`, `profile-listing`
- **Seller/Community statuses:** `APPLIED`, `APPROVED`, `WAITLISTED`
- **Brand membership:** `BASIC`, `TALENT_SUITE`
- **Seller membership:** `BASIC`, `CONNECT`, `PRO`

### Hosted configuration (Sharetribe Console)

The app fetches live configuration from Sharetribe on every full-page load via `sdk.asset*`. These override local files in `src/config/`. The merge logic lives in `src/util/configHelpers.js` (`mergeConfig`). Access config in components via `useConfiguration()`.

## TheLuupe-specific features

### Digital product upload & download

- **Upload:** Handled client-side via [Uppy](https://uppy.io/) + [Transloadit](https://transloadit.com/). The server endpoint `POST /api/transloadit-params` signs the upload parameters. The original file URL is stored in `listing.privateData.originalAssetUrl`; the original filename in `listing.publicData.originalFileName`.
- **Download:** `POST /api/digital-product-download` — verifies the requesting user is the transaction's customer, checks transaction state is `PURCHASED`, `COMPLETED`, or `REVIEWED`, then generates a signed GCS URL (8-hour expiry) via `@google-cloud/storage`. Download filename is formatted as `TheLuupe_{listingId}{ext}`.

### Phototag (AI keyword generation)

`POST /api/phototag-keywords` — sends listing images to the Phototag AI API and returns up to 40 single-word keywords. Used from `BatchEditListingPage` for bulk keyword management.

### Brand Studio system

Managed via an internal **Studio Manager** microservice (`server/api-util/studioHelper.js`). Brand admins create studios, invite users via shareable links, and control membership. User metadata is synced between Auth0 app metadata and Sharetribe user `privateData`/`publicData`. The relevant fields: `studioId`, `communityId`, `userType`, `isBrandAdmin`, `brandStudioId`.

### Auth0 / OAuth

`server/api/auth/auth0.js` uses `express-openid-connect` (OIDC). Custom claims are namespaced as `ext-mp-*` in the JWT. On login, `createUserWithIdp.js` / `loginWithIdp.js` sync Auth0 app metadata into Sharetribe. Session cookie lifetime defaults to 7 days.

### Slack integration

`server/api-util/slackHelper/` posts Block Kit messages to two channels:
- `SLACK_USER_MANAGER_CHANNEL_ID` — seller/community approvals
- `SLACK_LISTING_MANAGER_CHANNEL_ID` — product listing reviews and errors

Interactive button responses (approve/reject) are handled at `POST /api/slack/interactivity` with HMAC signature verification.

### License deals

Custom per-user price negotiated outside the platform. Stored in `listing.privateData.customLicenseDeals[]`. Validated server-side at `POST /api/validate-license-deal` before checkout.

### Vouchers / discounts

Powered by [Voucherify](https://voucherify.io/). `POST /api/validate-voucher` gets-or-creates a Voucherify customer, validates the code, and returns discount metadata. Only percentage discounts (`APPLY_TO_ORDER`) are supported.

### Referral program

Powered by [Referral Factory](https://referral-factory.com/). `POST /api/referral-manager` opts users in on first call and stores their referral code in `user.privateData.referralCode`. Qualification is recorded when a purchase is completed.

### Event-driven scripts

`server/api-util/scriptManager.js` polls the Sharetribe Integration API for events and dispatches them to scripts in `server/scripts/events/`. The integration SDK is a singleton with self-healing reconnect logic (up to 3 retries before forced reinit). These scripts handle: seller approval notifications, portfolio listing updates, brand user assignment.

## Development best practices

### Commit messages

- Write commits in the **imperative mood**: "Add download endpoint" not "Added download endpoint".
- Lead with *what* changed and *why*, not just the file name: `Fix voucher validation to reject expired codes` not `Update api/voucher.js`.
- Scope the subject line to a single logical change. If you need "and" to describe it, split it into two commits.
- Keep the subject line under 72 characters. Add a blank line before the body when more context is needed.
- Reference ticket/issue numbers at the end of the body when relevant: `Closes #123`.

### Following existing patterns

- Before adding a new API endpoint, read two or three existing ones in `server/api/` to match the structure (auth middleware order, error handling, response shape).
- Before adding a new page, read a similar `.duck.js` and page component to match the `loadData` / Redux / SSR pattern.
- Reuse components from `src/components/` before writing new ones. Check the index barrel export first.
- Name files consistently with their neighbors: page components are `PascalCasePage.js`, ducks are `PascalCasePage.duck.js`, CSS modules are `PascalCasePage.module.css`.
- Keep new utilities in `src/util/` (frontend) or `server/api-util/` (backend). Do not scatter helper logic into page or component files.

### Code quality

- Run `yarn format` before committing to apply Prettier. CI will fail on formatting violations.
- Run the relevant test suite (`yarn test-server` or `yarn test`) after touching shared utilities or transaction logic.
- Never disable ESLint rules inline (`// eslint-disable`) without a comment explaining why.
- Keep components focused: if a component file exceeds ~300 lines, consider extracting sub-components.
- Remove dead code rather than commenting it out. Git history preserves it if it is ever needed again.
- Avoid `console.log` in committed code; use the existing logger utilities or remove debug statements before opening a PR.

## Code conventions (from AGENTS.md)

- **Import order:** external libs → config/util → shared components (via `src/components/index.js`) → parent dir → same dir. Violating this causes circular dependency errors.
- **Forms:** Always use React Final Form. Components prefixed `Field*` in `src/components/` are for RFF fields.
- **Utilities:** Prefer local utilities in `src/util/` over new npm packages. Ask before adding a dependency.
- **Redux:** Toolkit + Ducks pattern. Global ducks in `src/ducks/`; page-level ducks colocated with the page.
- **Styling:** Mobile-first CSS Modules. Breakpoints: `--viewportMedium` (768px), `--viewportLarge` (1024px). 6px baseline below medium, 8px at medium+.
- **i18n:** All copy must use `<FormattedMessage>` or `intl.formatMessage()`. New keys follow pattern `"ComponentName.key": "text"`.
- **Prettier:** single quotes, 2 spaces, trailing commas, 100-char line limit.
