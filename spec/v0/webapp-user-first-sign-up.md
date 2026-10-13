# A webapp user's first sign-up (against the webapp)

> **Status:** ✅ Implemented (2026-10-13); waiting on the webapp's deploy. It calls the webapp's new
> `POST /api/v1/management/user/lookup`, built at the same time by the webapp's session (initiatives repo,
> [`catalog/popup-studio/spec/user-sync.md`](../../../initiatives/catalog/popup-studio/spec/user-sync.md) §5.2).
> Until the webapp has it, every lookup finds nobody and sign-up works as before, so either can be deployed first.
> Manual check: §6.
>
> **Why now:** Popup Studio's user sync (same spec, §3.3, §4.5, §5.2, §5.4). Through the webapp, Popup Studio
> creates each headshot person of the LeBook stand as a **brand member**: an Auth0 account, a webapp `User` and a
> `BrandUser`. It can't create their Marketplace account: the Integration API has no create endpoint, and
> `createWithIdp` needs the person's own Auth0 token. So the Marketplace finds them in the webapp **on their first
> sign-up here**. Rafael chose Marketplace code for this, not an Auth0 Action.

---

## 1. Why

**The person's first visit.** They log in with Auth0 (the account Popup Studio made, or their own). They have no
Sharetribe account, so `loginWithIdp` fails, and `server/api/auth/loginWithIdp.js`'s `.catch` sets the
`st-authinfo` cookie and sends them to the confirm page (`/confirm`). The cookie's `userType` and `brandStudioId`
come only from the link they came from. Without their brand's invitation link they sign up as a buyer, a creator
or the admin of a new brand, none of which is what the webapp already holds: a member of their brand.

**The brand's admin, before anyone is here.** A brand Popup Studio created gets its admin **in the webapp** (the
first person added to it) before anyone has a Marketplace account. People then sign up here in any order. In
`server/scripts/events/notifyUserCreated.js`:
- `getBrandData` finds the brand's Marketplace admin by `priv_brandStudioId` plus `meta_isBrandAdmin`. With none
  yet, a **member** gets an empty `brandName` and joins nobody's `brandUsers`.
- An **admin** starts with `brandUsers: []`, even when members of the brand already have Marketplace accounts, so
  they never appear in its Brand management, nor receive its brand-field edits.

---

## 2. Changes

### 2.1 Ask the webapp on the first sign-up

**Files:** `server/api-util/studioHelper.js` (`StudioManagerClient.lookupUser`) and
`server/api/auth/loginWithIdp.js`, its `.catch` branch.

**The webapp's endpoint:** `POST {WEBAPI_URL}/api/v1/management/user/lookup`, with `x-api-key:
STUDIO_MANAGER_API_KEY` (the client's existing base and key). Body `{ email }`. Answer `200 { success: true, data: {
user: null | { id, type, brandId } } }`: the webapp user with that email, ignoring case; `type` is `'BRAND'`,
`'CREATOR'` or `null`; `brandId` is their brand, or `null`.

**`lookupUser(email)`** posts it with a 5-second timeout (the client's default is 45 s, and the person is waiting
on a redirect) and returns `data.user`, or `null`.

**In `.catch`,** before the cookie is set, it looks up the email the Auth0 login gave, then:

| The webapp says | The cookie gets | So the confirm page shows |
|---|---|---|
| `type: 'BRAND'` with a `brandId` | `userType: 'studio-brand'`, `brandStudioId: brandId` | The brand-member sign-up of their brand (the invitee form: brand fields hidden), whatever the person picked and whichever link they came from |
| `type: 'CREATOR'` | `userType: 'creative-seller'`, no `brandStudioId` | The creator sign-up. They start "applied" and the team approves them in Slack, as for any creator; the webapp's `addCreator` then updates their existing user. No auto-approval (Rafael, 2026-10-13) |
| Anything else, no answer, or an error | What it gets today | What it shows today |

**Never blocks the sign-up.** The client's response interceptor already swallows the webapp's errors and returns
`{ data: {} }`, which reads as "not found"; anything else that throws is logged and ignored.

### 2.2 The confirm page follows the cookie: no change

`AuthenticationPage.js` picks the type from the path (`/signup/:userType`), then the history state, then the
cookie (`userTypeInAuthInfo`, on the confirm tab only). The server always sends the person to `/confirm`
(`defaultConfirm`, the `ConfirmPage` route), which has no `:userType`, through a full page load, which has no
history state. So the cookie's type always wins there, whether they started from `/signup/buyer` or
`/signup/creative-seller`. The form's brand fields follow the cookie's `brandStudioId`
(`ConfirmSignupForm.js`), and `getHandleSubmitConfirm` saves it into `privateData`.

### 2.3 Members who sign up before their admin

**File:** `server/scripts/events/notifyUserCreated.js`.

- **A member whose brand has no Marketplace admin yet** takes `brandName` from the webapp's `companyName`, which the
  join answer already carries ([`brands-without-admin.md`](./brands-without-admin.md) §2.1). The other brand fields
  stay empty, as today. When the admin signs up and fills them in, `notifyUserUpdated` copies them to the members
  in its list.
- **An admin** (the webapp's join says `isBrandAdmin`) starts `brandUsers` with the brand's existing Marketplace
  members: the users with that `priv_brandStudioId`, the admin excepted. One page (the Integration API's default of
  100), enough for an event brand.

---

## 3. What doesn't change

- **What follows the confirm page:** `createWithIdp` creates the Sharetribe account, `notifyUserCreated` reports it
  to the webapp's `POST /brand/{brandStudioId}/user`, which finds the existing user in that brand and answers with
  their `studioId`, `communityId`, `isBrandAdmin` and `companyName` (the webapp's session makes that path save their
  `marketId`), and the job writes the metadata as for any member.
- **A person the webapp doesn't know** (a buyer, a brand admin making a new brand, a creator who applies): as today.
- **A brand admin who signs up to make a new brand** (`brandStudioId` unset): unchanged; their brand is new, so it
  has no members to list.
- **A member whose brand has a Marketplace admin:** unchanged, the admin's fields are copied and the member joins
  the admin's list.
- **Logins of people who already have a Sharetribe account:** no lookup.

---

## 4. Tests

`yarn test-server`, with the webapp client and the Sharetribe SDK mocked.

- **`server/api/auth/loginWithIdp.test.js`** (new): each row of §2.1's table, including a lookup that throws; the
  login that finds a Sharetribe account never looks up.
- **`server/api-util/studioHelper.test.js`:** `lookupUser` posts `{ email }` with its timeout and returns the user,
  or `null` on the interceptor's `{ data: {} }`.
- **`server/scripts/events/notifyUserCreated.test.js`:** §2.3's two cases, and the existing member and admin paths,
  unchanged.

---

## 5. Rollout

- **QA first**, after the webapp's lookup and its join fix (user-sync §5.3): the webapp, then this repo and Popup
  Studio (user-sync §9).
- **PROD in the same order**, once QA passes.
- **Undo:** redeploy the previous version. Accounts already made stay as they are.

---

## 6. Manual Testing Plan

### Prereqs

- **QA**, with the webapp's lookup and its join fix (user-sync §5.2, §5.3) **and** this repo deployed. Without the
  webapp's lookup, every row below reads "as today".
- **Two brands Popup Studio linked on QA, each with people its Accounts step created** (user-sync §6.3, after
  `npm run qa:setup`): brand **X** with its admin **XA** and a member **XM**, brand **Y** with **YA** and **YM**.
  The webapp's brand details name each brand's admin. None of the four has a Marketplace account. Their password
  is `LeBook_123`.
- **Two fresh emails** (**N1**, **N2**) that have never signed up on QA. For §6.4, **a webapp creator with no Marketplace
  account** (**C**), if QA has one.
- Each sign-up is finished by the event job a few seconds later: after confirming, wait and reload before checking.
- Use a new private window for each person. The `/signup/*` links open Auth0's sign-up screen: the people Popup
  Studio created already have an Auth0 account, so they choose **Log in** there.

### 6.1 Brand X: the member before the admin

| # | Action | Expected |
|---|---|---|
| 1 | Open `/signup/buyer` and log in as XM with `LeBook_123` | The confirm page reads "Finish setting up your Luupe account", with no brand name, website, "About us" or industry fields |
| 2 | Confirm | The account is created |
| 3 | As XM, open Profile settings | Brand X's name is shown (the webapp's). Website, "About us" and industry are empty and not editable |
| 4 | As XM, open `/account/brand-management` | Redirected to Contact details: XM isn't an admin |
| 5 | In the webapp's admin, open XM's user | Its Marketplace id is filled in (the webapp's join fix) |
| 6 | Open `/signup/creative-seller` and log in as XA | The same brand-member confirm page as row 1, not the creator application |
| 7 | Confirm, then as XA open Profile settings | Brand X's name; website, "About us" and industry are empty and editable |
| 8 | As XA, open `/account/brand-management` | XM is listed under "Brand users" |
| 9 | As XA, fill in the website and save; as XM, reload Profile settings | XM shows the same website |

### 6.2 Brand Y: the admin before the member

| # | Action | Expected |
|---|---|---|
| 1 | Open Brand X's invitation link (`/signup/studio-brand/{X's id}`) and log in as YA | The brand-member confirm page. It joins Y, not X: the webapp's brand wins over the link |
| 2 | Confirm, then as YA open Profile settings and `/account/brand-management` | Brand Y's name; Brand management reads "No brand users yet." |
| 3 | Open `/signup`, pick any sign-up, and log in as YM; confirm | The brand-member confirm page; the account is created |
| 4 | As YM, open Profile settings | Brand Y's name, as YA has it |
| 5 | As YA, reload Brand management | YM is listed; XA and XM aren't |

### 6.3 A person the webapp doesn't know

| # | Action | Expected |
|---|---|---|
| 1 | Open `/signup/buyer` and sign up as N1 | As today: the buyer confirm page |
| 2 | Open `/signup/creative-seller` and sign up as N2 | As today: "Apply to be a creative seller on The Luupe" |

### 6.4 A webapp creator (only if QA has one with no Marketplace account)

| # | Action | Expected |
|---|---|---|
| 1 | Open `/signup/buyer` and log in as C | "Apply to be a creative seller on The Luupe", with the location field |
| 2 | Confirm | The account is created as "applied"; the seller-approval message appears in the Slack user-manager channel, as for any creator |

### Not changed (spot-check for regressions)

- **A login with a Marketplace account** (any of the people above, logging in again): straight in, no confirm page.
- **A brand admin making a new brand** from `/signup/studio-brand` with a fresh email: as before, the admin of a new
  brand with the name they typed.
- **A member joining a brand that already has a Marketplace admin**: the admin's fields are copied, and they join
  the admin's list ([`brands-without-admin.md`](./brands-without-admin.md) §6.4 row 1).
