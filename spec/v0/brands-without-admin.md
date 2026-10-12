# Brands without an admin (against the webapp)

> **Status:** ✅ Implemented (2026-10-12), §2.3 included; waiting on the webapp's deploy. It uses what
> [`webapp/spec/brands-without-admin.md`](../../../webapp/spec/brands-without-admin.md) adds to the webapp's join
> response. Until the webapp sends it, a joiner is a plain member, exactly as before, so either can be deployed
> first. Manual check: §6.
>
> **Why now:** Part A of Popup Studio's brand sync (initiatives repo,
> `catalog/popup-studio/brand-sync-plan-v2.md` §5.2). Popup Studio creates brands with no admin and links event
> attendees to existing brands, some of which have no admin either. Their people join through each brand's
> invitation link.
>
> **The same changes, for when Studio replaces the webapp:** [`spec/v1/studio-brand-onboarding-changes.md`](../v1/studio-brand-onboarding-changes.md)
> §2.2 and §2.4. This spec does only what Popup Studio needs today, against the webapp.

---

## 1. Why

A person who opens a brand's invitation link (`/signup/studio-brand/:brandStudioId`) and signs up ends in
`server/scripts/events/notifyUserCreated.js`, `getExtendedData`, on its invitation branch (`brandStudioId` set).
It calls the webapp's join (`addStudioBrandUser` → `POST /brand/:brandId/user`) and then, for a brand with no
admin:

| What happens | Where |
|---|---|
| It looks on Sharetribe for the brand's admin, to copy the brand's name, website, "About us" and industry onto the joiner. There is none, so the joiner's brand name is blank | `getBrandData` |
| The joiner gets `isBrandAdmin: false`, hard-coded, so nobody can open Brand management or edit the brand's fields | `getExtendedData` |

Once the webapp change is live, the webapp makes the first person to join a brand with no admin its admin, and
says so in its response (`isBrandAdmin`, with the brand's `companyName`). This spec makes the Marketplace use
that answer.

---

## 2. Changes

### 2.1 Pass the webapp's answer through

**File:** `server/api-util/studioHelper.js`, `addStudioBrandUser`.

**Today:** it returns `communityId` and `studioId` from the response's `data`.

**Change:** also return `isBrandAdmin` and `companyName`.

### 2.2 The admin joiner gets the brand

**File:** `server/scripts/events/notifyUserCreated.js`, `getExtendedData`, the invitation branch.

**Change:**
- **When `isBrandAdmin` is `true`:**
  - skip `getBrandData`: there is no admin to copy from, and no admin list to join;
  - return `publicData: { brandName: companyName }`;
  - return `metadata: { brandUsers: [], membership: BRAND_MEMBERSHIP_TYPES.BASIC, isBrandAdmin: true, communityId, studioId }`.
    The empty `brandUsers` matters: the next person to join adds themselves to it, and `addBrandUser` spreads it.
- **When it is `false` or missing:** exactly today's code. A webapp without the change returns no flag, so the
  two can be deployed in either order.
- **In `addBrandUser`** (the Sharetribe helper at the top of the file), read `brandUsers || []`, so an admin whose
  list was never set can't make a joiner fail.

The new admin starts with the brand's name and with an empty website, "About us" and industry, which they fill in
from their profile settings, as any brand admin does.

### 2.3 Recommended: the new admin's first edits reach the members

**File:** `server/scripts/events/notifyUserUpdated.js`, `shouldUpdateBrandUsers`.

**Today:** brand fields are copied to the members only when the admin changes a field **that had a value
before** (`!!previousBrandName` and the three like it). The new admin's website, "About us" and industry start
empty, so filling them in for the first time never reaches the members.

**Change:** test "the field changed" (its key is present in `previousValues`' `publicData`) instead of "it had a
value". Check Sharetribe's documentation of `previousValues` while building. `shouldUpdateStudio`, which sends a
renamed brand to the webapp, uses the same check; the brand's name always has a value, so renaming works today
and keeps working.

**Checked while building** ([Sharetribe's events reference](https://www.sharetribe.com/docs/references/events/)):
each top-level `publicData` key is compared on its own; a changed or removed key comes with its previous value, an
added one with `null`, and an unchanged one is absent. The function moved out of `script()` so it can be exported
for its tests. One side effect: the update that makes a joiner the admin sets `brandName`, so the name may be sent
back to the webapp once, unchanged.

---

## 3. What doesn't change

- **Brand sign-up without a brand id** (a person creating their own brand): unchanged.
- **The buyer tool** (`server/api/scripts-retry/retryBrandUserAssignment.js`): it still checks a brand by looking
  for its admin on Sharetribe, so it still refuses a brand with no admin. The webapp disables the tool on such a
  brand instead, with a message saying why ([webapp spec](../../../webapp/spec/brands-without-admin.md) §2.4). The
  proper fix waits for Studio ([`spec/v1/studio-brand-onboarding-changes.md`](../v1/studio-brand-onboarding-changes.md) §2.3).
- **The sign-up page**, which doesn't name the brand ("You've been invited to join a project on The Luupe").
- **`studioHelper.js` swallowing the webapp's errors** (`{data: {}}`): a failed join still looks like a success.
  Popup Studio's summary shows it, as the person stays "No account" on its next Refresh.

---

## 4. Tests

`yarn test-server` (Jest over `server/**/*.test.js`). The new tests sit beside their files, as
`server/api-util/*.test.js` do, with the Integration SDK and the Studio client mocked.

- **`notifyUserCreated.test.js`:**
  - the admin branch sets `isBrandAdmin: true`, the brand's name and `brandUsers: []`, and never queries for an
    admin;
  - the member branch is unchanged, with the admin's fields copied and the joiner added to the admin's list;
  - a missing flag behaves exactly as today;
  - an admin with no `brandUsers` list doesn't make a joiner fail.

  The file exports `analyzeEvent`, not `getExtendedData`; the tests go through `analyzeEvent`, or the function is
  exported for them.
- **`studioHelper`:** `addStudioBrandUser` passes the two fields through.
- **`notifyUserUpdated`** (if §2.3 is built): an admin's first website reaches the members, and a value cleared or
  changed still does.

**Built:** `server/api-util/studioHelper.test.js`, and `notifyUserCreated.test.js` and `notifyUserUpdated.test.js` in
`server/scripts/events/`. `getExtendedData` and `shouldUpdateBrandUsers` are exported for them.

---

## 5. Rollout

- **After the webapp change, on QA first.** Then Popup Studio's end-to-end check on QA (plan v2 step 2.4): a test
  brand created by Popup Studio, two test users signing up through its link. The first becomes the admin, both
  show the brand's name, and the second appears in the first's Brand management.
- **PROD only once everything is tested on QA** (plan v2 §6): the webapp first, then this.
- **No test on PROD** (decided 2026-10-08): it would leave test users in Auth0, Sharetribe, Circle and Segment.
- **Undo:** redeploy the previous version. Admins already made keep their role.

---

## 6. Manual Testing Plan

### Prereqs

- **QA**, with this repo **and** the webapp's change ([webapp spec](../../../webapp/spec/brands-without-admin.md))
  deployed. Without the webapp's change, every joiner stays a plain member (§2.2), so the admin rows below can't pass.
- **A brand with no admin**, created by Popup Studio on QA (plan v2 step 2.4), and its invitation link,
  `/signup/studio-brand/:brandId`, from Popup Studio or from the webapp's brand details ("Invite new Brand User").
- **Five fresh test emails** (A to E) that have never signed up on QA.
- The sign-up is finished by an event script a few seconds later: after each sign-up, wait and reload before
  checking.

### 6.1 The first joiner becomes the admin

| # | Action | Expected |
|---|---|---|
| 1 | Open the brand's invitation link in a private window and sign up as A | Sign-up completes, as for any invitation |
| 2 | As A, open Profile settings | The brand's name is filled in. Website, "About us" and industry are empty and editable |
| 3 | As A, open `/account/brand-management` | The Brand management page opens (no redirect to Contact details) and reads "No brand users yet." |
| 4 | In the webapp's admin, open the brand's details | Its admin is A |

### 6.2 The second joiner is a member

| # | Action | Expected |
|---|---|---|
| 1 | Open the same invitation link in a new private window and sign up as B | Sign-up completes |
| 2 | As B, open Profile settings | The brand's name is shown, as A has it. The brand fields aren't editable |
| 3 | As B, open `/account/brand-management` | Redirected to Contact details: B isn't an admin |
| 4 | As A, reload Brand management | B is listed under "Brand users" |

### 6.3 The admin's edits reach the members (§2.3)

| # | Action | Expected |
|---|---|---|
| 1 | As A, fill in the website, "About us" and industry for the first time, and save | Saved |
| 2 | As B, reload Profile settings | B shows the same website, "About us" and industry |
| 3 | As A, change the website, and clear "About us"; save | Saved |
| 4 | As B, reload Profile settings | B shows the new website and an empty "About us" |
| 5 | As A, rename the brand; save | Saved |
| 6 | As B, reload Profile settings; in the webapp's admin, reload the brand | Both show the new name |

### 6.4 Unhappy paths and the paths that don't change

| # | Action | Expected |
|---|---|---|
| 1 | Sign up as C through the invitation link of a brand that **already has an admin** | C is a member: the admin's brand fields are copied onto C, C is listed in that admin's Brand management, and `/account/brand-management` redirects C |
| 2 | Sign up as D as a brand **without** an invitation link (a new brand) | As before: the person is the admin of a new brand, with the name they typed |
| 3 | Sign up as E through an invitation link with a **made-up brand id** | As before: E is a plain member with a blank brand name. The webapp refuses the join and the Marketplace swallows the error (§3) |

### Not changed (spot-check for regressions)

- **"Assign an existing buyer to a brand"** (the webapp's buyer tool, backed by `retryBrandUserAssignment.js`): still
  refuses a brand with no admin. The webapp disables it for such a brand (§3).
- **The sign-up page** for an invitation: same copy, without the brand's name.
- **Creators' and buyers' sign-ups**: unchanged.
