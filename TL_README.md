# TheLuupe Marketplace — Custom Implementation Guide

This document covers TheLuupe-specific systems and integrations that are **not part of the upstream Sharetribe Web Template**. For general template documentation, see `README.md` and `AGENTS.md`.

---

## Digital Product Upload & Download

This is the core e-commerce mechanic for TheLuupe — sellers upload original files (photos, videos) and buyers download them after purchasing.

### Upload flow

1. Seller uploads a file through the listing edit UI via [Uppy](https://uppy.io/).
2. Uppy calls `POST /api/transloadit-params` to get a signed Transloadit signature.
3. Transloadit processes and stores the file in Google Cloud Storage.
4. Two pieces of metadata are saved to the listing:
   - `listing.publicData.originalFileName` — the original filename (shown to buyer)
   - `listing.privateData.originalAssetUrl` — the GCS URL (never exposed to frontend directly)

### Download flow

1. After a successful purchase, the buyer triggers `POST /api/digital-product-download` with the `transactionId`.
2. The server:
   - Confirms the requesting user is the transaction's `customer`
   - Checks transaction state is `PURCHASED`, `COMPLETED`, or `REVIEWED` (via the process graph)
   - Generates a **signed GCS URL** with 8-hour expiry using `@google-cloud/storage`
3. The download filename is formatted as `TheLuupe_{listingId}{originalExtension}`.

**Key file:** `server/api/digital-product-download.js`

### Required environment variables

```
GOOGLE_APPLICATION_CREDENTIALS   # Path to GCS service account JSON
TRANSLOADIT_KEY                  # Transloadit API key
TRANSLOADIT_SECRET               # Transloadit API secret
TRANSLOADIT_TEMPLATE_ID          # Transloadit template ID for uploads
```

---

## Phototag — AI Keyword Generation

Sellers can auto-generate SEO keywords for their listings using the Phototag AI service.

- **Endpoint:** `POST /api/phototag-keywords`
- **Input:** Array of image URLs from the listing
- **Output:** Up to 40 single-word keywords
- **Used from:** `BatchEditListingPage` (bulk) and listing edit flow

The service supports an exclusion list (e.g. the seller's name) to avoid generic or identifying keywords. In development, set `PHOTOTAG_API_URL` to a mock endpoint.

### Required environment variables

```
PHOTOTAG_API_URL        # Defaults to https://server.phototag.ai/api/keywords
PHOTOTAG_BEARER_TOKEN   # Bearer token for Phototag API
```

---

## Brand Studio System

Agencies and multi-photographer studios operate under a shared brand identity.

### User roles

- **Brand Admin** — creates/manages the studio, invites members. Identified by `user.publicData.isBrandAdmin = true`.
- **Brand User** — member of a studio. Identified by `user.publicData.userType = 'studio-brand'` and a `brandStudioId`.

### How it works

1. A brand admin creates a studio via the Studio Manager microservice (internal service at `WEBAPI_URL/api/v1/management`).
2. Invite links are generated containing a `brand-studio-id` parameter.
3. When a new user registers via that link, Auth0 app metadata carries `brandStudioId` and `userType`.
4. On user creation, `server/scripts/events/notifyUserCreated.js` syncs this metadata to Sharetribe user `privateData`/`publicData`.

### Key files

- `server/api-util/studioHelper.js` — Studio Manager API client
- `server/api-util/auth0Helper.js` — Auth0 Management API client
- `server/scripts/events/notifyUserCreated.js` — handles new user event
- `server/api/scripts-retry/retryBrandUserAssignment.js` — retry on assignment failure

### Required environment variables

```
WEBAPI_URL                    # Internal Studio Manager service base URL
STUDIO_MANAGER_API_KEY        # Auth header for Studio Manager
AUTH0_DOMAIN                  # Auth0 tenant domain
AUTH0_MGMT_CLIENT_ID          # Auth0 Management API client ID
AUTH0_MGMT_CLIENT_SECRET      # Auth0 Management API client secret
```

---

## Auth0 / OAuth

Authentication uses Auth0 as the OIDC provider via `express-openid-connect`.

### Custom JWT claims

Auth0 adds marketplace-specific claims namespaced as `ext-mp-*`:
- `ext-mp-user-type` — `buyer` | `creative-seller` | `studio-brand`
- `ext-mp-studio-id`
- `ext-mp-community-id`
- `ext-mp-is-brand-admin`
- `ext-mp-brand-studio-id`

These are read in `server/api/auth/createUserWithIdp.js` and `loginWithIdp.js` to sync data into Sharetribe.

### Required environment variables

```
AUTH0_DOMAIN          # e.g. your-tenant.auth0.com
AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET
AUTH0_CALLBACK_URL    # Must match Auth0 app settings
```

---

## Negotiation Transaction Process

The `default-negotiation` process supports price negotiation before checkout.

### Two modes

| Mode | Who creates the listing | Who initiates |
|---|---|---|
| **Forward** | Provider (seller) | Customer sends a `request-quote` |
| **Reverse** | Customer (buyer posts a request) | Provider sends a `make-offer` |

Mode is set on `listing.publicData.negotiationMode`. The frontend checks this to show the correct initial action button.

### Counter-offer loop

Both parties can counter-offer. All offers are stored as an array in `transaction.metadata.offers`, with timestamps and actor IDs. Server-side validation in `server/api-util/negotiation.js` ensures offer history is consistent with the transition history.

### Key files

- `src/transactions/transactionProcessNegotiation.js` — frontend state graph
- `server/api-util/negotiation.js` — server-side validation
- `server/api-util/transactions/` — server-side process definitions

> **Note:** Any change to the negotiation flow requires a matching update to the Sharetribe backend transaction process via Console or Integration API.

---

## Slack Integration

Used for operator workflows: approving sellers and reviewing new listings.

### Channels

| Channel env var | Purpose |
|---|---|
| `SLACK_USER_MANAGER_CHANNEL_ID` | Seller applications, community approvals |
| `SLACK_LISTING_MANAGER_CHANNEL_ID` | New product listings, errors |

### Interactive approvals

Slack sends `POST /api/slack/interactivity` when an operator clicks Approve/Reject. Requests are verified with HMAC-SHA256 signature + 5-minute timestamp window.

Actions available: `approve_seller`, `reject_seller`, `approve_community`, `reject_community`.

### Required environment variables

```
SLACK_BOT_TOKEN                   # xoxb-... token
SLACK_SIGNING_SECRET              # For verifying interactive payloads
SLACK_USER_MANAGER_CHANNEL_ID
SLACK_LISTING_MANAGER_CHANNEL_ID
```

---

## Voucher / Discount Codes (Voucherify)

Discount codes are validated via [Voucherify](https://voucherify.io/) before checkout.

- Only **percentage discounts** applied to the **entire order** are supported.
- A Voucherify customer record is auto-created on first validation, linked to the Sharetribe user's email.
- Endpoint: `POST /api/validate-voucher`

### Required environment variables

```
VOUCHERIFY_APP_ID
VOUCHERIFY_SECRET_KEY
```

---

## Referral Program (Referral Factory)

Users are auto-enrolled in the referral program via [Referral Factory](https://referral-factory.com/).

- Referral code stored in `user.privateData.referralCode` after first opt-in.
- Qualification (conversion) is recorded when a purchase completes.
- Endpoint: `POST /api/referral-manager`

### Required environment variables

```
REFERRAL_FACTORY_API_KEY
REFERRAL_CAMPAIGN_ID
```

---

## Event-Driven Scripts

`server/api-util/scriptManager.js` runs a long-polling loop against the Sharetribe Integration API, processing events in batches of 10. It self-heals if the SDK goes idle (3 retries before forced reinit).

### Registered event handlers (`server/scripts/events/`)

| Script | Trigger |
|---|---|
| `notifyUserCreated.js` | New user registered — syncs brand/studio metadata |
| `notifyProductListingCreated.js` | New product listing — posts to Slack for review |
| `notifyPortfolioListingUpdated.js` | Portfolio listing updated — posts error/update to Slack |

### Required environment variables

```
SHARETRIBE_INTEGRATION_CLIENT_ID
SHARETRIBE_INTEGRATION_CLIENT_SECRET
```

---

## License Deals

Custom per-user pricing for specific buyers, stored server-side.

- Deals stored in `listing.privateData.customLicenseDeals[]` (array, one per buyer).
- Each deal: `{ id, buyerId, customPrice, customTerms, generatedAt, expiresAt }`
- Validated before checkout at `POST /api/validate-license-deal`.
- Validation checks: listing is published, deal belongs to current user, deal is not expired, listing type is `product-listing` or `hidden-product-listing`.

---

## Listing Types Reference

| Value | Description |
|---|---|
| `product-listing` | Standard digital asset for sale |
| `hidden-product-listing` | Product not shown in public search |
| `service-listing` | Service offering (booking/inquiry) |
| `portfolio-showcase` | Creator portfolio (auto-approved, not transactable directly) |
| `profile-listing` | Auto-created when a seller is approved |

---

## User Type Reference

| Value | Description |
|---|---|
| `buyer` | Default for new registrations |
| `creative-seller` | Approved seller/photographer |
| `studio-brand` | Member of a brand studio |

Seller and community approval status (`APPLIED`, `APPROVED`, `WAITLISTED`) is stored separately in `user.publicData.sellerStatus` and `user.publicData.communityStatus`.
