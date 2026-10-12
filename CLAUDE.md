# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

This is **TheLuupe Marketplace** — a heavily customized fork of [Sharetribe Web Template](https://github.com/sharetribe/web-template). It is a two-sided creative marketplace where photographers and creative professionals (sellers) list and sell digital assets, and buyers purchase or commission them. The upstream template handles core marketplace mechanics; TheLuupe adds its own transaction processes, integrations, and business logic on top.

## Package Manager

**Yarn only.** Never use `npm install` or `npm run` — this project and its `yarn.lock` are yarn-based, and mixing package managers will corrupt the dependency tree.

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
- **Backend API server** (`server/apiServer.js`) — Express, port 3500. Handles everything that requires server-side credentials: Stripe, Google Cloud Storage, Auth0, Slack, Phototag, etc.

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

### Referral program

Powered by [Referral Factory](https://referral-factory.com/). `POST /api/referral-manager` opts users in on first call and stores their referral code in `user.privateData.referralCode`. Qualification is recorded when a purchase is completed.

### Event-driven scripts

`server/api-util/scriptManager.js` polls the Sharetribe Integration API for events and dispatches them to scripts in `server/scripts/events/`. The integration SDK is a singleton with self-healing reconnect logic (up to 3 retries before forced reinit). These scripts handle: seller approval notifications, portfolio listing updates, brand user assignment.

## Development best practices

### Grilling a spec — end by proposing enhancements

When grilling or stress-testing a spec or design (the `grill-me` / `grill-with-docs` skills, or any "poke holes in my plan" request), the **final step** is to propose further enhancements that would make the feature better than the author's original approach — higher-value alternatives, adjacent UX / robustness / performance wins, and simplifications they may not have considered. Don't just validate the plan as given: end every grill with concrete "here's how we could make this even better" recommendations for the author to accept or decline.

### Comments — a changed behaviour changes its comments too

Explanatory comments are the design record — what was decided, what was **rejected and why**, and which traps have already been hit. That is only an asset while they are **true**. A wrong comment is worse than no comment: it reads as authoritative, it gets trusted over the code, and it is what the next reader acts on. **No test catches a false comment** — the suite stays green through one that has been wrong for months.

So, when you change behaviour:

- **Update every comment that describes it — including in other files.** The rationale for a decision is rarely stored next to the code that implements it.
- **Keep ONE canonical explanation and have the others point at it.** Restating the same rationale in two places means the next change has to find both, and the second copy is the one that goes stale. Prefer `see lib/x.js` over a second paragraph.
- **Never delete a comment just because it names code that no longer exists.** That is usually the most valuable kind — a rejected alternative, a past bug, a migration log. Deleting history mistaken for drift is not recoverable by reading the code.
- **When a comment describes better behaviour than the code implements**, that is a bug to raise, not a comment to quietly reconcile downward.
- **Spec references drift too.** A comment citing a spec section is a claim about a document that gets renumbered — check it when you touch that section.

### When fixing a bug — prove the test can fail

- Write a failing test that reproduces the bug **first**, then fix the code — this proves the bug existed and is now gone.
- **If the fix already exists — revert it, confirm the test goes RED, then restore it.** Diagnosing and fixing before writing the guard is normal when chasing a reported bug, but it means you have **never seen the test fail**. A green test written against already-correct code proves nothing about the code; it may be measuring something else entirely, and no gate can tell you — green is green.
- **Check WHICH tests go red, not merely that something did.** A test that stays green is testing something other than what its name claims. Real examples that passed with the fix reverted: an assertion made before an async retry could fire, and a UI assertion that held whether the panel under test was open or closed.

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

### Manual Testing Plan — every implemented spec gets one

When a spec ships, append a **Manual Testing Plan** section to the spec file itself (the last section before any "Open Questions" / "Future Considerations"). This is the walkthrough an admin, QA reviewer, or manager can follow to exercise every shipped surface end-to-end without reading the implementation.

- **Prereqs** — what to start (which command to run, which URL to land on, any setup or test accounts needed).
- **One subsection per surface or flow** — list page, detail page, each major action, each edge case.
- **Each step is a table row** with three things: a sequence number, the action ("Click X / type Y / navigate to Z"), and the **expected outcome** (the visible result the reader confirms).
- **Cover the unhappy paths** — rejected actions, validation errors, 404s, mismatched params — so every error toast and edge-state UI is reachable.
- **Confirm what is _not_ changed** — list adjacent surfaces the spec deliberately left untouched, so the reviewer knows what to spot-check for regressions.

The plan lives in the spec (not a separate doc) so the two evolve together: when the spec gains a behavior, the plan gets the matching row. When a spec is moved from Pending → Implemented in `TL_README.md`, its testing plan should be in place.

## Code conventions (from AGENTS.md)

- **Import order:** external libs → config/util → shared components (via `src/components/index.js`) → parent dir → same dir. Violating this causes circular dependency errors.
- **Forms:** Always use React Final Form. Components prefixed `Field*` in `src/components/` are for RFF fields.
- **Utilities:** Prefer local utilities in `src/util/` over new npm packages. Ask before adding a dependency.
- **Redux:** Toolkit + Ducks pattern. Global ducks in `src/ducks/`; page-level ducks colocated with the page.
- **Styling:** Mobile-first CSS Modules. Breakpoints: `--viewportMedium` (768px), `--viewportLarge` (1024px). 6px baseline below medium, 8px at medium+.
- **i18n:** All copy must use `<FormattedMessage>` or `intl.formatMessage()`. New keys follow pattern `"ComponentName.key": "text"`.
- **Prettier:** single quotes, 2 spaces, trailing commas, 100-char line limit.

## Specs

Design documents live in `spec/` and are tracked with their implementation status in [TL_README.md](./TL_README.md) under the "Specs" heading. Keep that list in sync:

Every row carries a `Status`: ✅ **Implemented** (landed in the codebase) · 🟡 **Pending** (not built, but all dependencies are Implemented) · 🔴 **Blocked** (not built, and a dependency is still Pending/Blocked).

- **New spec added** — append a row to the **Pending** table with its `Status` (🟡 if its dependencies are all Implemented, else 🔴) and a one-line summary of what the spec changes. Follow the same format as the existing rows.
- **Spec implemented** — move its row from **Pending** to **Implemented**, flip `Status` to ✅ Implemented, and rewrite the Notes column to a short implementation summary. Then re-check every spec that depended on it — a 🔴 Blocked spec whose last pending dependency just landed becomes 🟡 Pending.

> **Marketplace naming:** in this project, `TL_README.md` and `TL_CHANGELOG.md` are TheLuupe's equivalents of what other projects call `README.md` and `CHANGELOG.md`. The upstream Sharetribe `README.md` and `CHANGELOG.md` are left untouched. Spec tracking belongs in `TL_README.md`, not `TL_CHANGELOG.md` and not the upstream `README.md`.

**Where a new spec goes** (decided 2026-10-12). Each folder has a `README.md` listing its specs' order and dependencies, which mirrors `TL_README.md`'s statuses:

- `spec/v0/`: pre-Studio. Changes to today's Marketplace, whose platform is still the webapp, and anything else added in the meantime.
- `spec/v1/`: Studio-related specs, and future features.
- `spec/upstream-merge/`: one plan per merge of the upstream Sharetribe template, named `upstream-merge-v<from>-to-v<to>.md`.
