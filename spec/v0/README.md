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
