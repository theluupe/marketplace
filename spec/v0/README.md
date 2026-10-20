# Marketplace specs — v0

The `v0/` specs are **pre-Studio**: changes to today's Marketplace, whose platform is still the webapp behind the
Studio Manager client (`server/api-util/studioHelper.js`, `WEBAPI_URL`), and anything else added in the meantime.
Studio-related specs and future features live in [`../v1/`](../v1/README.md); the plans for merging the upstream
Sharetribe template live in [`../upstream-merge/`](../upstream-merge/README.md).

> Implementation status lives in [TL_README.md](../../TL_README.md#specs). This file describes the **order and
> dependencies** of the v0 set.

> **Status legend.** Keep the `Status` column in sync with [TL_README.md](../../TL_README.md#specs).
>
> - ✅ **Implemented**: shipped in the codebase.
> - 🟡 **Pending**: not built yet, but every dependency is implemented (ready to start).
> - 🔴 **Blocked**: not built yet, and at least one dependency is still Pending or Blocked.

## Specs

| # | Spec | Depends on | Status | Notes |
|---|---|---|---|---|
| 1 | [disable-coupons.md](./disable-coupons.md) | — | ✅ Implemented (2026-05-07) | The Voucherify-backed discount coupons removed, ahead of an in-house implementation. Past orders still show their discounts. Moved here from `spec/` on 2026-10-12 |
| 2 | [brands-without-admin.md](./brands-without-admin.md) | [webapp/spec/brands-without-admin.md](../../../webapp/spec/brands-without-admin.md) (🟡 Pending) | ✅ Implemented (2026-10-12) | Part A of Popup Studio's brand sync (initiatives repo, `catalog/popup-studio/brand-sync-plan-v2.md` §5.2). A joiner the webapp makes the admin of a brand with no admin gets the admin flag and the brand's name; an admin's first brand-field edits reach the members. Waiting on the webapp's deploy: until then a joiner is a plain member, as before, so either can go first. QA first |
| 3 | [webapp-user-first-sign-up.md](./webapp-user-first-sign-up.md) | [brands-without-admin.md](./brands-without-admin.md) (✅); the webapp's `POST /user/lookup` and join fix ([user-sync.md](../../../initiatives/catalog/popup-studio/spec/user-sync.md) §5.2, §5.3, built in parallel) | ✅ Implemented (2026-10-13) | Popup Studio's user sync. A person with no Marketplace account whom the webapp knows confirms the sign-up the webapp gives: the brand-member sign-up of their brand, or the creator sign-up. A member who signs up before their brand's Marketplace admin gets the webapp's brand name; the admin then starts its list with those members. Waiting on the webapp's deploy: until then, sign-up is as before, so either can go first. QA first |
| 4 | [login-and-registration.md](./login-and-registration.md) | — | ✅ Implemented (2026-10-16) | Phases 1–3 on PROD after QA; phase 4, a one-off clean-up of duplicate profile listings on PROD (§11.5), still to run. Login and registration for every user type, across the Marketplace, Auth0 and the webapp: the security fixes, the brand join during sign-up with Try again, the brand pages, webapp creators approved automatically, the background job and Slack approvals. The webapp part has its own spec |
| 5 | [hide-portfolio.md](./hide-portfolio.md) | — | ✅ Implemented (2026-10-16) | One hardcoded constant, `PORTFOLIO_ENABLED` (`src/util/featureFlags.js`, shipped `false`), hides the Portfolio listing type: the profile's tab, the collections on Manage listings, whose Portfolio tab only says portfolios are paused (Shop is the default on both), and the upload wizard (Not Found). Code and data kept; `true` restores it. Also, permanently: the portfolio website is a labelled link under the bio |
| 6 | [remove-referral-factory.md](./remove-referral-factory.md) | — | ✅ Implemented (2026-10-19) | Removes the Referral Factory integration: the "Refer & Earn" page and its menu links, the opt-in endpoint, the API client and the sign-up job's referral step. Code removed, not flagged; existing `privateData.referralCode` stays. Part of a removal across the workspace: the webapp's leftovers have [their own spec](../../../webapp/spec/remove-referral-leftovers.md). Cloud Run's `REFARRAL_*` vars come off only after the PROD deploy |
