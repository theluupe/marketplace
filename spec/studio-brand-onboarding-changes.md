# Marketplace Changes for Studio Brand Onboarding

> **Related spec:** [Studio — User Sync & Brand Onboarding](../../studio/spec/user-sync-and-brand-onboarding.md)

## 1. Overview

This spec documents the Marketplace-side changes needed to support the new Studio brand onboarding flow. The Studio is replacing the Webapp as the target of the `StudioManagerClient`. Most of the Marketplace code remains unchanged — these are targeted fixes to support two new Studio capabilities:

1. **Admin-created empty Brands** — Brands that exist in the Studio before any user signs up
2. **First-user-becomes-admin** — the Studio decides whether a joining user is an admin, and communicates this back

---

## 2. Changes Required

### 2.1 `StudioManagerClient` base URL

**File:** `server/api-util/studioHelper.js`

**Current:**

```js
const BASE_PATH = 'api/v1/management';
// ...
axiosClient = axios.create({
  baseURL: `${process.env.WEBAPI_URL}/${BASE_PATH}`,
});
```

**Change:** Update the `WEBAPI_URL` environment variable to point to the Studio API instead of the Webapp. No code change in `studioHelper.js` itself — the `StudioManagerClient` contract is the same.

```env
# .env
# Before:
WEBAPI_URL=https://webapp.theluupe.com
# After:
WEBAPI_URL=https://studio-api.theluupe.com
```

---

### 2.2 Use `isBrandAdmin` from Studio response

**File:** `server/scripts/events/notifyUserCreated.js`

**Current behavior:** When a user signs up with a `brandStudioId` (joining an existing brand), `getExtendedData()` hardcodes `isBrandAdmin: false`:

```js
// Line ~103-106
return {
  // ...
  metadata: {
    membership: BRAND_MEMBERSHIP_TYPES.BASIC,
    isBrandAdmin: false,  // ← hardcoded
    communityId,
    studioId,
  },
};
```

**Problem:** With Admin-created empty Brands, the first user joining via the invitation link should be marked as `isBrandAdmin: true`. The Studio's `POST /brand/:brandId/user` endpoint now returns this info, but the Marketplace ignores it.

**Change:** Read `isBrandAdmin` from the Studio response instead of hardcoding:

```js
async function getExtendedData(userId, userAttributes) {
  // ...
  if (userType === USER_TYPES.BRAND) {
    const { brandStudioId } = profile.privateData;
    const { brandName } = profile.publicData;
    const studioManagerClient = new SMClient();
    const studioBrandUser = await studioManagerClient.studioBrandUserInit(brandStudioId, {
      admin: {
        email,
        firstName,
        lastName,
        providerId: identityProviders[0].userId,
        marketId: userId,
        type: STUDIO_USER_TYPE.BRAND,
      },
      companyName: brandName,
    });
    const { communityId, studioId } = studioBrandUser;
    const withBrandStudioId = !!brandStudioId;
    if (!withBrandStudioId) {
      // New brand — user is always admin (unchanged)
      const { brandStudioId: newBrandStudioId } = studioBrandUser;
      return {
        privateData: {
          brandStudioId: newBrandStudioId,
        },
        metadata: {
          brandUsers: [],
          membership: BRAND_MEMBERSHIP_TYPES.BASIC,
          isBrandAdmin: true,
          communityId,
          studioId,
        },
      };
    }
    // Existing brand — use Studio's response instead of hardcoding false
    const { isBrandAdmin = false } = studioBrandUser;  // ← NEW: read from response
    const brandData = await getBrandData(userId, brandStudioId);
    return {
      publicData: brandData,
      metadata: {
        membership: BRAND_MEMBERSHIP_TYPES.BASIC,
        isBrandAdmin,  // ← NEW: use dynamic value
        communityId,
        studioId,
      },
    };
  }
  // ... seller branch unchanged
}
```

**`StudioManagerClient` change needed:** The `addStudioBrandUser()` method must return `isBrandAdmin` from the Studio response:

```js
// studioHelper.js
async addStudioBrandUser(brandStudioId, data) {
  const result = await this.axiosClient.post(`/brand/${brandStudioId}/user`, data);
  const { communityId, studioId, isBrandAdmin } = result?.data?.data || {};
  return {
    communityId,
    studioId,
    isBrandAdmin,  // ← NEW
  };
}
```

---

### 2.3 Brand validation for buyer assignment

**File:** `server/api/scripts-retry/retryBrandUserAssignment.js`

**Current behavior:** `validateBrand()` checks for brand existence by querying Sharetribe for users with `meta_isBrandAdmin: true` and `priv_brandStudioId` matching:

```js
async function validateBrand(brandStudioId) {
  const integrationSdk = integrationSdkInit();
  const response = await integrationSdk.users.query(
    {
      priv_brandStudioId: brandStudioId,
      meta_isBrandAdmin: true,
    },
    QUERY_PARAMS
  );
  const data = response.data.data;
  return data.length > 0;
}
```

**Problem:** Admin-created Brands have zero members — no Sharetribe user has `priv_brandStudioId` set yet. This check will incorrectly report the brand as not existing.

**Change:** Replace the Sharetribe user query with a Studio API call to validate the brand directly:

```js
async function validateBrand(brandStudioId) {
  try {
    const studioManagerClient = new SMClient();
    const result = await studioManagerClient.validateBrand(brandStudioId);
    return result.exists;
  } catch (error) {
    return false;
  }
}
```

**New `StudioManagerClient` method:**

```js
// studioHelper.js
async validateBrand(brandId) {
  const result = await this.axiosClient.get(`/brand/${brandId}`);
  const { exists } = result?.data || {};
  return { exists: !!exists };
}
```

**New Studio API endpoint needed:** `GET /api/v1/management/brand/:brandId`

```json
// Response when brand exists
{ "exists": true, "companyName": "Acme Corp" }

// Response when brand does not exist
{ "exists": false }
```

---

### 2.4 Brand data retrieval for teamless Brands

**File:** `server/scripts/events/notifyUserCreated.js`

**Current behavior:** `getBrandData()` queries Sharetribe for the brand admin to copy `brandName`, `brandWebsite`, `aboutUs`, `brandIndustry` to the new team member's `publicData`, and adds the new user to the admin's `metadata.brandUsers` array:

```js
async function getBrandData(userId, brandStudioId) {
  const integrationSdk = integrationSdkInit();
  const response = await integrationSdk.users.query(
    {
      priv_brandStudioId: brandStudioId,
      meta_isBrandAdmin: true,
    },
    QUERY_PARAMS
  );
  const data = response.data.data;
  const brandFound = data.length > 0;
  if (!brandFound) {
    return {
      brandName: '',
      brandWebsite: '',
      aboutUs: '',
      brandIndustry: '',
    };
  }
  // ... copies publicData from admin + adds userId to brandUsers array
}
```

**Impact with empty Brands:** This already handles the "no admin found" case gracefully — returns empty strings. The new user's `publicData` will have blank brand fields. This is acceptable for MVP because:

- The `companyName` is stored in the Studio's `Brand` record (source of truth)
- The Marketplace `publicData` fields are secondary/display-only
- When the first user becomes admin, they can fill in these fields themselves

**No code change needed** — the existing fallback is sufficient.

---

## 3. Summary of Changes

| File | Change | Priority |
|---|---|---|
| `.env` | Update `WEBAPI_URL` to Studio API | Phase 1 (Marketplace cutover) |
| `server/api-util/studioHelper.js` | Add `isBrandAdmin` to `addStudioBrandUser()` return | Phase 2 |
| `server/api-util/studioHelper.js` | Add `validateBrand()` method | Phase 2 |
| `server/scripts/events/notifyUserCreated.js` | Use `isBrandAdmin` from Studio response instead of hardcoding `false` | Phase 2 |
| `server/api/scripts-retry/retryBrandUserAssignment.js` | Replace Sharetribe-based brand validation with Studio API call | Phase 2 |

### What does NOT change

- Auth0 PostLogin action — no modifications needed
- `StudioManagerClient.studioBrandUserInit()` branching logic — still correct
- `retryBrandUserAssignmentScript()` validation logic (user checks) — unchanged
- `analyzeEvent()` full sync flow — unchanged
- Referral program, Slack notifications, seller flows — unchanged
- Marketplace signup routes and components — unchanged

---

## 4. Testing Plan

### 4.1 End-to-end scenarios

| Scenario | Expected |
|---|---|
| **New brand signup (no brandStudioId)** | Brand + admin created in Studio; `isBrandAdmin: true` in Marketplace; unchanged from current behavior |
| **Join existing brand (has members)** | User added as MEMBER in Studio; `isBrandAdmin: false` from Studio; added to admin's `brandUsers` array |
| **Join empty brand (Admin-created, no members)** | User added as ADMIN in Studio; `isBrandAdmin: true` from Studio; brand fields empty (acceptable) |
| **Assign buyer to existing brand** | Studio API validates brand; buyer converted to BRAND; full sync triggered |
| **Assign buyer to empty brand** | Studio API validates brand (no Sharetribe admin query); buyer becomes ADMIN; full sync triggered |
| **Assign buyer to nonexistent brand** | Studio API returns `exists: false`; Marketplace returns error |

### 4.2 Regression checks

- Seller signup flow (no Studio changes) still works
- Buyer signup flow (no sync triggered) still works
- Brand name update propagation still works
- Circle webhook → membership tier update still works
