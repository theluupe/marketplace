# Remove Referral Factory

> **Status:** ✅ Implemented (2026-10-19). Agreed with Rafael the same day: an inventory of every repo, a plan and a
> grill (§2). Gates only, no Manual Testing Plan, by Rafael's call (§8). Ships with the next Marketplace release; the
> env vars come off Cloud Run only after it's on PROD (§7).
>
> **What it does:** removes the Referral Factory integration. The "Refer & Earn" page and its three menu links, the
> opt-in endpoint, the API client and the sign-up job's referral step are deleted, not switched off. An in-house
> referral campaign may come later. It's a new design, started as a placeholder in Studio
> ([`studio/spec/v2/custom-referral-campaign.md`](../../../studio/spec/v2/custom-referral-campaign.md)), and reuses
> nothing here.
>
> **The rest of the removal:** the webapp's two leftovers have their own spec
> ([`webapp/spec/remove-referral-leftovers.md`](../../../webapp/spec/remove-referral-leftovers.md)); the landing's one
> leftover, an unused env var, goes without a spec; Studio's v2 specs drop their `referralCode` rows.

---

## 1. What Referral Factory does today

Everything below talks to Referral Factory's v2 API (`https://referral-factory.com/api/v2`) through one client.

| Surface | Where |
|---|---|
| **The sign-up job.** For every new user (buyer, brand user, creator) it looks the email up in the campaign. Someone not in it is added. Someone already in it (for example, a person referred through Referral Factory's own form) has their referral marked qualified, with the Segment event `REFERRAL_PROGRAM \| Referral qualified`. Then it writes the code to `privateData.referralCode`. A failure sends the "user created" Slack alert and the job carries on | `server/scripts/events/notifyUserCreated.js` (`referralProgramOptIn`, called first in `analyzeEvent`) |
| **The "Refer & Earn" page**, `/referral-program`, for signed-in users. It reads the user's code, asks the opt-in endpoint for one when there's none, and shows Referral Factory's widget (`embed.referral-factory.com/<code>/referrals`) in an iframe | `src/containers/ReferralProgramPage/` (page, duck, CSS); registered in `routeConfiguration.js`, `reducers.js` and `pageDataLoadingAPI.js` |
| **Three "Refer & Earn" links**: the desktop profile menu, the mobile menu and the account tabs | `TopbarDesktop.js`, `TopbarMobileMenu.js`, `UserNav.js`; 4 keys in `en.json` (none in `de`, `es`, `fr`) |
| **The opt-in endpoint**, `POST /api/referral-program/opt-in`. Answers the saved code, or adds the user to the campaign, saves the code and sends `REFERRAL_PROGRAM \| Auto opt-in` | `server/api/referral-manager.js`, `server/apiRouter.js`, `src/util/api.js` (`referralProgramOptIn`) |
| **The API client.** Reads `REFARRAL_API_TOKEN` and `REFARRAL_CAMPAIGN_ID` (misspelled, as deployed). No timeout | `server/api-util/referralManager.js` |
| **The CSP** allows the iframe: `*.referral-factory.com` in `frame-src` | `server/csp.js` |

**The docs are already wrong.** `CLAUDE.md` and `TL_README.md` give the endpoint as `POST /api/referral-manager` and
the env vars as `REFERRAL_FACTORY_API_KEY` and `REFERRAL_CAMPAIGN_ID`, and say qualification happens when a purchase
completes. None of that exists: qualification happens at sign-up. Both sections are deleted (§6).

---

## 2. Decisions

| # | Decision |
|---|---|
| 1 | **Remove, don't switch off.** Unlike [hide-portfolio.md](./hide-portfolio.md), there's nothing to switch back on: the page is Referral Factory's widget and the account will be cancelled. The same choice as [disable-coupons.md](./disable-coupons.md) |
| 2 | **`/referral-program` shows Not Found.** The route is deleted and the catch-all in `src/routing/Routes.js` renders `NotFoundPage`. No redirect |
| 3 | **Existing data stays.** Users who signed up before keep `privateData.referralCode` in Sharetribe. Nothing reads or writes it after this spec, and no clean-up script runs. Studio's placeholder records that the name holds old Referral Factory codes and must not be reused |
| 4 | **The sign-up job's referral step goes, and nothing replaces it.** Auth0 no longer depends on it: since [login-and-registration.md](./login-and-registration.md) §2.6.5 the job writes Auth0 itself. The code's write fired a `user/updated` event whose only effect was a second Auth0 sync with the same data (checked: none of `notifyUserUpdated`'s other steps sees a change) |
| 5 | **The two Segment events stop**: `REFERRAL_PROGRAM \| Auto opt-in` and `REFERRAL_PROGRAM \| Referral qualified` |
| 6 | **Gates only** (grill, 2026-10-19): no Manual Testing Plan (§8) |
| 7 | **This spec:** `spec/v0/remove-referral-factory.md`, tracked in `TL_README.md` |

---

## 3. Changes

### 3.1 Server

- **Delete** `server/api-util/referralManager.js` and `server/api/referral-manager.js`.
- **`server/apiRouter.js`:** the `require` of `./api/referral-manager` and the `/referral-program/opt-in` route.
- **`server/csp.js`:** `'*.referral-factory.com'` in `frameSrc`.

### 3.2 The sign-up job

`server/scripts/events/notifyUserCreated.js`:

- The `require` of `referralManager`, the `referralProgramOptIn` function, and its call at the top of `analyzeEvent`'s
  `try`.
- **The comment above the buyers' and brand users' Auth0 write** says it's written there because the referral code's
  `user/updated` event "never comes when the referral call fails". It's the reason the write is there, so it stays,
  in the past tense: Auth0 used to come from that event, and since this spec there's no such write at all (CLAUDE.md:
  never delete a comment just because the code it names is gone).

What the job does afterwards, per type:

| Type | Before | After |
|---|---|---|
| Buyer | Segment, the referral code, Auth0 | Segment, Auth0. No Sharetribe write |
| Brand user | Segment, the referral code, Auth0 | Segment, Auth0. No Sharetribe write (the join and Circle are elsewhere, unchanged) |
| Creator | The referral code, then APPLIED or the automatic approval, Auth0, Slack | The same without the referral code |

The referral step had its own `try`/`catch`, which sent the "user created" Slack alert. That source of alerts goes;
the job's other failures still send it.

### 3.3 Frontend

- **Delete** `src/containers/ReferralProgramPage/` (`ReferralProgramPage.js`, `.duck.js`, `.module.css`).
- **`src/routing/routeConfiguration.js`:** the `loadable` import and the `/referral-program` route.
- **`src/containers/reducers.js`** and **`src/containers/pageDataLoadingAPI.js`:** the import and the entry.
- **`src/util/api.js`:** `referralProgramOptIn`.
- **The three links:** the `ReferralProgramPage` `MenuItem` in `TopbarDesktop.js`, its `<li>` in
  `TopbarMobileMenu.js`, and its tab in `UserNav.js`. Each menu keeps its order without it: Favorites, then Profile
  settings.
- **`src/translations/en.json`:** `ReferralProgramPage.title`, `TopbarDesktop.referralProgram`,
  `TopbarMobileMenu.referralProgram`, `UserNav.referralProgram`.

### 3.4 Comments elsewhere

- `server/api/scripts-retry/retryBrandUserAssignment.js`: "no second referral step or Segment identify" becomes "no
  second Segment identify".

---

## 4. What doesn't change

- **`axios`:** five other server files use it.
- **`trackManagementAPIEvent`, `identifyUserEvent`** and every other Segment event.
- **`slackUserCreatedErrorWorkflow`:** still the job's alert for its other failures.
- **`privateData.referralCode` on existing users** (decision 3).
- **`TL_CHANGELOG.md`'s original Referral Factory entry:** history. The removal gets its own entry (§6).
- **[disable-coupons.md](./disable-coupons.md) and [../v1/studio-brand-onboarding-changes.md](../v1/studio-brand-onboarding-changes.md)**
  say they didn't modify the referral program. Still true.
- **Content hosted in the Sharetribe Console.** An override of the four keys there becomes unused text (§7).

---

## 5. Tests

`server/scripts/events/notifyUserCreated.test.js`:

- The `referralManager` mock and every `qualifyReferral` setup go.
- **"writes … to Auth0":** the table loses its referral column and its "the referral call fails" row. It runs once for
  a buyer and once for a brand user, with the same Auth0 call.
- **"never joins a brand user's brand":** `sdk.users.updateProfile` is no longer called at all (today: once, with the
  code).
- The creator tests are unchanged apart from the mock setup.

Nothing new is tested: the rest is deletion. **Gates:** the Marketplace's Jest suites, lint and build.

---

## 6. Docs, when it ships

- **`CLAUDE.md`:** the "Referral program" section goes. It's Marketplace-only, so there's nothing to carry to the
  other projects' `CLAUDE.md` files.
- **`TL_README.md`:** the "Referral Program (Referral Factory)" section goes, env-var block included. This spec's row
  moves from Pending to Implemented.
- **`spec/v0/README.md`:** row 6 turns ✅.
- **`TL_CHANGELOG.md`:** an entry at the top.
- **[login-and-registration.md](./login-and-registration.md)** (✅ Implemented) gets a dated **"Amended"** note in its
  status block, saying Referral Factory was removed by this spec. Its mentions of the referral code and step (§1.1,
  §1.2, §2.2, §2.4, §2.5 decision 8, §4.5.1, §7.3, §7.4 decision 2, §9.3, §10.2.4, §11.8) describe the job before the
  removal and stay as they are. **J9** (§9.2, the client has no timeout) gets "resolved: the client was removed".

---

## 7. Rollout

The order matters:

1. **Ships with the next Marketplace release:** QA, then PROD.
2. **Only after PROD runs it**, Rafael removes `REFARRAL_API_TOKEN` and `REFARRAL_CAMPAIGN_ID` from the Marketplace's
   Cloud Run, on QA and PROD. Removed before the deploy, every sign-up's referral call fails and sends the "user
   created" Slack alert.
3. Rafael cancels the Referral Factory account, exporting its data first if he wants the history.
4. Rafael checks Segment for a Referral Factory destination, any dashboard built on the two `REFERRAL_PROGRAM` events,
   and the Console's hosted translations for overrides of the four keys.

---

## 8. Manual Testing Plan

**None, by Rafael's decision (grill, 2026-10-19)**: gates only. The job's change is covered by
`notifyUserCreated.test.js` (§5); the rest is deletion.
