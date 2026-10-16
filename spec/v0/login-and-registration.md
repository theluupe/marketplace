# Login and registration: every user type, across the Marketplace, Auth0 and the webapp

> **Status:** ✅ Implemented: phases 1–3 on PROD (2026-10-16), after QA passed §12. Phase 4, a one-off clean-up of
> PROD data (§11.5), is still to run. Approved by Rafael (2026-10-15), written step by step with his approval at each
> step (2026-10-14/15) and built one step at a time (§11). The webapp's part (phase 2) has its own spec,
> [`webapp/spec/marketplace-login-and-registration.md`](../../../webapp/spec/marketplace-login-and-registration.md),
> built in parallel.
>
> **Goal:** make login and registration secure, reliable and clear for every user type, across the Marketplace,
> Auth0 and the webapp.
>
> **Scope.** In: the Marketplace's sign-up and login, the background job that runs after sign-up, the Auth0 Actions
> and rules saved in the repos, and the webapp's login and endpoints where they touch these people. Out: Studio
> (noted only where it shares the Auth0 tenant), Popup Studio's own screens, payments.
>
> **Baseline:** Marketplace `dev` @ `a81956461`, webapp `dev` @ `a4fa0bbb`. Auth0 as saved in `webapp/etc/auth0/`;
> the live tenant isn't checked.
>
> **Builds on:** the review of 2026-10-14, and [`webapp-user-first-sign-up.md`](./webapp-user-first-sign-up.md),
> which added the webapp lookup at sign-up.

---

## 1. How it works today

### 1.1 The systems

| System | Role |
|---|---|
| **Auth0** | One tenant per environment, shared by the webapp, the Marketplace and Studio. It holds passwords and Google logins. Actions add claims to the access token |
| **Marketplace (Sharetribe)** | Its own account for each person, created only by the person on their first visit (`createWithIdp`). No server can create one |
| **Webapp** | Holds `User`, `Brand` and `BrandUser`. Created by the Marketplace's background job, by Popup Studio, or by the Slack approval of a creator's community application |
| **Background job** | Runs inside every Marketplace server process (`server/index.js:41`): six scripts, each fetching events 10 at a time. It waits 1 minute after a full page and **5 minutes otherwise**, so a new sign-up waits up to about 5 minutes. Each script's saved position lives in the webapp (`/sequence`) |
| **Slack** | Approves creators' seller and community applications |
| **Circle** | The community. Its webhook writes Auth0 roles and Sharetribe membership |
| **Segment, Referral Factory** | Analytics and emails; the referral code |

### 1.2 The common path, for every type

1. A page sends the person to `GET /api/auth/auth0/login` (`server/apiRouter.js:137`, `server/api/auth/auth0.js:44`).
   That opens Auth0's login with the `ext-mp-*` parameters: user type, brand id, return paths.
2. Auth0 runs two Actions:
   - `Add-marketplace-metadata` copies those parameters into the access token as `<NS>/routes` and `<NS>/profile`,
     unchecked.
   - `Force-email-verification` (saved in the webapp repo only) is **not live**: email verification is off in Auth0
     (Rafael, 2026-10-14). The only email check is Sharetribe's own verification, on the Marketplace.
3. The callback (`apiRouter.js:158`, `auth0.js:66`) reads the claims. The user type defaults to buyer (`auth0.js:71`).
   Then it calls `loginWithIdp` (`auth0.js:98`).
4. `server/api/auth/loginWithIdp.js`:
   - **They have a Sharetribe account:** they're logged in and sent to `from` or `/` (`:121-123`).
   - **Otherwise, including any error:** the Marketplace asks the webapp's `/user/lookup`, sets the `st-authinfo`
     cookie (valid 15 minutes) and sends them to `/confirm` (`:160`).
5. On `/confirm`, the form posts to `/api/auth/create-user-with-idp` (`apiRouter.js:130`), which runs `createWithIdp`
   and then `loginWithIdp`.
6. In the background, a `user/created` event reaches `server/scripts/events/notifyUserCreated.js`, up to about 5
   minutes later. It creates the webapp record and writes Auth0 metadata, the Slack message, the referral code and
   Segment events. Later edits go through `notifyUserUpdated.js`.

Sessions, logout and error pages are covered in §8.

---

## 2. Buyer

### 2.1 Every case

| # | Case | What happens today |
|---|---|---|
| B1 | **New, picks "Buyer"** on `/signup`, or opens `/signup/buyer` | Auth0 opens on its sign-up screen (`Signup/BaseSignup.js:22`, `AuthenticationPage.js:325`). They come back to `/confirm` as a buyer, and the account is created |
| B2 | **New, with a password** | Auth0 doesn't check the email (§1.2). After the account is created, the Marketplace asks them to verify it with Sharetribe's own email (`EmailVerificationInfo`, `AuthenticationPage.js:270`) |
| B3 | **New, with Google** | Straight to `/confirm` |
| B4 | **New, but clicked "Log in"** | Auth0 opens on its login screen; they switch to "Sign up" there. They come back **as a buyer by default** (`auth0.js:71`), even if they meant to apply as a creator |
| B5 | **Logged out, on a protected page** (for example "Buy") | Sent to the `/signup` chooser (`Routes.js:177`), which presents the user types. After sign-up or login they return to the page, because `from` is kept. A returning buyer has to pick a tile and then find Auth0's own "Log in" link |
| B6 | **Has an Auth0 account from elsewhere** (webapp, Studio), and the webapp doesn't know them as a brand member or creator | `/confirm` as a buyer, or as the type their link carried |
| B7 | **The webapp knows them** as a brand member or creator | Not a buyer: §6 |
| B8 | **Changes the email field on `/confirm`** | The field is editable (`ConfirmSignupForm.js:104-116`). The Marketplace account gets an email Auth0 doesn't have, and nothing reconciles them |
| B9 | **Email already used by another Marketplace account** (for example a second, unlinked Auth0 login) | `createWithIdp` refuses it. They see the generic "Signup failed… check your info" |
| B10 | **More than 15 minutes on `/confirm`, or `/confirm` opened directly** | A heading with **no form and no button** (`ConfirmSignupForm.js:93`) |
| B11 | **Account created, but the login step after it failed** | Generic error. A retry gets "email taken", and the same generic error |
| B12 | **Returning buyer** | Logged in, then sent to `from` or `/` |
| B13 | **Returning buyer during a Sharetribe outage or rate limit** | Treated as a new person: `/confirm`, then a generic error (`loginWithIdp.js`, `.catch`) |
| B14 | **An Auth0 error** (a cancelled Google login, a stale login tab, Auth0 down) | Express's plain "Bad Request" page (`express-openid-connect` `lib/context.js:531-582`). The sign-up page's error banner (`st-autherror`, `AuthenticationPage.idpAuthFailed`) is never set for these |

### 2.2 What each system holds afterwards

- **Sharetribe:** `userType: buyer`, the newsletter choice, and the referral code once the job has run.
- **Auth0:** the account. Its `marketId` and `userType` are written **only indirectly**: storing the referral code
  triggers `notifyUserUpdated`, which syncs Auth0 (`notifyUserUpdated.js:279-293`). If the referral call fails (its
  errors are swallowed), Auth0 isn't updated until the buyer next edits their profile.
- **Webapp:** nothing. A buyer who opens the webapp gets its 452 "no access" page.
- **Segment:** identified as `BUYER`. **Referral Factory:** added. **Circle:** nothing.

### 2.3 Later changes

- **Buyer → creator:** a switch in Profile settings shows the same application as sign-up: the creator's fields and a
  required location (`ProfileSettingsForm.js:93,150,215-231`). Saving sets `userType: creative-seller`
  (`ProfileSettingsPage.js:102`), and the job marks them APPLIED and posts to Slack (`notifyUserUpdated.js:84-101`). See §3.
- **Buyer → brand:** not by themselves. Only the Luupe admin's "Assign an existing buyer to a brand" tool in the
  webapp can do it (§5, §7).
- **`userType` is in data the person can write themselves.** Changing it by hand only triggers a Slack warning
  (`userUpdateValidations.js:93-101`, `:214-216`). See §10.
- **Email:** greyed out on Contact details (`ContactDetailsForm.js:281`). **Password:** Auth0's "Forgot password"
  only. **Deletion:** §8.

### 2.4 What depends on the background job (for §9)

Segment, the referral code, and the Auth0 sync (through that side effect). Nothing the buyer sees waits for the job.

### 2.5 Decisions (Rafael, 2026-10-14)

| # | Problem | Decision |
|---|---|---|
| 1 | B2: email verification | **No change.** Verification is off in Auth0 and not wanted there; Sharetribe's verification on the Marketplace is the only one |
| 2 | B14: Auth0 errors show a plain error page | **Left as it is** |
| 3 | B4: "Log in" with no account makes them a buyer | **Buyer stays the fallback, and `/confirm` gets a switch between buyer and creator, both ways** (§2.6.1) |
| 4 | B5: returning buyers on the chooser | **The chooser stays** (people read about the user types there). **It gets a "Log in" link** (§2.6.2) |
| 5 | B10: dead end on `/confirm` | **Fix it** (§2.6.3) |
| 6 | B9, B11, B13: generic or misleading errors | **No change.** Error messages must not reveal their cause (security, and it avoids telling a stranger an email is registered) |
| 7 | B8: the email can drift from Auth0's | **The email is read-only on `/confirm`** (§2.6.4) |
| 8 | §2.2: Auth0's sync depends on the referral code | **The job writes Auth0 directly for buyers** (§2.6.5). A later spec deprecates Referral Factory entirely; this keeps the sync independent of it |

### 2.6 Changes

#### 2.6.1 Switch between buyer and creator on `/confirm`

- **Buyer form:** under it, *"Are you a creative? **Apply as a creator instead**"*. **Creator form:** *"Just here to
  buy? **Sign up as a buyer instead**"*. Copy to confirm while building.
- The switch changes the same page in place: the intro section (`ConfirmIdProviderInfoForm`), the creator's location
  field and the type's user fields. No new login: the type is only sent when they press Confirm. The form starts over
  with the other type (names and email prefilled again from Auth0), so the first type's fields never reach the account.
- **Shown** on every buyer or creator confirm page, whichever way they came. **Hidden** when the webapp chose the type
  (§6; `st-authinfo` carries `userTypeFromWebapp: true`) and on brand sign-ups.

#### 2.6.2 A "Log in" link on the sign-up pages

*"Already have an account? **Log in**"* under the two tiles of the chooser (`Signup/BaseSignup.js`) and on the brand
sign-up page (`Signup/BrandSignup.js`). It reuses the login button (`SSOButton` with `isLogin`) and keeps `from`.
On the brand page it also keeps the invitation (`userType`, `brandStudioId`), so someone with no account who clicks it
still gets the brand's sign-up, not the buyer's.

#### 2.6.3 `/confirm` without its cookie

Instead of an empty page: *"Your sign-up session expired"*, with a **Continue** button that restarts the login. Most
people are still logged in at Auth0, so they come straight back to the form. Rendered after the page has mounted,
because the cookie is only read in the browser (`AuthenticationPage.js:205`).

#### 2.6.4 The email is read-only on `/confirm`

The field shows Auth0's email and can't be edited, and the server ignores any `email` sent to
`/api/auth/create-user-with-idp`, so the Marketplace account always has Auth0's email.

#### 2.6.5 The job writes Auth0 for buyers

`notifyUserCreated` calls `updateAuth0User` (`marketId`, `userType`, names) for buyers too, before it returns,
instead of relying on the referral code's `user/updated` event.

### 2.7 Left as it is

- B9, B11, B13: their messages and the outage path (decision 6).
- B14: Auth0 errors (decision 2).
- `userType` in self-writable data: §10. Buyer → brand: §5 and §7.

## 3. Creative seller

### 3.1 Every case

**Sign-up**

| # | Case | What happens today |
|---|---|---|
| C1 | **New, picks "Apply"** on the chooser, or opens `/signup/creative-seller` | Auth0 sign-up, then the creator `/confirm`: the seller intro, every application field from the hosted config, and a required location (`ConfirmSignupForm.js:191-210`), saved to `privateData.location` |
| C2 | **New, but clicked "Log in"** | Comes back as a buyer; the switch of §2.6.1 lets them change to the creator form |
| C3 | **Webapp creator with no Marketplace account** | §6 |
| C4 | **Existing buyer** turns on "Apply as a creator" in Profile settings | The same application and location (§2.3). The job marks them APPLIED and posts to Slack (`notifyUserUpdated.js:84-101`) |
| C5 | **Returning creator** | Logged in |

**Waiting for review** (C1, C2 and C4)

- **Background job, up to about 5 minutes later:** it writes `sellerStatus: APPLIED`, `communityStatus: APPLIED`,
  `membership: BASIC` and `appliedAt` (`notifyUserCreated.js`, `getExtendedData`), syncs Auth0, and posts **one Slack
  message with two separate decisions**: "accept as a Seller?" and "invite into the community?"
  (`slackHelper/sellerValidationBlocks.js`).
- **What the creator gets:** no email and no "application received" screen; they land on the home page. Profile
  settings shows "APPLICATION RECEIVED" (`ApplyAsSellerToggle.js:15-25`).
- **What stays hidden:** seller menus and their seller profile, until they're approved (`userHelpers.js:302-307`).

**The seller decision** (`server/api/slack/slackInteractivity.js`)

| # | Decision | Result |
|---|---|---|
| C6 | **Approve** | They're allowed to post listings (`:69-72`), a **published profile listing** is created (`:78-99`), `sellerStatus` becomes APPROVED, and Segment sends the "Approved" email (the webapp's `etc/segment/sendgrid.js:211`). Seller menus appear |
| C7 | **Reject** | WAITLISTED, and Segment sends the "Waitlisted" email (`sendgrid.js:214`). Profile settings shows "YOU'RE ON THE WAITLIST". They can't re-apply: only an operator setting them back to APPLIED in Console re-posts the Slack message (`notifyUserUpdated.js:85-101`) |

**The community decision** (independent of the seller decision)

| # | Decision | Result |
|---|---|---|
| C8 | **Approve** | The webapp creator is created (`POST /creator`, matched by email) and they get `communityId`, `studioId` and APPROVED (`:118-144`). The webapp sends the "Approved" email. Studio and community links appear (`userHelpers.js:309-333`), and they can log into the webapp as a creator |
| C9 | **Reject** | Community WAITLISTED, with no email (`sendgrid.js` has nothing for "COMMUNITY - Waitlisted") |

### 3.2 What each system holds afterwards

- **Sharetribe:** `userType: creative-seller`, the application fields, the location, the statuses in metadata, and the
  profile listing once approved.
- **Auth0:** the statuses and ids, after the job run that follows each decision.
- **Webapp:** nothing until the community is approved, then a `CREATOR` user. **Circle:** through the webapp, after
  community approval.
- **Segment:** an Identify call at sign-up with `type: BUYER` and `sellerStatus: APPLIED`; the webapp's Segment
  function stores the traits on the person's SendGrid contact. Approval re-identifies them as `CREATOR`.

### 3.3 Later changes

- **Membership upgrades (Connect, Pro):** through Circle's webhook into the webapp (§10).
- **Profile edits:** the job syncs them to the webapp, Auth0 and the profile listing.
- **Creator → buyer or brand:** no flow; it only triggers a Slack warning.
- **Email, password, deletion:** §8.

### 3.4 What depends on the background job (for §9)

- **The Slack application message:** the team can't review anyone until the job runs, up to about 5 minutes.
- The APPLIED statuses.
- Every Auth0 sync, after sign-up and after each decision.

### 3.5 Decisions (Rafael, 2026-10-14)

| # | Problem | Decision |
|---|---|---|
| 1 | **Approving twice creates a second published profile listing:** nothing checks the current status (`slackInteractivity.js:66-116`). Seen on PROD | **Fix** (§3.6.1). The duplicates already there are removed after the build, on PROD (§11, last item) |
| 2 | **Slack gets its reply only after all the work,** and none on an error (`return res.status(500)`, `:219`). Slack expects one within 3 seconds, so operators may see "didn't respond" and click again | **Fix** (§3.6.2) |
| 3 | **A failed community approval still says APPROVED:** the webapp's error is swallowed, so they're APPROVED with no `studioId`; Slack says "approved", the links stay hidden, and nobody is told | **Fix** (§3.6.3) |
| 4 | **Community approval crashes when `creativeSpecialty` is empty** (`.join`, `:122`) | **Fix** (§3.6.4) |
| 5 | **A profile edit's sync crashes when `mentorship` is empty** (`notifyUserUpdated.js:228`): the webapp and Auth0 updates for that edit are lost | **Fix** (§3.6.4) |
| 6 | No confirmation after applying | **No change** |
| 7 | A waitlisted creator can't re-apply | **No change:** an operator re-opens them in Console |
| 8 | No email for the community waitlist | **No change** |
| 9 | Segment identifies applicants as `BUYER` | **No change:** expected |
| 10 | **Slack approvals can be forged** | **Fix** in §10 |

### 3.6 Changes

#### 3.6.1 Approve once

`approve_seller` acts only while `sellerStatus` is APPLIED, and `approve_community` only while `communityStatus` is
APPLIED. Otherwise the click changes nothing, and the Slack message says the current status. Rejecting is
unchanged. The status only changes at the end of the work, so a second click on the same decision while the first is
still running is ignored (one instance, §9.4.5).

#### 3.6.2 Reply to Slack first

`slackInteractivity` answers Slack with a 200 straight away, then does the work, then updates the message as today.
If the work fails, it updates the message to say so ("Couldn't complete this. Try again") and keeps the buttons;
the note goes when a later click works. The work after the answer needs CPU between requests (§9.4.5).

#### 3.6.3 A failed community approval changes nothing

When the webapp returns no `studioId` or `communityId`, `approveCommunityHandler` doesn't write APPROVED, and the
Slack message says the webapp couldn't be reached, with the buttons kept (§3.6.2).

#### 3.6.4 Empty lists

`creativeSpecialty` (`slackInteractivity.js:122`) and `mentorship` (`notifyUserUpdated.js:228`) are treated as empty
lists when they're missing.

## 4. Brands

The brand admin and the brand member share one flow and one set of rules, so they're one section (Rafael,
2026-10-14). The webapp decides who is a brand's admin, and the Marketplace follows it.

### 4.1 Where brand people come from

| Source | How |
|---|---|
| **The new-brand link**, `/signup/studio-brand` | Copied by **"Invite New Brand"** on the webapp's admin dashboard (`webapp/src/atoms/InviteBrandButton.tsx:16`), and the target of the webapp's `/signup/brands` (`webapp/next.config.js:108`). Nothing in the Marketplace links to it. It's generic, so anyone who has it can create a brand. **Kept as it is** (decision 1) |
| **An invitation link**, `/signup/studio-brand/:brandId` | Copied from the Marketplace's Brand management (`BrandManagementPage.js:51-79`) or from the webapp's brand details (`webapp/server/graphql/schema/Brand/resolvers.ts:18-21`). The brand id is the whole invitation: it never expires |
| **Brands and brand users created in the webapp** | Today by Popup Studio's sync (`webapp/server/lib/popupStudio.ts`). They exist in Auth0 and the webapp before anyone has a Marketplace account |
| **The webapp lookup at first sign-up** | A person the webapp knows as a brand user is sent to their own brand ([`webapp-user-first-sign-up.md`](./webapp-user-first-sign-up.md)); its rules change in §4.5.3 |
| **Luupe's "Assign an existing buyer to a brand"** | §7 |

**The admin rule.** The webapp decides: a brand's admin is `Brand.adminId`. When a brand has **no** admin, the first
**new** person to join it takes the seat, atomically (`webapp/server/lib/brand.ts`, `addBrandUser`, the claim); a
person the webapp already knows never does. The Marketplace marks someone admin only when the webapp says so. Kept
(user-sync decision 12; Rafael, 2026-10-14).

### 4.2 Every case

| # | Case | Today | Decision (Rafael, 2026-10-14) |
|---|---|---|---|
| BR1 | **New person, new-brand link** | Brand page, Auth0 sign-up, `/confirm` with the brand fields (no brand id, so `isBrandAdmin = true`, `ConfirmSignupForm.js:177-183`). The job creates the brand up to ~5 minutes later | Join during sign-up (§4.5.1). The page gets its own copy (§4.5.2) |
| BR2 | **Two people of one company** both use the new-brand link | Two brands; nothing compares names | **No change:** Luupe handles it internally |
| BR3 | **New-brand link, the person is the admin of a webapp brand** (for example one Popup Studio created) | The lookup sends them to their brand's member form, and the join makes them its admin, with the brand fields hidden | They're registering their brand on the Marketplace: **the new-brand form, prefilled with the brand's webapp name (locked)**; `POST /brand` returns their brand and they become its Marketplace admin (§4.5.3) |
| BR4 | **New-brand link, the person is a plain member of a webapp brand** | Sent to their brand as a member | **Error page** (§4.5.6) |
| BR5 | **Any brand link, the person is a webapp creator** | The lookup sends them to the creator sign-up, silently | The creator sign-up, **with a banner** (§4.5.3) |
| BR6 | **New person, invitation, the brand has an admin** | A member. Their webapp user, and so their projects, arrive with the job, **up to ~5 minutes later** (the webapp's 452 page tells them to "wait a few minutes") | **Join during sign-up** (§4.5.1): projects available at once |
| BR7 | **New person, invitation, the brand has no admin** | They take the seat (the admin rule) | Kept, joined during sign-up, then **"Complete your brand profile"** (§4.5.4) |
| BR8 | **Invitation with an unknown or deleted brand id** | The account is created, the join fails silently: a member of nothing, with a blank brand name | **Error on the brand page, before any sign-up** (§4.5.2), checked again at `/confirm` and at the join |
| BR9 | **Invitation of brand Y, the person is in webapp brand X** | The lookup silently sends them to X. If the lookup failed, the join to Y is refused and they're a member of Y on the Marketplace only | **Error page** (§4.5.6) |
| BR10 | **Invitation of their own webapp brand** | Member form; the join returns their user (`addBrandUser`, same-brand path) with the webapp's admin flag | Joined during sign-up. If the webapp says they're its admin: the prefilled brand form, as BR3 |
| BR11 | **Webapp brand: a plain member signs up first** | A member; no Marketplace admin yet; the brand name from the webapp | **OK** |
| BR12 | **Webapp brand: the admin signs up after some members** | The admin, with those members in `brandUsers` | **OK** |
| BR13 | **Webapp brand: the admin signs up first**, its members aren't on the Marketplace | `brandUsers: []`; Brand management reads "No brand users yet" | **OK:** `brandUsers` lists Marketplace accounts only |
| BR14 | **Webapp brand whose admin never comes** to the Marketplace | Nobody can edit its brand fields or open Brand management there | **Kept** |
| BR15 | **Already on the Marketplace** (buyer or creator) opens a brand link | Logged in; the link is ignored silently | **A notice after login** (§4.5.5) |
| BR16 | **The lookup failed, new-brand link, a known email** | `POST /brand` returns that person's existing brand and the Marketplace makes them its admin, even if they're a member (`brand.ts:106-108`); a webapp creator becomes an admin with no brand | **`POST /brand` refuses a known email, unless that person is a brand's admin** (then it returns that brand: BR3, or a retry) (§4.7) |
| BR17 | **The webapp fails during the join** | Swallowed: an admin with no brand, or a member with no webapp access, and nobody is told | **The sign-up fails**, with Try again; nobody is left half set up (§4.5.1) |
| BR18 | **Two people go for an empty seat at once** | Safe: the claim is atomic | **OK** |
| BR19 | **A brand is renamed** | Only the Marketplace admin can rename it; the job copies the name to the members and the webapp. Nothing in the webapp renames brands (Popup Studio only creates them) | **OK.** When Studio adds renaming, it writes the name to the Marketplace admin and lets the job copy it |
| BR20 | **A member's Marketplace account is deleted** (the hidden `/account/manage` page, or Console) | Its id stays in the admin's list; every later brand edit by the admin fails partway: the members still get it, but the name never reaches the webapp and the admin's own sync is skipped (`notifyUserUpdated.js:52-64`) | **Skip and remove deleted accounts** (§4.5.7). `/account/manage` stays |
| BR21 | **Changing the admin, or removing a member** | Impossible anywhere | **Not now:** part of the new Studio |
| BR22 | **A second login method** (Google once, a password once) | Two Auth0 accounts | §8 |

### 4.3 What the background job does today

**New brand** (no brand id): `POST /brand` creates the `User`, the `BrandUser` and the `Brand`, then sets the admin in a
second write; syncs Circle; sends Segment's "NEW_BRAND - Welcome", for which the webapp's SendGrid function has no
email. The Marketplace then gets `brandStudioId`, `isBrandAdmin: true`, `brandUsers: []`, `communityId`, `studioId`.

**Invitation** (a brand id): `POST /brand/:brandId/user` joins or creates the user and syncs Circle. With the webapp's
`isBrandAdmin`: the brand's name and its existing Marketplace members as `brandUsers`. Without: the Marketplace
admin's brand fields (or the webapp's name when there's no Marketplace admin yet), and an entry in the admin's
`brandUsers`.

Then, for both: the Auth0 sync. Auth0 never gets the brand id or the admin flag. **Until all this has run, there's no
Brand management tab, no invite link, no Studio or community link, and no webapp user.**

### 4.4 What each system holds afterwards

- **Sharetribe:** `userType: studio-brand`, `privateData.brandStudioId`; in metadata `isBrandAdmin`, `studioId`,
  `communityId`, `membership: BASIC`, and `brandUsers` on the admin; the brand fields in `publicData` (the admin's
  own, copied to every member).
- **Webapp:** `User` (`type: BRAND`), `BrandUser`, `Brand` with only its name and admin.
- **Auth0:** the account, with `marketId`, `studioId`, `communityId`, `userType`.
- **Circle:** a member, through the webapp.

### 4.5 Changes

#### 4.5.1 Join during sign-up

For every brand sign-up (BR1, BR3, BR6, BR7, BR10, and the lookup's brand members of §6), `/confirm`'s submit does the
whole brand join before the person lands anywhere:

1. `createWithIdp`: Sharetribe checks the Auth0 login and creates the account. It comes first because it's what
   verifies who the person is; joining the webapp first would mean trusting a login token nobody has checked.
2. **The webapp join**, with the new Marketplace id: `POST /brand` or `POST /brand/:brandId/user`.
3. **The Marketplace brand data**, as the job writes it today (§4.3), except `communityId`.
4. Log in and redirect.

**If step 2 or 3 fails, the sign-up fails:** no login, and the page shows *"We couldn't finish creating your account.
Please try again."* with **Try again**, which re-runs steps 2 and 3 for the account. A person who leaves and logs in
later is shown the same screen instead of the Marketplace, so nobody lands half set up.

- **Retries are safe:** the invitation join returns the same user for someone already in that brand, and `POST /brand`
  returns the brand of a person who's already its admin (§4.7).
- **The webapp call waits at most 20 seconds** (today's client: 45). The Confirm button shows a spinner meanwhile.
- **The job no longer calls the webapp's join for brand users.** It keeps the Auth0 sync, the referral code, Segment,
  and **the Circle step**, which leaves the join (§4.7): it calls the webapp's new community route and writes
  `communityId`. The community link appears with the job; the projects are available at once.
- **One shared function** does steps 2 and 3, used by the sign-up, the Try again screen and Luupe's tool (§7).

Built (step 3.4): `joinBrand` (`server/api-util/brandJoin.js`) does steps 2 and 3; it writes `studioId` last, with
the rest of the brand data, so a brand user without one hasn't been joined. Steps 2 and 3 run right after the login
of step 4 (`server/api/auth/finishSignup.js`), which needs the account to find it; a failure logs the person out
again in the same answer, so they never land logged in. **Every login runs the same check:** a brand user who isn't
joined is joined then, and gets the Try again screen only if it fails again. **Try again is a login** (they're still
logged in at Auth0, so it's a quick round trip). The job's brand users get Segment, the referral code and Auth0; their
`studioId` reaches Auth0 with the `user/updated` event of the join's write. Luupe's tool calls `joinBrand` too (§7.4).

Built (step 3.5): the Circle step runs in `notifyUserUpdated`, on the join's own write (the event that adds
`studioId`), not on `user/created`: the join can finish later, at a login. It calls `POST /user/:userId/community` and
writes `communityId`; Auth0 gets it with the next update's sync. A failure sends the usual alert (§9.4.3), with no
retry.

#### 4.5.2 The brand pages

- **New-brand page** (`/signup/studio-brand`): its own copy instead of the invitation's, for example *"Set up your
  brand on The Luupe"* (to confirm while building).
- **Invitation page** (`/signup/studio-brand/:brandId`): names the brand: *"You've been invited to join **Acme** on The
  Luupe"*.
- **Unknown brand id:** *"This invitation link isn't valid. Ask your brand's admin for a new one."*, with no sign-up
  button.
- The page asks a new public Marketplace endpoint for the brand's name, which asks the webapp (§4.7); unknown means
  404. The brand id is the invitation, so showing its name to whoever holds the link reveals nothing new.

Built (step 3.6): the endpoint is `GET /api/invitation-brand/:brandStudioId` (`server/api/invitation-brand.js`): the
brand's name only, 404 for an unknown brand, 502 when the webapp fails. The page's loadData asks for it in the browser
only (the server's render can't call the app's own API), so the invitation shows a spinner until it answers. A failure
keeps today's generic invitation, with its sign-up. `/confirm` checks it again for an invitation the webapp didn't
decide (someone it doesn't know): an unknown brand refuses the sign-up (`404 invalid-invitation`) with the same
message, so no account is created whose join can never succeed. Both brand pages keep today's description.

#### 4.5.3 The lookup's rules

Changes [`webapp-user-first-sign-up.md`](./webapp-user-first-sign-up.md) §2.1. The webapp's lookup also returns
`isBrandAdmin` (§4.7) and whether the login matches (§6.4.1).

| The link | The webapp says | Result |
|---|---|---|
| No brand (the chooser, the buyer or creator sign-up, "Log in") | A brand member | Their own brand's member form, as today |
| No brand | A creator | The creator sign-up, then approved automatically (§6.4.2) |
| Any link but another brand's invitation | **Their brand's admin** | **The new-brand form, prefilled with the brand's webapp name, locked**; they complete the website, "About us" and industry. The join makes them its Marketplace admin |
| An invitation to their own brand | A member | Their brand's member form |
| The new-brand link | A member | **Error page** (§4.5.6) |
| An invitation to **another** brand | A brand user | **Error page** (§4.5.6) |
| Any link but the creator sign-up | A creator | The creator sign-up with a banner: *"This account is set up as a creator account."*, and no switch back to buyer; then approved automatically (§6.4.2) |
| Any link | A user in no brand (no type, or a brand user without a brand) | The buyer sign-up with a banner, and no switch to creator (§6.4.3) |
| Any link | Known, but this login isn't the Auth0 account the webapp has for them | The §8 error page (§6.4.1) |
| Any link | Nobody, or a failed lookup | As the link says |

The admin row covers the links without a brand too (step 3.2): "as today" would make them its admin with the brand
fields hidden, BR3's problem. The rules are `signupFromWebapp` in `server/api/auth/webappSignup.js`; the error pages
are `st-autherror` codes (`second-login`, `invitation`).

#### 4.5.4 "Complete your brand profile"

Someone who becomes the admin by taking an empty seat (BR7) can't be known before the join. Right after their
sign-up they land on Profile settings with *"Complete your brand profile"*, the brand's name prefilled from the
webapp. Only the name syncs back to the webapp: it's all the webapp holds.

Built (step 3.7): "a brand's admin who has filled in none of its website, About us and industry"
(`isBrandProfileIncomplete`, `src/util/userHelpers.js`) marks them; the join has already written the webapp's name.
Right after the sign-up, `/confirm` sends them to Profile settings instead of the home page or `from`. With an
unverified email they see the verification page first, whose "Later" already leads to Profile settings. The banner
shows there for as long as none of the three is filled in.

#### 4.5.5 A notice for existing accounts

When a person who already has a Marketplace account (buyer or creator) logs in through a brand link (BR15), they get
a one-time notice: *"You're registered as a buyer. To join a brand, please get in touch with your contact at The
Luupe."* ("as a creator" for creators). No email address: brand people have a direct contact at Luupe.

Built (step 3.6): at login, `loginWithIdp` sets the `st-authnotice` cookie when the link was a brand link and the
account is a buyer's or a creator's; the Topbar shows it in a modal once (`LoginNotice.js`) and removes the cookie.

#### 4.5.6 The error page

BR4 and BR9: *"We couldn't use this invitation with your account. Please get in touch with your contact at The
Luupe."* It doesn't say why (§2.5, decision 6), and carries no email address.

Built (step 3.6): the `invitation` code, from login (`st-autherror`) or a refused sign-up, shows this page instead of
the sign-up, with no button.

#### 4.5.7 Deleted members

Copying the admin's brand edits (`notifyUserUpdated.js`, `shouldUpdateBrandUsers`) skips accounts that no longer
exist and removes them from the admin's `brandUsers`, so the rest of the update (the name to the webapp, the admin's
own sync) always completes. It copies to the brand's members found as in §9.4.4 (`getBrandMemberIds`, which leaves out
deleted accounts) rather than to the stored list, and writes the list back when it differs, so a member the list lost
gets the edit and is added back.

### 4.6 Left as it is

- The open new-brand link, and duplicate brands (BR2).
- `brandUsers` listing Marketplace accounts only (BR13).
- A brand whose admin never comes to the Marketplace (BR14).
- Changing the admin and removing members (BR21): the new Studio.
- `/account/manage` stays reachable (BR20).
- **Popup Studio's `POST /users`:** unchanged. It already fails unless the webapp and Circle's main step succeed, and
  its retry finishes what's missing (`popupStudio.ts`, `addUser`). Moving Circle out of the Marketplace's joins must
  not touch it.

### 4.7 Webapp changes this needs

Built by the webapp's own spec (§11.3), whose §2 holds the exact requests and answers:

- **`POST /brand`:** refuses an email it already knows, **unless** that person is already a brand's admin: then it
  returns that brand, with its `companyName` (BR3, and a retry of §4.5.1).
- **`POST /brand` and `POST /brand/:brandId/user`:** no Circle step; they answer without `communityId`.
- **New `POST /user/:userId/community`:** runs the existing Circle step (`syncPlatformUser`) and returns `communityId`.
  It does nothing for a user who already has one (`circle.ts:283-285`).
- **`POST /user/lookup`:** also returns `isBrandAdmin`, and the brand's name to prefill the admin's locked form
  (§4.5.3).
- **New `GET /brand/:brandId`:** the brand's name, or 404 (§4.5.2).
- **"Assign an existing buyer to a brand":** enabled again for brands with no admin (§7.4).
- **Popup Studio's routes:** unchanged (§4.6).

## 5. Brand member, invitation link

Merged into §4 (Rafael, 2026-10-14).

## 6. A person the webapp already knows

At their first Marketplace sign-up, the Marketplace asks the webapp who the person is
([`webapp-user-first-sign-up.md`](./webapp-user-first-sign-up.md)).

### 6.1 Principles

Rafael, 2026-10-14; they hold for the new Studio as well.

1. **What the platform knows wins.** A person's type, brand, admin role and approvals come from the webapp (later,
   Studio). The Marketplace follows, and never asks Luupe to approve again what the platform already shows.
2. **No code ever changes a user's Auth0 id** (`providerId`) on the platform. If one must change, Luupe does it by hand.
3. **A known person logs in with the Auth0 account the platform has for them.** Any other login gets the §8 error page.

### 6.2 Who they are

- **Brand users created in the webapp,** today by Popup Studio (§4).
- **Older webapp users** from before the Marketplace, creators or brand users, who never made a Marketplace account.
- **People whose Marketplace account was deleted** while their webapp user remains.

Buyers are never in the webapp.

### 6.3 Every case

| # | Case | Today | Decision (Rafael, 2026-10-14) |
|---|---|---|---|
| K1 | **A brand user** | The lookup sends them to their brand | §4.5.3 |
| K2 | **A creator, through the buyer sign-up or "Log in"** | The creator sign-up; APPLIED and a Slack message; re-approved in Slack even when already in the community (user-sync §10.7) | **The creator sign-up with a banner, no switch back to buyer, and approved automatically** as a seller and for the community, with no Slack message (§6.4.2) |
| K3 | **A creator, through a brand link** (new brand or invitation) | The creator sign-up, silently | **Same as K2** |
| K4 | **The login isn't the Auth0 account the webapp has for them** (Google once, a password once) | Creators: the community approval **overwrites** the webapp user's Auth0 id (`webapp/server/lib/creator.ts:84-86`, `update: data`), so their old login gets the webapp's 409 page. Brand users: the join keeps the old id, so the webapp refuses the new login | **The §8 error page at login** (§6.4.1), and **no code changes `providerId`** (§6.1) |
| K5 | **A webapp user in no brand** (no type, or a brand user without a brand) | Any brand link: the webapp refuses the join, silently. With §4.5.1 they'd be stuck on Try again | **Only the buyer sign-up** (§6.4.3) |
| K6 | **Email case** | The lookup ignores case (`webapp/server/lib/user.ts:143`); the joins and `addCreator` match it exactly. `Ana@x.com` in the webapp and `ana@x.com` from Auth0: the lookup finds them, the join or the approval creates a **duplicate webapp user** | **The webapp's joins and `addCreator` ignore case** (§6.5) |

### 6.4 Changes

#### 6.4.1 The lookup checks the login

The Marketplace also sends the login's Auth0 id (`sub`); the webapp answers whether it is the known user's `providerId`.
When it isn't, the person gets the §8 error page instead of the sign-up, whatever the link.

#### 6.4.2 Webapp creators are approved automatically

- **At sign-up:** any link other than the creator sign-up leads to the creator form with *"This account is set up as a
  creator account."*, and without §2.6.1's switch back to buyer. They fill in the creator form as any creator does
  (its location and fields feed their profile listing).
- **In the job** (`notifyUserCreated`), for a new creator: it **asks the webapp itself** (by email and Auth0 id) and
  never trusts anything the browser sent. When the webapp knows them as a creator:
  - **Seller:** as Slack's Approve does (`slackInteractivity.js`, `approveSellerHandler`): posting allowed, a published
    profile listing, `sellerStatus: APPROVED`, `reviewedAt`.
  - **Community:** `POST /creator`, which for an existing creator only saves its Marketplace id and returns its
    `communityId` and `studioId` (§6.5); `communityStatus: APPROVED`.
  - **No Slack message.**
  - **Emails:** only **"Approved as a seller"** (the seller approval's Segment event, as today). No "Community
    approved": they're already in the community (Rafael, 2026-10-14).
- Anyone the webapp doesn't know as a creator: APPLIED and the Slack message, as today (§3).

Built (step 3.8): Slack's two approvals moved to `server/api-util/creatorApproval.js`, shared by Slack's buttons and
the job. The job asks the webapp with the account's email and Auth0 id, and approves only a creator whose login
matches. **The community comes first:** when the webapp fails there, nothing is approved yet, so the person is handled
as an unknown creator (APPLIED and the Slack message) and the team approves them in Slack as usual. A failure in the
seller approval after that sends the usual alert. The banner shows when the webapp chose the type (`userTypeNotice` in
`st-authinfo`), except for a creator who came through the creator sign-up.

#### 6.4.3 Webapp users in no brand register as buyers

Any link leads to the buyer form with *"This account is set up as a buyer account."*, and without §2.6.1's switch to
creator.

### 6.5 Webapp changes this needs

Built by the webapp's own spec (§11.3), whose §2 holds the exact requests and answers:

- **`POST /user/lookup`:** takes the login's Auth0 id and answers whether it matches the user's `providerId` (with §4.7's
  `isBrandAdmin`).
- **`addCreator` (`POST /creator`):** never writes `providerId` on an existing user, and refuses one that differs. For
  an existing creator it only saves a missing `marketId` and returns the ids: no "Community approved" event, and no
  Segment identify that would reset their membership to BASIC (`creator.ts:104-112`). A new creator: as today.
- **The joins (`addBrandUser`, `addBrandWithAdmin`) and `addCreator`** find the user by email ignoring case, as the
  lookup does.

### 6.6 Supersedes

- [`webapp-user-first-sign-up.md`](./webapp-user-first-sign-up.md) §2.1's creator row ("approved in Slack as usual").
- User-sync decision 10.7 (initiatives repo, `catalog/popup-studio/spec/user-sync.md`): no auto-approval.

## 7. Luupe admin

### 7.1 How a Luupe admin logs in

- **Webapp and Studio only**, with the normal Auth0 login; the webapp finds their `User` by Auth0 id like anyone
  else's. No code creates admin users: Luupe adds them by hand.
- **Admin rights are Auth0 roles** (`role-enterprise-admin`, and `role-platform-admin`), assigned by hand in Auth0. The
  webapp reads them from the login token for page routing (the `Add-studio-metadata` Action), and in GraphQL by
  fetching the role's users from Auth0 and comparing emails (`webapp/server/lib/user.ts:25-80`). Studio uses the same
  role.
- **The Marketplace has no admin login.** Luupe runs it through Sharetribe's Console (its own login) and the Slack
  approvals (§3).

### 7.2 Admin tools that create or change users

| Tool | Where | Effect on users |
|---|---|---|
| "Invite New Brand" | Webapp dashboard | Copies the generic new-brand link (§4.1) |
| "Invite new Brand User" | Webapp brand details | Copies the brand's invitation link (§4.1) |
| **"Assign an existing buyer to a brand"** | Webapp → Marketplace `GET /api/scrips-retry/brandUserAssignment/:brandStudioId/:userId` (API key) | §7.3 |
| Clean-up (QA only) | Webapp `/api/v1/clean-up/*` | Deletes webapp users and brands from its database only. No authentication (§10) |
| Sharetribe Console | Sharetribe | Edits metadata (for example re-opening a waitlisted creator), deletes users (§4.2 BR20) |
| Slack approvals | Slack | §3 |

### 7.3 The "assign a buyer" tool today

`server/api/scripts-retry/retryBrandUserAssignment.js`:

1. Refuses users already in a brand, sellers, and users with Studio access.
2. **Checks the brand by looking for its Marketplace admin** (`validateBrand`: a user with that `priv_brandStudioId` and
   `meta_isBrandAdmin`). With none it answers *"Brand '…' does not exist"*, though the brand may exist in the webapp
   with an admin who has never signed up on the Marketplace (for example one Popup Studio created).
3. Switches the user to `studio-brand`, then **re-runs the job's whole sign-up handler** (`analyzeEvent`), so the
   referral step and Segment run again.
4. **Reports success when the join failed:** the handler swallows its own errors, so the tool answers
   `success: true`, and a second attempt is refused because the user now "already belongs to the brand".
5. Is a GET request that changes data.
6. The webapp disables it for brands with no admin.

### 7.4 Decisions (Rafael, 2026-10-14/15)

| # | Change |
|---|---|
| 1 | **Check the brand in the webapp** (§4.7's `GET /brand/:brandId`): "does the webapp have this brand?" replaces "does it have a Marketplace admin?". A brand with no Marketplace admin is assigned to like any other; an unknown id gets *"Brand does not exist"* |
| 2 | **Use §4.5.1's shared join** (the webapp join, then the Marketplace data) instead of re-running the sign-up handler: no second referral step, no second Segment identify. With no Marketplace admin yet, the person gets the brand's name and nothing else, as any member in that case (§4.3) |
| 3 | **Report the real result.** If the join fails, the user is left unchanged (still a buyer), and the tool says *"Couldn't assign: the platform didn't respond. Try again."* |
| 4 | **A POST** instead of a GET |
| 5 | **The webapp enables the tool again** for brands with no admin (§4.7) |
| 6 | **The admin rule applies** (§4.1): the buyer is a new person to the webapp, so in a brand with no admin at all they take the empty seat and become its admin, in both systems. In a brand with an admin they're a member |

Example, assigning the buyer Bob: to **Acme** (its admin Jane is on the Marketplace), Bob joins, as today. To
**Globex** (created by Popup Studio, its admin Maria never signed up on the Marketplace), Bob joins as a member with the
name "Globex"; today the tool refuses. To **Initech** (created by Popup Studio, nobody in it yet), Bob becomes its admin.
To a mistyped id: *"Brand does not exist"*.

Built (step 3.9): `retryBrandUserAssignment.js` is a `POST` on the same path, and answers `{ success, message? }` as
before. It asks the webapp's `GET /brand/:brandId`; a webapp that can't be asked gets *"Couldn't assign…"*, never
*"does not exist"*. The join is `joinBrand(userId, brandStudioId)`: the buyer's type and brand are written with the
rest of the brand data in its one final update, so a failed join leaves nothing to undo. The other refusals (a
brand user, a seller, someone with Studio access) are unchanged.

### 7.5 What depends on the job (for §9)

Nothing, once change 2 is built.

## 8. Shared by every type

### 8.1 Logging in again

`/login` goes straight to Auth0 (the page is blank while it redirects). With a Marketplace account, the person is
logged in and sent to `from` or `/` (`loginWithIdp.js:121-123`; that redirect is §10's open redirect). Decided
elsewhere: the notice for a brand link (§4.5.5), Try again for an unfinished brand join (§4.5.1), the login check
(§6.4.1), the second-login page (§8.3), and an outage read as a new person, left as it is (§2.5 decision 6).

### 8.2 Sessions and logout

| Session | Cookie | Lifetime | Role |
|---|---|---|---|
| **Auth0 login** | `appSession`, on the shared cookie domain (`AUTH0_COOKIE_DOMAIN`) | 7 days, extended with use (`auth0.js:37`) | The Marketplace reads it only at the login callback. **The webapp reads it too** (`webapp/src/shared/lib/authHelper.ts:14`, the Marketplace's `access_token`), which is how a person logged into the Marketplace opens the webapp without logging in again, provided both apps share the cookie domain and secret (environment settings, not checked) |
| **Sharetribe** | `st-<clientId>-token` | Months (a refresh token) | The Marketplace session itself |

- **Logging out of the Marketplace** (`apiRouter.js:140-153`) ends the Sharetribe session, clears `appSession` (so the
  webapp too) and ends Auth0's session.
- **Logging out of the webapp** (`webapp/src/pages/api/auth/logout.ts`) clears `appSession` and Auth0's session; the
  person stays logged into the Marketplace. **Kept** (Rafael, 2026-10-15).
- **Blocking a user or changing their password in Auth0** doesn't end their Marketplace session. To lock someone out,
  Luupe bans them in Sharetribe's Console and blocks them in Auth0.

### 8.3 Account linking

**Out of this spec:** Rafael handles it separately (2026-10-15). The facts, for that work:

- **Today:** a legacy Auth0 Rule plus the "Account Link" extension, hosted on Auth0's webtask platform
  (`webapp/etc/auth0/rules/auth0-account-link-extension.js`, the same in `studio/`). When a person logs in with a
  second method for the first time (Google after a password, say) and another Auth0 user has their email, it sends them
  to the extension to log in with the first account, then joins the two into one Auth0 user, which keeps the original
  id. It's offered only on that first login; skipping it leaves two accounts. Any error in it fails the login. It
  holds a hard-coded client secret (§10).
- **From 2026-11-18 Auth0 stops running Rules:** every second login method becomes a separate Auth0 user. The webapp
  shows its 409 page; the Marketplace shows the page below. Popup Studio's people (password accounts, `LeBook_123`) who
  click "Continue with Google" are the likely group.
- **Options weighed:** linking by hand through Auth0's Management API; rebuilding the linking as a post-login Action
  with a page of ours; linking automatically by email, which is **unsafe** while Auth0's email verification is off
  (anyone could create a password account with someone else's email and be joined into it).

**Decided (§4.2 BR22):** a person with no Marketplace account for this login, whose email a Marketplace account
already uses, gets an error page before the form, with the webapp's `/error-account` copy: **"Something went wrong."**
*"We experienced an error while attempting to link your accounts. Please contact our support team for assistance."*

Built (step 1.12): when Sharetribe finds no account for the login, `loginWithIdp` looks the email up
(`integrationSdk.users.show({ email })`, case-insensitive). If it's taken, it sets `st-autherror` to
`{ code: 'second-login' }` and redirects to `/signup`, which shows this page instead of the tiles. If the lookup
fails, the sign-up carries on as before (§2.5 decision 6).

The page has a **Log out** button (Rafael, 2026-10-16): the person is still logged in at Auth0 with the second account,
so "Log in" would bring them back here. Log out is the Marketplace's own (`/api/auth/auth0/logout`: it ends that
session and Auth0's, then goes to the home page), so their next login asks which account to use.

### 8.4 Email verification and password

- **Verification:** off in Auth0; only Sharetribe's own (§1.2). No change.
- **Password:** Auth0's hosted "Forgot password" only; the Marketplace's own reset route is disabled
  (`routeConfiguration.js`). It serves Popup Studio's people as well. No change.

### 8.5 Every sign-up and login message

| Message | When | Section |
|---|---|---|
| Express's plain error page | An Auth0 error (a cancelled Google login, a stale tab) | §2, left as it is |
| "Signup failed. Please make sure all the information you entered is correct…" | `createWithIdp` fails | §2, left as it is |
| "Your sign-up session expired" + Continue | `/confirm` without its cookie | §2.6.3 |
| "We couldn't finish creating your account" + Try again | The brand join fails | §4.5.1 |
| "This invitation link isn't valid…" | An unknown brand id | §4.5.2 |
| "We couldn't use this invitation… your contact at The Luupe" | Another brand's link, or a member using the new-brand link | §4.5.6 |
| "Something went wrong… link your accounts… support team" + Log out | A second login method, or a login that isn't the platform's | §8.3, §6.4.1 |
| One-time notice "You're registered as a buyer/creator…" | An existing account opens a brand link | §4.5.5 |
| Banners on `/confirm` ("set up as a creator/buyer account") | The webapp chose the type | §4.5.3, §6.4 |

Building note: the page-level ones (session expired, the brand join, the invitation error, the second login) can be one
page with variants, sharing a layout.

## 9. The sync behind sign-up

Decided with Rafael, 2026-10-15: what each user type leaves to the background job, how the job handles failures,
its poll time, and the Cloud Run settings it runs on.

### 9.1 How the job works today

- **Where it runs:** inside the Marketplace's server process (`server/index.js:41`). Six scripts, each with its own
  loop: `notifyUserCreated`, `notifyUserUpdated`, `notifyProfileListingUpdated`, `notifyPortfolioListingUpdated`,
  `notifyProductListingCreated` and `notifyProductListingRejected` (`server/scripts/events/index.js`).
  `MARKETPLACE_IGNORE_SCRIPTS` turns them all off (`server/scripts/index.js:5`).
- **Its saved place:** each script stores the sequence number of the last event it handled in the webapp
  (`/sequence/:name`), and reads it once, at start (`scriptManager.js:84-88`). With none, it starts from "now".
- **Each loop** (`scriptManager.js:90-160`):
  1. Fetch up to 10 events after the saved place.
  2. Handle them one by one. Each handler catches its own errors and posts a Slack alert for that user or listing.
  3. Save the place past the batch (`:128`).
  4. Wait 1 minute after a full page, and 5 minutes otherwise (`:78-80`).
- **A loop still running after 5 minutes** is given up on: a new one starts 1 minute later, while the old one carries
  on (`:145-157`).
- **The webapp client** (`studioHelper.js`) logs each failed call and turns it into an empty answer (`{ data: {} }`).

### 9.2 What goes wrong, and the decisions

| # | Problem | Decision |
|---|---|---|
| J1 | **The saved place can't be read at start** (the webapp is down or slow), so the script starts from "now" (`scriptManager.js:162-172`): every event since the last save is skipped for good | **Fix** (§9.4.2) |
| J2 | **A failed event isn't retried:** its handler posts a Slack alert, and the place moves past it | **No change:** the alert and a fix by hand are the intended way (Rafael). An automatic retry was considered and dropped |
| J3 | **A failed save of the place goes unnoticed.** The next save repairs it, but a restart before then handles up to 10 events again (for example, a second Slack application message) | **No change:** rare, and the next save repairs it |
| J4 | **The 5-minute limit stops the waiting, not the work:** a batch running over 6 minutes can be handled twice at once | **No change:** it takes the webapp hanging for minutes |
| J5 | **Each server instance runs its own copy of the job:** with more than one, every event is handled once per instance | **Solved by the Cloud Run settings** (§9.4.5) |
| J6 | **Request-based billing gives no CPU between requests:** on a quiet site the job's waits and work stall until someone opens a page | **Solved by the Cloud Run settings** (§9.4.5) |
| J7 | **Webapp failures are silent:** the client's empty answer reads as success, so no alert is sent | **Fix in the job** (§9.4.3). The sign-up's own calls are handled in §3.6.3, §4.5.1 and §7.4; the API key in the client's logs is §10 |
| J8 | **The admin's `brandUsers` is read, changed and written back:** two members joining at once can drop one of them for good. Joining during sign-up (§4.5.1) makes it likelier | **Fix** (§9.4.4) |
| J9 | **The referral client has no timeout:** a hung call stalls a whole loop | **Left to the Referral Factory spec** |

### 9.3 Each user type: what stays in the job

| Type | In the job | During sign-up instead |
|---|---|---|
| Buyer | Segment, the referral code, Auth0 (§2.6.5) | Nothing |
| New creator | APPLIED, the Slack application message, Segment, the referral code, Auth0 | Nothing |
| Webapp creator | The automatic approval (§6.4.2), Segment, the referral code, Auth0 | Nothing |
| Brand user | Circle (`communityId`), Segment, the referral code, Auth0 | **The webapp join and the brand data** (§4.5.1) |
| Luupe admin's "assign a buyer" tool | Nothing (§7.5) | Not applicable |
| Later edits, every type | The brand fields to members, names to the webapp, the profile listing, Auth0 | Nothing |

Only the brand join moves: without it a brand user lands with no brand. Nothing else in the job blocks what anyone does
next, and moving it would make sign-up slower and give it more ways to fail. With §9.4.1 and the Cloud Run settings,
what's left waits about 2 minutes at most: a creator's Slack message, a brand user's community link, an automatic
approval.

### 9.4 Changes

#### 9.4.1 Poll every 2 minutes

The idle wait drops from 5 minutes to **2**, for all six scripts (`scriptManager.js:78`). After a full page it stays at
1 minute, and at 30 seconds in development.

#### 9.4.2 Never skip events at start (J1)

At start, each script reads its place until the webapp answers `success: true`, trying again every minute and logging
each failure. Only a successful answer with no place stored (a script's very first run) starts from "now". Meanwhile
the script doesn't poll, so events wait and none is lost. `getScriptSequence` already returns `success`, so the client
doesn't change.

#### 9.4.3 Webapp failures in the job send the usual alert (J7)

- **The client still turns a failed call into an empty answer,** so the sign-up's calls and the place's read and
  save keep their own handling. Only its three updates below change: they return whether the webapp answered
  `success: true`, where they returned `true` whatever happened. Only the job calls them.
- **The job checks the webapp's answer.** Every management route answers `success: true` when it works
  (`webapp/server/routers/v1/management.ts`), and the job's calls check it:
  - `PUT /user/:id`, names and avatar (`notifyUserUpdated`);
  - `PUT /brand/:id`, the brand's name (`notifyUserUpdated`);
  - `PUT /user/:id/creator`, the creator profile (`notifyUserUpdated`, `notifyProfileListingUpdated`);
  - the new steps: Circle's `POST /user/:userId/community` (§4.5.1) and the automatic approval's calls (§6.4.2).
- **On a failure:** the script's usual Slack error alert for that user or listing, and **the rest of the event still
  runs**. Stopping would skip, for example, the Auth0 sync at the end of `notifyUserUpdated`'s `profileSync`.
- **The automatic approval:** if the webapp can't be asked whether the person is a creator, they're handled as an
  unknown creator: APPLIED and the Slack message (§3), and the team approves them as usual. A failure after that
  sends the alert.
- **No retry** (J2): the alert, then a fix by hand.

#### 9.4.4 The admin's member list follows the brand (J8)

Whenever a member joins (the shared join of §4.5.1, also used by Luupe's tool in §7), the admin's `brandUsers` is
rebuilt from the brand's members on the Marketplace: the users with that `priv_brandStudioId`, the admin excepted
(`getBrandMemberIds`, as a new admin's list is built today). It no longer adds one id to the list it read. Two joins in
the same second can still leave one member out, but only until the next join rebuilds the list; today that member is
lost for good.

#### 9.4.5 The Cloud Run settings (J5, J6)

Applied by Rafael on 2026-10-15, sized from PROD's own CPU and memory use: **exactly one instance**, with **CPU always
allocated** (instance-based billing). The job never runs twice and always has CPU between requests, so no case in this
spec depends on the configuration. Slack's approvals rely on it too: their work runs after the answer (§3.6.2), and
the double-click guard is in memory (§3.6.1). **QA needs the same settings.** The only overlap left is a deploy, when the old copy may run for a moment next to
the new one; accepted.

## 10. Security fixes

Decided with Rafael, 2026-10-14/15. Each problem was checked in the code; four are fixed, the rest are kept as they
are.

### 10.1 What was checked, and the decisions

| # | Problem | Decision |
|---|---|---|
| S1 | **Slack approvals can be forged:** `server/api/slack/index.js` passes a missing timestamp, never computes the signature, and sends a 400 on a bad token without stopping the request | **Fix** (§10.2.1) |
| S2 | **Open redirect after login:** `loginWithIdp.js:121,123,160` builds `${rootUrl}${from}#` from the login link's values, which the Auth0 Action copies unchecked. With `from=.evil.com` the person lands on `https://<our site>.evil.com` | **Fix** (§10.2.2) |
| S3 | **The browser controls the sign-up data:** `createUserWithIdp.js:42-48` passes the request body (`...rest`) to `createWithIdp`, and the `st-authinfo` cookie the confirm page reads isn't signed. So §4.5.3's and §6's rules can be bypassed, for example a webapp creator signing up as a buyer | **Fix** (§10.2.3) |
| S4 | **The invitation link is the bare brand id:** anyone holding it can join that brand, and it never expires | **No change:** the link is the invitation |
| S5 | **People can write their own `userType` and `brandStudioId`** (`publicData`, `privateData`); a change to or from brand only sends a Slack warning (`userUpdateValidations.js:214-216`) | **No change:** the warning stays |
| S6 | **The webapp's Circle webhook has no authentication** (`webapp/server/routers/v1/circle.ts:23`) | **No change** |
| S7 | **The webapp's clean-up routes have no authentication outside PROD** (`webapp/server/routers/v1/index.ts:15`) | **No change** |
| S8 | **The webapp API key is written to the logs:** `studioHelper.js`'s error handler logs `error.config` (`:43`) and `error.request` (`:38`), which carry the `x-api-key` header | **Fix** (§10.2.4) |
| S9 | **A secret is hard-coded in the legacy Auth0 account-link rule** (`webapp/etc/auth0/rules/auth0-account-link-extension.js`) | **No change** |
| S10 | **Every Marketplace secret is printed in the Cloud Build log:** the `debug-secrets` step (`cloudbuild.yaml:12-20`) prints `.env.production` | **Fix** (§10.2.5) |
| S11 | **Secrets are baked into the Marketplace image:** the Dockerfile's `COPY . .` copies the `.env.production` the build wrote | **No change** |

### 10.2 Changes

#### 10.2.1 Slack's real signature (S1)

From §3.5 decision 10: check Slack's signature, an HMAC-SHA256 of `v0:<timestamp>:<raw body>` with the signing
secret, compared in constant time; require a fresh timestamp; stop on any failure. A forged POST then changes
nothing.

The secret is `SLACK_SIGNING_SECRET` (the Slack app's Basic Information → Signing Secret). It must be in the
Marketplace's secrets on each environment before this ships, or every approval is refused. The old verification token
(`SLACK_BOT_VERIFICATION_TOKEN`) is no longer read.

#### 10.2.2 Redirects after login stay on the site (S2)

The three redirects in `loginWithIdp.js` use `from`, `defaultReturn` and `defaultConfirm` only when the value is a
path starting with a single `/` (not `//` or `/\`). Anything else is replaced: `from` is dropped, `defaultReturn`
becomes `/`, and `defaultConfirm` becomes the confirm page.

#### 10.2.3 The server decides the sign-up's type and brand (S3)

In `createUserWithIdp.js`, before `createWithIdp`:

- **The email comes from the Auth0 session** (`req.oidc`, set at login and kept encrypted on the server), not from
  the cookie or the body. Without a session, the sign-up fails as an expired one (§2.6.3).
- **The server asks the webapp's lookup** with that email and applies §4.5.3's rules itself. The webapp's answer wins
  over anything the browser sent: a webapp creator is a creator (§6.4), a brand user joins their own brand, a
  webapp user in no brand is a buyer (§6.4.3), and a login that isn't theirs gets the §8 page (§6.4.1).
- **The person's own choice counts only where §4.5.3 leaves it to them:** someone the webapp doesn't know, or a failed
  lookup, signs up as the link says (buyer, creator, a new brand, or the brand of an invitation link, S4).
- **From the body, the server keeps only what the confirm form collects** (names and the form's fields).
  `userType` and `brandStudioId` are set by the server.

The confirm page's choices (§2.6.1, §4.5.3) stay as they are; the server only stops trusting them.

Built (step 3.3): the rules are shared by login and sign-up (`server/api/auth/webappSignup.js`). A refused sign-up
answers `{ name: 'SignupRefused', message: <code> }` (`401 session-expired`, `403 second-login` or `invitation`), and
the confirm page shows that code's page. A type that isn't one of the three becomes buyer; a brand id is kept only on
a brand sign-up; a webapp brand's admin gets the brand's webapp name whatever the form sent.

#### 10.2.4 No API key in the logs (S8)

The webapp client's error handler (`studioHelper.js`) logs only the method, the path, the status and the webapp's
answer, or the error's message when there's no answer. Never `error.config`, `error.request` or headers. The
referral client already logs only the message.

The webapp's management key (`STUDIO_MANAGER_API_KEY`, shared by the webapp and the Marketplace) was to be changed
once this was live, since the old one is in past logs. Not changed: Rafael's call (2026-10-16).

#### 10.2.5 No secrets in the build log (S10)

The `debug-secrets` step is removed from `cloudbuild.yaml`; the `build` step then waits for `store-market-secrets`.

## 11. The plan

Approved by Rafael, 2026-10-15. Four phases, each split into small steps. **One step at a time:** each step is built,
passes the gates and is reported, and the next starts only with Rafael's go. Phase 2 (the webapp) runs in its own
session, in parallel. **At each ⏸️, the Marketplace's work stops** until Rafael has deployed the webapp's part it
needs.

### 11.1 Which repo

| Repo | Changes |
|---|---|
| **Marketplace** | §2.6, §3.6, §4.5, §6.4, §7.4, the second-login page (§8.3), §9.4.1–9.4.4, §10.2 |
| **Webapp** | §4.7 and §6.5, through its own spec (§11.3) |
| **Popup Studio, Studio** | Nothing (§4.6) |

### 11.2 Phase 1: the Marketplace on its own

Needs nothing from the webapp.

| Step | What | Sections |
|---|---|---|
| 1.1 | Slack's real signature | §10.2.1 |
| 1.2 | Redirects after login stay on the site | §10.2.2 |
| 1.3 | No API key in the logs; no secrets in the build log | §10.2.4, §10.2.5 |
| 1.4 | Poll every 2 minutes; never skip events at start | §9.4.1, §9.4.2 |
| 1.5 | Webapp failures in the job send the usual alert (the job's current calls) | §9.4.3 |
| 1.6 | The admin's member list follows the brand; deleted members | §9.4.4, §4.5.7 |
| 1.7 | Approve once; reply to Slack first | §3.6.1, §3.6.2 |
| 1.8 | A failed community approval changes nothing; empty lists | §3.6.3, §3.6.4 |
| 1.9 | The job writes Auth0 for buyers; the email is read-only | §2.6.5, §2.6.4 |
| 1.10 | The buyer ⇄ creator switch on `/confirm` | §2.6.1 |
| 1.11 | The "Log in" link; `/confirm` without its cookie | §2.6.2, §2.6.3 |
| 1.12 | The second-login page | §8.3 (BR22) |
| 1.13 | Phase 1's Manual Testing Plan, then QA | §12 |

In phase 1 the brand join is still in the job, so step 1.6 rebuilds the member list there; step 3.4 moves it into the
shared join.

### 11.3 Phase 2: the webapp

Its own spec, [`webapp/spec/marketplace-login-and-registration.md`](../../../webapp/spec/marketplace-login-and-registration.md),
built in its own session. Its §2 holds the exact requests and answers phase 3 is written against; they change only
with Rafael's approval, in both specs.

- **2a, before phase 3** (additive), its steps 2a.1–2a.7: the lookup returns the brand's name, `isBrandAdmin` and
  whether the login matches; `GET /brand/:brandId`; `POST /brand`'s refusal; `POST /user/:userId/community`;
  `addCreator`'s fix; emails matched regardless of upper or lower case.
- **2b, after phase 3** on the same environment, its steps 2b.1–2b.3: the joins without Circle; the assign tool
  called with a POST; the tool enabled again for brands with no admin.

### 11.4 Phase 3: brands and known people

Steps 3.1–3.9 are written against the webapp spec's §2, with the webapp mocked: they need that spec approved, not the
webapp built. Trying them on QA needs it deployed, hence the two pauses.

| Step | What | Sections |
|---|---|---|
| 3.1 | The webapp client's new calls, as the webapp spec's §2 gives them: the lookup's new fields, `GET /brand/:brandId`, the community route, `POST /brand`'s refusal | §4.7, §6.5 |
| 3.2 | The lookup's rules and the login check, at login | §4.5.3, §6.4.1 |
| 3.3 | The server decides the sign-up's type and brand | §10.2.3 |
| 3.4 | Join during sign-up, with Try again; the job stops joining brand users | §4.5.1 |
| 3.5 | The job's Circle step | §4.5.1, §9.4.3 |
| 3.6 | The brand pages; the error page; the notice for existing accounts | §4.5.2, §4.5.6, §4.5.5 |
| 3.7 | "Complete your brand profile" | §4.5.4 |
| 3.8 | Webapp creators approved automatically; the banners | §6.4.2, §6.4.3 |
| 3.9 | The assign tool | §7.4 |
| ⏸️ | **Pause:** the webapp's 2a live on QA (its step 2a.7). Phase 3 can't go to QA before it | §11.6 |
| 3.10 | Phase 3's Manual Testing Plan; phase 3 to QA, and QA of everything but the assign tool | §12 |
| ⏸️ | **Pause:** the webapp's 2b live on QA (its steps 2b.1–2b.3), which needs phase 3 there first | §11.6 |
| 3.11 | QA of the assign tool | §12 |

### 11.5 Phase 4, last: duplicate profile listings on PROD

From §3.5 decision 1, once step 1.7 is live on PROD:

| Step | What |
|---|---|
| 4.1 | List every creator with more than one profile listing, marking the one their `metadata.profileListingId` points to. Rafael approves which to keep and which to remove |
| 4.2 | Remove them (closed, or deleted if Sharetribe's API allows) |

Each PROD read and write needs Rafael's go.

### 11.6 Rollout

- **Each phase:** QA first, then PROD once QA passes. Nothing touches PROD without Rafael's go.
- **Order on each environment:** phase 1 at any time; then 2a, phase 3, 2b. On QA this is where §11.4's two pauses
  come from; PROD follows the same order.
  - Between phase 3 and 2b, a brand join runs Circle twice (the webapp's join and the job's step). That's harmless:
    the community route does nothing for a user who already has one.
  - The assign tool doesn't work between phase 3 (a POST) and 2b (the webapp still calls a GET): a few minutes.
- **After phase 1 is on PROD:** change `STUDIO_MANAGER_API_KEY` in the webapp and the Marketplace (S8). Not done:
  Rafael's call (2026-10-16), as for removing the old `SLACK_BOT_VERIFICATION_TOKEN`.
- **When phase 3 is on PROD:** [`webapp-user-first-sign-up.md`](./webapp-user-first-sign-up.md)'s "To change" note is
  resolved, and this spec moves to Implemented in `spec/v0/README.md` and `TL_README.md`. Done 2026-10-16.

### 11.7 Tests

- **Marketplace:** `yarn test-server` with Sharetribe, Auth0 and the webapp client mocked; `yarn test` for the sign-up
  pages; `yarn format-ci`. Gates only.
- **Webapp:** its spec's §7.
- **Each phase adds its Manual Testing Plan** to §12, and Rafael runs it on QA.

### 11.8 Out of scope

- Account linking (§8.3, handled separately).
- Referral Factory (J9).
- Auth0 email verification (§8.4).
- Studio, Popup Studio's screens, payments.
- Removing members, or transferring a brand's admin.
- Deletes and email changes reaching the other systems.
- The security items kept as they are (S4–S7, S9, S11).
- The storage-manager's memory leak (its own spec, `storage-manager/spec/v2/storage-manager-v2.md` §6).
- The Cloud Run settings (applied by Rafael, §9.4.5).

## 12. Manual Testing Plan

_Added phase by phase: step 1.13 (§12.1) and step 3.10 (§12.2). The webapp's 2b was already on QA when phase 3 was
built, so phase 3 goes to QA in one deploy with phase 1, and step 3.11's assign tool is §12.2.9._

### 12.0 To review (collected while building)

Folded into each phase's plan when it's written, marked with their number: R1–R6 in §12.1, R7–R10 in §12.2.

_None open._

### 12.1 Phase 1

**Before the QA deploy**

- `SLACK_SIGNING_SECRET` in QA's Marketplace secrets (`MARKET_CONFIG`): the QA Slack app's Basic Information →
  Signing Secret. Without it every Slack button is refused (§10.2.1).
- QA's Marketplace on Cloud Run as PROD: CPU always allocated, exactly one instance (§9.4.5). Without it a Slack
  approval can stall after the click.
- QA's webapp mocks Circle (no `CIRCLE_FORCE_PROD`). Otherwise community approvals call real Circle.
- A new Marketplace build: the secrets are written into it at build time.

**What you need:** QA's Marketplace (`https://market.qa.theluupe.com`), QA's Slack application channel, Sharetribe
Console and Auth0's dashboard for QA, a few new email addresses (`you+mtp1@…`), and one Google account.

#### 12.1.1 Sign-up pages

| # | Action | Expected |
|---|---|---|
| 1 | Logged out, open `/signup` | The two tiles, and under them *"Already have an account? **Log in**"* (**R3**: review the copy) |
| 2 | Click **Log in** | Auth0's login screen, not its sign-up screen |
| 3 | Open a QA brand's invitation, `/signup/studio-brand/<brandId>` | The same line under the sign-up button |
| 4 | There, click **Log in**, then Auth0's "Sign up" with a new email | Back on the **brand's** sign-up form, not the buyer's (**R4**) |

#### 12.1.2 The confirm page

| # | Action | Expected |
|---|---|---|
| 5 | Sign up as a buyer with a new email | The buyer form. The email is greyed out and can't be edited |
| 6 | Under it, *"Are you a creative? **Apply as a creator instead**"* (**R1**: review the copy). Click it | Same page, now the creator's: its intro, the Location field and the creator fields; names and email filled in again |
| 7 | Click *"Just here to buy? **Sign up as a buyer instead**"* (**R1**) | Back to the buyer form, with no creator parts |
| 8 | Switch to creator again, fill it in, **Sign up** | Profile settings shows "APPLICATION RECEIVED" |
| 9 | Row 4's brand form | No switch |
| 10 | Logged out of the Marketplace, open `/confirm` in a new tab | *"Your sign-up session expired"* and **Continue** (**R5**: review the copy) |
| 11 | Click **Continue**, then sign up on Auth0 with a new email | The sign-up form, as a buyer, with the switch |

#### 12.1.3 A second login method (BR22)

| # | Action | Expected |
|---|---|---|
| 12 | Sign up with a **password**, using your Google account's address. Log out | — |
| 13 | **Log in** → "Continue with Google", same address. If Auth0 offers to link the accounts (the Rule runs until 2026-11-18), skip it | *"Something went wrong."*, the support line and **Log out**; no form (**R6**: review the copy) |
| 14 | Click **Log out** | The home page. **Log in** asks for a login again instead of reusing Google |
| 15 | Log in with the password | Row 12's account |

#### 12.1.4 Buyers in Auth0

| # | Action | Expected |
|---|---|---|
| 16 | About 2 minutes after row 5, open that user in Auth0's dashboard | `app_metadata` has `marketId` and `userType: buyer`; name and nickname are set |

#### 12.1.5 Slack approvals

| # | Action | Expected |
|---|---|---|
| 17 | About 2 minutes after row 8 | The application message in QA's Slack channel |
| 18 | Click **Approve** for the seller decision | Within seconds the buttons become "User has been approved to be a Seller"; Slack shows no "didn't respond" |
| 19 | Console → that user's listings | **One** published profile listing |
| 20 | On another new creator's message, double-click **Approve** quickly | Still one profile listing |
| 21 | Click **Approve** for the community decision | "…has been approved"; in Console the user has `studioId`, `communityId` and `communityStatus: APPROVED` |
| 22 | Approve an **old** pending candidate, posted before the deploy (**R2**) | As row 18, once |
| 23 | Optional: `curl -X POST https://market.qa.theluupe.com/api/slack/interactivity -d 'payload={}'` | `400 Verification failed`; nothing changes |

#### 12.1.6 Brand member lists

| # | Action | Expected |
|---|---|---|
| 24 | Sign up a new member through a QA brand's invitation | The admin's Brand users page lists them at once (with phase 3 the join runs during sign-up; phase 1 alone took about 2 minutes) |
| 25 | Optional: delete a member's account in Console, then the admin edits "About us" in Profile settings | No Slack error alert; the other members get the new text; Brand users no longer lists the deleted member |

#### 12.1.7 Redirects and the build

| # | Action | Expected |
|---|---|---|
| 26 | Logged out, open `https://market.qa.theluupe.com/api/auth/auth0/login?screenHint=login&from=.evil.com` and log in | You land on `market.qa.theluupe.com`, never another host |
| 27 | Open the QA build in Cloud Build | No `debug-secrets` step; no step prints `.env.production` |

#### 12.1.8 Not changed (spot-check)

- Logging in with an existing buyer, creator or brand account, and logging out.
- "Apply as a creator" in a buyer's Profile settings: the Slack message still arrives.
- A new brand through the new-brand link: set up during the sign-up with phase 3 (§12.2.2).

**Covered only by the automated tests** (not reachable by hand on QA): a webapp failure in the job sending its alert
(§9.4.3), a failed community approval changing nothing (§3.6.3), waiting for the saved place at start (§9.4.2), and
no API key in the logs (§10.2.4).

### 12.2 Phase 3

**Before the QA deploy:** §12.1's list (both phases go in one deploy). The webapp's 2a and 2b are on QA.

**What you need:** §12.1's tools, QA's webapp admin, and these people and brands in QA's webapp, created with Popup
Studio on QA. None of the people has a Marketplace account yet; each logs in with the email and password Popup Studio
gave them.

| Brand | People in the webapp |
|---|---|
| **Acme** | its admin **acme-admin**, and a member **acme-member** |
| **Globex** | its admin **globex-admin**, who never signs up on the Marketplace |
| **Initech** | nobody |
| **Umbrella** | nobody |

Also: §12.1's creator approved in row 21 (now a creator in the webapp too), §12.1's buyer of row 5, and a few new
email addresses. **Use a new private window for each person:** the Auth0 login otherwise carries over to the next
sign-up, and the invitation error page (rows 8, 12) has no **Log out**.

#### 12.2.1 The brand pages (§4.5.2)

| # | Action | Expected |
|---|---|---|
| 1 | Logged out, open `/signup/studio-brand` | *"Set up your brand on The Luupe"* (**R9**: review the copy), the sign-up button and the **Log in** line |
| 2 | Open Acme's invitation, `/signup/studio-brand/<Acme's id>` | A spinner, then *"You've been invited to join **Acme** on The Luupe"* (**R9**) |
| 3 | Change one character of the id | *"This invitation link isn't valid. Ask your brand's admin for a new one."*, with no sign-up button and no **Log in** |

#### 12.2.2 A new brand (BR1, §4.5.1)

| # | Action | Expected |
|---|---|---|
| 4 | From `/signup/studio-brand`, sign up with a new email and fill in the brand form | The **Sign up** button spins for a few seconds, then you're logged in (with a password login, the verify-email page first) |
| 5 | Account settings | **Brand management** is there at once, with no members |
| 6 | Console → that user | `isBrandAdmin: true`, `studioId`, `brandStudioId`, `brandUsers: []` |
| 7 | About 2 to 4 minutes later, Console and Auth0 | `communityId` in Console (the job's community step); Auth0's `app_metadata` has `studioId`, then `communityId` with the next update |

#### 12.2.3 People the webapp already has in a brand (§4.5.3)

| # | Action | Expected |
|---|---|---|
| 8 | Logged out, open `/signup/studio-brand` (the new-brand link) and log in as **acme-member** | *"We couldn't use this invitation with your account. Please get in touch with your contact at The Luupe."*, with no form (BR4). Console: no account |
| 9 | In the same window, open Acme's invitation and click the sign-up button (Auth0 remembers acme-member) | The member form, no brand fields. After **Sign up**: a member of Acme at once, the brand name "Acme" (BR11) |
| 10 | New window: open `/signup`, pick the buyer tile and log in as **acme-admin** | The **brand** form, "Acme" filled in and locked; fill in website, About us and industry (BR3) |
| 11 | **Sign up**, then Brand management | acme-admin is Acme's admin; Brand users lists acme-member (BR12) |
| 12 | New window: open Acme's invitation and log in as **globex-admin** | Row 8's page (BR9, another brand's invitation). Console: no account |

#### 12.2.4 An empty brand's first person (BR7, §4.5.4)

| # | Action | Expected |
|---|---|---|
| 13 | Open Initech's invitation, sign up with a new email | The member form, no brand fields |
| 14 | **Sign up** | Profile settings, with *"Complete your brand profile"* / *"Add your brand's website, industry and a few words about it."* (**R10**: review the copy) and "Initech" in the brand name. With a password login, the verify-email page comes first: its **Later** leads there |
| 15 | Account settings | **Brand management** is there: they're Initech's admin |
| 16 | Fill in the website, **Save** | The banner is gone |

#### 12.2.5 Try again (§4.5.1)

Optional: it needs the Marketplace unable to reach the webapp for a few minutes, for example QA's webapp scaled to
zero in Cloud Run.

| # | Action | Expected |
|---|---|---|
| 17 | With the webapp down, sign up through Umbrella's invitation with a new email | *"We couldn't finish creating your account."* / *"Please try again."* and **Try again** (**R7**: review the copy); you aren't logged in |
| 18 | Leave, then **Log in** with that email | The same screen, not the Marketplace |
| 19 | Bring the webapp back, click **Try again** | Logged in, on the home page. They're Umbrella's admin (the empty seat): Brand management, and row 14's banner on Profile settings |

If you skip this, row 31 uses Umbrella instead.

#### 12.2.6 A creator the webapp already knows (§6.4.2)

| # | Action | Expected |
|---|---|---|
| 20 | In Console, delete the account of §12.1 row 21's creator (the webapp keeps their user) | — |
| 21 | Logged out, open `/signup`, pick the buyer tile, log in with that creator's login | The **creator** form, *"This account is set up as a creator account."*, and no *"Sign up as a buyer instead"* |
| 22 | Fill it in, **Sign up**; about 2 minutes later reload Profile settings | No "APPLICATION RECEIVED"; **no** message in QA's Slack channel |
| 23 | Console → that user | `sellerStatus` and `communityStatus` APPROVED, `studioId` the same webapp user as before, one published profile listing |

#### 12.2.7 Existing accounts on a brand link (§4.5.5)

| # | Action | Expected |
|---|---|---|
| 24 | Logged out, open Acme's invitation, **Log in** as §12.1 row 5's buyer | Logged in as usual, with a pop-up: *"You're registered as a buyer. To join a brand, please get in touch with your contact at The Luupe."* |
| 25 | Close it, reload | It doesn't come back |
| 26 | Same with row 22's creator | *"…registered as a creator…"* |

#### 12.2.8 A login that isn't theirs (§6.4.1)

Optional: it needs a webapp user, created with Popup Studio, whose email is your Google account's.

| # | Action | Expected |
|---|---|---|
| 27 | Log in with "Continue with Google" with that address. If Auth0 offers to link the accounts, skip it | §12.1 row 13's page and **Log out**, not a form |

#### 12.2.9 Luupe's "assign an existing buyer to a brand" (§7.4)

In QA's webapp admin, on a brand's details. Each buyer is a new buyer account (its Marketplace id from Console).

| # | Action | Expected |
|---|---|---|
| 28 | Assign a buyer to **Globex** (its admin isn't on the Marketplace) | Success. Console: the buyer is `studio-brand` with Globex's id, `studioId`, brand name "Globex"; they're a member |
| 29 | Assign the same buyer again | *"User '…' already belongs to the brand '…'"* |
| 30 | Assign row 22's creator | *"…is a seller and cannot be assigned to a brand…"* |
| 31 | Assign another buyer to **Umbrella** (nobody in it; skip if row 19 filled it) | Success, and they're Umbrella's admin (Brand management, row 14's banner) |

#### 12.2.10 Not changed (spot-check)

- Logging in with an existing buyer, creator or brand account through `/login`: no pop-up.
- A new creator the webapp doesn't know: APPLIED and the Slack message, as §12.1 rows 8 and 17.
- An admin's brand edits reaching the members (§12.1 row 25).

**Covered only by the automated tests:** `/confirm` refusing an invitation of an unknown brand (it needs the page
skipped), a webapp user in no brand getting the buyer banner (§6.4.3; no such user on QA), the community step
failing for a known creator (the Slack message instead), the assign tool's "Couldn't assign…" and "Brand does not
exist" (the webapp's form only offers existing brands), and the joins being safe to repeat.

**Before phase 3 reaches PROD (R8):** count PROD's brand users without a `studioId` (a PROD read, with Rafael's go).
From phase 3, their next login runs the join, and they get only the Try again screen until it works. The old job left
some behind (BR17). Not counted: Rafael's call (2026-10-16), since each one's next login finishes their join.
