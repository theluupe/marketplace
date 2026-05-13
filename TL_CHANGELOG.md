# TheLuupe Marketplace — Custom Changelog

This file tracks changes made to TheLuupe's fork of [Sharetribe Web Template](https://github.com/sharetribe/web-template). It only documents **TheLuupe-specific additions and modifications** — upstream Sharetribe changes are tracked in `CHANGELOG.md`.

---

## [Upstream Merge v10.14.0 → v11.0.2] — 2026-05-11

Merged 244 upstream commits spanning seven Sharetribe releases (`v10.14.0`, `v10.14.1`, `v10.15.0`, `v11.0.0` major, `v11.0.1`, `v11.0.2`) plus point fixes. Bumped version to `11.0.2-theluuupe.1`. Resolution plan, decisions, and per-conflict resolutions documented in [`spec/upstream-merge-v10.14-to-v11.0.2.md`](./spec/upstream-merge-v10.14-to-v11.0.2.md).

### Adopted upstream structure (with TheLuupe behaviour layered on)

- **CRA-eject from `sharetribe-scripts`** (upstream PR #792). New in-tree `config/` (webpack, babel, eslint, jest, react-dev-utils) and `scripts/` (start, build, build-server, test) directories. `package.json` scripts now point at `node scripts/*.js` directly. `Dockerfile` updated to `yarn install --production=false` so `devDependencies` (which now hold all build tooling) are installed under `NODE_ENV=production`.
- **AuthenticationPage refactored to hooks + inlined sub-components** (upstream PR #811). Replaced `compose(connect, withRouter)` with `useDispatch`/`useSelector`/`useStore`. Deleted the `AuthenticationForms/` middleware folder and inlined `<SignupBody>` and `<ConfirmIdProviderInfoForm>` directly in `AuthenticationPage.js`. Deleted the `SocialLoginButtons/` folder (no consumer — TheLuupe is SSO-only via Auth0). Folded the deleted `AuthenticationForms.module.css` rules into `AuthenticationPage.module.css`. `getHandleSubmitConfirm` overridden in `AuthenticationPage.helpers.js` with TheLuupe-aware logic (`brandStudioId`, `location`, `newsletterOptIn`, `withHiddenPrivateData`). Upstream's `getHandleSubmitSignup` dropped — TheLuupe doesn't expose email/password signup.
- **ListingPage adopted the upstream-provided wrappers** (upstream PR #819). `ListingPageAccessWrapper.js` now handles all access-control redirects (private marketplace, unauthorised user, pending-approval, no-viewing-rights), replacing TheLuupe's inline duplicates at the page level. `<Notifications>` replaces the two inline `<ActionBarMaybe>` calls. `<ActionBarMaybe>` renamed to `Notifications/ActionBar.js`.
- **SearchPage adopted `SearchPageAccessWrapper` and shared helpers** (upstream PR #815). `getDerivedRenderData`, `onResetAll`, `onSortBy`, `createFilterValueChangeHandler` moved into `SearchPage.shared.js`; `SearchErrors` extracted as a sub-component.
- **ManageListingCard split into sub-components** (upstream PR #805) — `CardMenu`, `CardThumbnail`, `PriceInfo`, refactored `Overlay`. The list of cards is now `ul`/`li` for accessibility; out-of-stock cards no longer show the menu.
- **Adopted upstream's `discardDraft` implementation** entirely (`DiscardDraftModal/`, the thunk in the duck, the `onDiscardDraft` prop chain). TheLuupe's near-identical HEAD implementation was redundant.

### New TheLuupe-only file

- **`src/containers/ListingPage/TheLuupeListingPageGate.js`** — handles TheLuupe-specific listing-type policy in one place: PORTFOLIO listings redirect to the author's ProfilePage with `pub_listingType=portfolio-showcase&pub_listingId=...`; PROFILE listings redirect to ProfilePage; HIDDEN_PRODUCT listings gate to owner-or-isLuupeAdmin (`NamedRedirect` to NoAccessPage otherwise). Invoked from inside `ListingPageAccessWrapper`'s final return (γ-inverted pattern: upstream wrapper minimally modified to delegate the inner render through the gate). Replaces the inline blocks that were duplicated across `ListingPageCarousel.js` and `ListingPageCoverPhoto.js`.

### Behaviour changes

- **Drafts are discard-only from `ManageListingsPage`.** Removed the "Finish listing" `<NamedLink>` from `<DraftOverlay>` in `CardThumbnail.js`. The corresponding `ManageListingCard.finishListingDraft` i18n key dropped from `en/de/es/fr`.
- **TheLuupe's SSO-only invariant is now hard-enforced.** `AuthenticationPage.js` does not import `login` or `signup` thunks from `auth.duck`; `LoginForm`, `SignupForm`, `LinkTabNavHorizontal`, `getAuthenticationTabs`, `AuthenticationFormErrorMessage` (login/signup branches), and the entire `SocialLoginButtons/` folder are absent. Only `signupWithIdp` is dispatched.
- **`server/env/index.js` migrated from `dotenv-expand` v5 API to v12 API.** Line 43 changed from `require('dotenv-expand')({ parsed: secrets })` to `require('dotenv-expand').expand({ parsed: secrets })` to match the new package version.

### In-merge silent-risk fixes

- **`src/util/sanitize.js` allow-list** added for TheLuupe Integration-API-written metadata keys. PR #779 introduced a metadata filter that *currently* passes unknown keys through permissively, but the in-file comment claims (aspirationally) that it filters. The allow-list (`THELUUPE_ALLOWED_USER_METADATA_KEYS`: 11 keys including `sellerStatus`, `communityStatus`, `studioId`, `communityId`, `isBrandAdmin`, `brandStudioId`, `isLuupeAdmin`, etc.; `THELUUPE_ALLOWED_LISTING_METADATA_KEYS`: `creator`) future-proofs TheLuupe against upstream tightening the filter.
- **`getListingsById` migrated to `makeGetListingsByIdSelector`** (per upstream PR #829) for all six callers: `SearchPageWithGrid.js`, `SearchPageWithMap.js`, `LandingPage.js`, `CMSPage.js`, `PrivacyPolicyPage.js`, `TermsOfServicePage.js`, `FavoriteListingsPage.js`, `AuthenticationPage.js`. Connect-based callers use the factory `mapStateToProps` pattern; hook-based callers (`AuthenticationPage`, `SearchPage*`) use `useMemo(makeGetListingsByIdSelector, [])`.

### Dependencies

- **Added** as direct dependencies (previously transitive): `js-cookie ^2.2.1`, `invariant ^2.2.4`, `redux ^5.0.1` — these were broken imports in HEAD (pre-existing, not introduced by the merge) that had been silently resolving via transitive resolution.
- **Removed**: `@voucherify/sdk` (already gone post-coupon-removal); `passport`, `passport-facebook`, `passport-google-oauth` (added by upstream for Sharetribe's built-in IdP login; not needed for TheLuupe's Auth0 setup); `sharetribe-scripts` (replaced by in-tree CRA-eject scripts); `workbox-webpack-plugin` (removed from `dependencies` — kept in `devDependencies` where it belongs).
- **Bumped (major versions)** with usage audited and migrated where needed: `dotenv` `^10.0.0` → `17.3.1`; `dotenv-expand` `^5.1.0` → `12.0.3` (required the `server/env/index.js` migration above); `@sentry/{browser,node}` `9.47.1` → `10.43.0` (no API changes needed for TheLuupe's usage); `style-loader` `^3.3.1` → `^4.0.0` (build-time only).

### Spec corrections (recorded inline in spec where they apply)

During implementation, three spec items in §3.3 were updated against the original draft because the original recommendation was wrong on re-inspection:

- `ContactDetailsPage.duck.js` — upstream's `resetPasswordThunk` reducer cases dropped instead of taken; TheLuupe intentionally removed the thunk, so taking the handlers would have been a `ReferenceError`.
- `ManageListingsPage.js` — kept TheLuupe's `<ListingTabs>` structure (which already provides ul/li grid + pagination + grid-layout toggle); did not adopt upstream's new manual `<ul>`/`<li>`/`<PaginationLinksMaybe>` block (would have been a regression).
- `ProfilePage.js` — dropped upstream's helpers block (`AsideContent`, `MobileReviews`, `DesktopReviews`, `MainContent`, etc.) entirely instead of folding; TheLuupe's child pages (`BasicProfilePage`, `SellerProfilePage`) handle their own rendering.

### Out-of-scope (deferred to follow-up specs)

1. Hooks migration for the four closure-pattern containers (LandingPage, CMSPage, PrivacyPolicyPage, TermsOfServicePage) — they got the factory-`mapStateToProps` `makeGetListingsByIdSelector` treatment but are still on `connect`.
2. Drafts retirement — TheLuupe's single-listing `EditListingWizard` still produces drafts as an intermediate state. Removing drafts entirely (or auto-cleaning abandoned ones) is a real product decision.
3. CI lint rule that enforces the `sanitize.js` allow-list stays in sync with Integration-API metadata writers.
4. Extract `canBypassListingAccessGates(currentUser)` helper for the `isLuupeAdmin` admin-bypass pattern (used in 5+ places).

---

## [Coupon Feature Removal] — 2026-05-07

- Removed the Voucherify-backed discount-coupon feature in preparation for a future in-house implementation.
- Buyer-facing input, validation endpoint, redemption hook, and SDK dependency have all been deleted.
- Cleaned dead voucher Handlebars block from `default-purchase-no-stripe` email templates (always dead — vouchers were Stripe-only).
- Historical transactions retain their embedded `line-item/voucher-discount` line items; the Stripe email templates and frontend renderer are preserved so past receipts continue to display correctly.
- Future-implementation guardrails (Stripe-only, no stacking with license deals, no refund reversal, clamp invariant) are tracked in `spec/disable-coupons.md` §6.

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
