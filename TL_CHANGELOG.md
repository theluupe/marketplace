# TheLuupe Marketplace — Custom Changelog

This file tracks changes made to TheLuupe's fork of [Sharetribe Web Template](https://github.com/sharetribe/web-template). It only documents **TheLuupe-specific additions and modifications** — upstream Sharetribe changes are tracked in `CHANGELOG.md`.

---

## [Initial Custom Implementation] — Pre-2026

> This entry consolidates all custom features present at the time this changelog was initialized (2026-04-07). Future changes should be logged as individual versioned entries.

### New Features

#### Digital Product Upload & Download
- Integrated [Transloadit](https://transloadit.com/) for client-side file uploads. Server endpoint `POST /api/transloadit-params` signs upload parameters.
- Integrated Google Cloud Storage for original asset hosting. Files stored with listing ID + original extension.
- Added `POST /api/digital-product-download` — generates signed GCS download URLs (8-hour expiry) gated on transaction state (`PURCHASED`, `COMPLETED`, or `REVIEWED`). Download filename formatted as `TheLuupe_{listingId}{ext}`.
- Listing stores `publicData.originalFileName` and `privateData.originalAssetUrl`.

#### Phototag AI Keywords
- Added `POST /api/phototag-keywords` — sends images to the [Phototag AI](https://phototag.ai/) API and returns up to 40 single-word keywords per image.
- Supports exclusion lists (e.g. profile name) and development mock mode.
- Added `BatchEditListingPage` for bulk keyword management across multiple listings.
- Added upgrade scripts in `server/api/scripts-retry/upgradePhototagKeywords/`.

#### Brand Studio System
- Added `server/api-util/studioHelper.js` — client wrapper for internal Studio Manager microservice.
- Brand admins can create studios, invite users via shareable links, and manage membership.
- User types: `buyer`, `creative-seller`, `studio-brand`.
- Brand membership tiers: `BASIC`, `TALENT_SUITE`. Seller membership tiers: `BASIC`, `CONNECT`, `PRO`.
- User metadata (`studioId`, `communityId`, `userType`, `isBrandAdmin`, `brandStudioId`) synced between Auth0 and Sharetribe.
- Added `BrandManagementPage` for studio admin UI.
- Added retry script `server/api/scripts-retry/retryBrandUserAssignment.js`.

#### Portfolio Listing Type
- Added `portfolio-showcase` listing type (distinct from `product-listing`, `service-listing`, `profile-listing`).
- Portfolio listings auto-transition from `pendingApproval` to `approved` state.
- Added `EditPortfolioListingPage` with wizard UI supporting video/file panels.
- Profile listings auto-created when sellers are approved.

#### Auth0 / OAuth Integration
- Added `server/api/auth/auth0.js` using `express-openid-connect` OIDC middleware.
- Custom JWT claims namespaced as `ext-mp-*` carry marketplace-specific user metadata.
- `createUserWithIdp.js` and `loginWithIdp.js` handle user creation/login via identity providers.
- `server/api-util/auth0Helper.js` wraps the Auth0 Management API for metadata reads/writes.
- Session cookie lifetime: 7 days (configurable).
- Auth error state persisted via cookie for frontend error handling.

#### Negotiation Transaction Process
- Added `default-negotiation` transaction process with **forward** (customer-initiated) and **reverse** (provider-initiated) modes.
- Supports: make-offer, request-quote, counter-offers from both parties, operator rejection.
- Added `server/api-util/negotiation.js` for server-side offer validation and history consistency checks.
- Added `MakeOfferPage` and `RequestQuotePage` for the respective negotiation entry points.
- Offer history stored as metadata array on the transaction.

#### `default-purchase-no-stripe` Transaction Process
- Added an alternative purchase flow for deals where payment is handled outside the platform.

#### License Deal Validation
- Custom per-user pricing stored in `listing.privateData.customLicenseDeals[]`.
- Added `POST /api/validate-license-deal` — verifies deal expiry, buyer authorization, and listing type eligibility before checkout.
- License upgrade line item handled via `getLicenseUpgradeLineItem()` in `lineItemHelpers.js`.

#### Voucher / Discount Codes
- Integrated [Voucherify](https://voucherify.io/) for discount code management.
- Added `POST /api/validate-voucher` — gets-or-creates a Voucherify customer, validates code, applies percentage discount to order.

#### Referral Program
- Integrated [Referral Factory](https://referral-factory.com/).
- Added `POST /api/referral-manager` — auto-opts users in on first call, stores referral code in `user.privateData.referralCode`.
- Qualification recorded on purchase completion.
- Added `ReferralProgramPage`.

#### Slack Notifications & Approvals
- Added `server/api-util/slackHelper/` with Block Kit message builders.
- Two Slack channels: user management (seller/community approvals) and listing management (product review, errors).
- Interactive approval buttons (Approve/Reject) handled at `POST /api/slack/interactivity` with HMAC signature + timestamp verification.
- Covers workflows: seller validation, community approval, product listing created, portfolio listing updated, user creation errors.

#### Event-Driven Background Scripts
- Added `server/api-util/scriptManager.js` — polls Sharetribe Integration API for events, dispatches to handlers in `server/scripts/events/`.
- Self-healing SDK singleton with reconnect logic (up to 3 retries before forced reinit, 5-min poll timeout).
- Event scripts: `notifyUserCreated`, `notifyProductListingCreated`, `notifyPortfolioListingUpdated`.

### Modified Core Behavior

#### User Account & Profile
- Added `CreativeDetailsPage` for seller-specific profile information.
- Added `ManageAccountPage` for extended account management.
- Added account deletion flow (`DELETE /api/delete-account`).
- Added seller/community status fields (`APPLIED`, `APPROVED`, `WAITLISTED`) to user metadata.

#### Search
- Added `FavoriteListingsPage` — users can save/unsave listings.
- Search page supports both map (`SearchPageWithMap`) and grid (`SearchPageWithGrid`) variants, toggled via hosted config.

#### Line Items & Pricing
- Extended `server/api-util/lineItemHelpers.js` with: multi-item shipping calculations, voucher discount application, license deal upgrade line items, commission calculations (provider and customer).

### Infrastructure & Tooling

- Added `server/api-util/metadataHelper.js` — centralized enums for user types, listing types, statuses, and membership tiers.
- Added `server/api-util/cache.js` and `server/api-util/sdkCacheProxy.js` — SDK response caching layer.
- Added `server/api-util/retryAsync.js` — generic retry utility for async operations.
- Added `scripts/audit.js` — custom yarn audit parser.
- Added `scripts/translations.js` — translation management helper.
- Added `version:patch` npm script using `prerelease` with `theluuupe` preid.
- Node engine requirement: `>=22.22.0` (`.nvmrc`: `24.13.0`).
- Dockerfile and `cloudbuild.yaml` for GCP-based CI/CD.
- `.circleci/` configuration for CI pipeline.

---

## How to add entries

When implementing a new feature or change, add an entry at the top of this file:

```markdown
## [Short Description] — YYYY-MM-DD

### Added / Changed / Fixed / Removed

- Description of what changed and why. Reference relevant files.
```
