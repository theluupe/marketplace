# Marketplace specs — v1

The `v1/` specs are **Studio-related**, for when Studio replaces the webapp as the platform behind the Studio
Manager client, **and future features**. Pre-Studio changes live in [`../v0/`](../v0/README.md); the plans for
merging the upstream Sharetribe template live in [`../upstream-merge/`](../upstream-merge/README.md).

> Implementation status lives in [TL_README.md](../../TL_README.md#specs). This file describes the **order and
> dependencies** of the v1 set.

> **Status legend.** Keep the `Status` column in sync with [TL_README.md](../../TL_README.md#specs).
>
> - ✅ **Implemented**: shipped in the codebase.
> - 🟡 **Pending**: not built yet, but every dependency is implemented (ready to start).
> - 🔴 **Blocked**: not built yet, and at least one dependency is still Pending or Blocked.

## Specs

Both were moved here from `spec/` on 2026-10-12 **to be reviewed later**: their content and status are as they
were.

| # | Spec | Depends on | Status | Notes |
|---|---|---|---|---|
| 1 | [studio-brand-onboarding-changes.md](./studio-brand-onboarding-changes.md) | [studio/spec/v2/user-sync-and-brand-onboarding.md](../../../studio/spec/v2/user-sync-and-brand-onboarding.md) | 🟡 Pending | Read `isBrandAdmin` from Studio's join response, check a brand with Studio, fill a joiner's brand fields for a brand with no admin. Its first part, against the webapp, is [`../v0/brands-without-admin.md`](../v0/brands-without-admin.md) |
| 2 | [storage-manager-v2-integration.md](./storage-manager-v2-integration.md) | [storage-manager/spec/v2/storage-manager-v2.md](../../../storage-manager/spec/v2/storage-manager-v2.md) (🟡 Pending) | 🟡 Pending | Switch the listing-created and listing-rejected scripts and the digital-product download to storage-manager's `/api/v2/*`. Not built. Its Studio companion has been ⚠️ Deprecated, pending review, since 2026-09-10 |
