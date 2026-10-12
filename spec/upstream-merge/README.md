# Marketplace specs — upstream merges

The Marketplace is a fork of [Sharetribe Web Template](https://github.com/sharetribe/web-template). Each merge of
the upstream template into this fork gets its own plan here: what upstream brings, how each conflict is resolved,
and the risks the merge has to handle. Feature specs live in [`../v0/`](../v0/README.md) (pre-Studio) and
[`../v1/`](../v1/README.md) (Studio-related and future).

> Implementation status lives in [TL_README.md](../../TL_README.md#specs). Name each new plan after the versions it
> spans, as `upstream-merge-v<from>-to-v<to>.md`, and record the merge itself in
> [TL_CHANGELOG.md](../../TL_CHANGELOG.md).

> **Status legend.** Keep the `Status` column in sync with [TL_README.md](../../TL_README.md#specs).
>
> - ✅ **Implemented**: merged.
> - 🟡 **Pending**: not merged yet.

## Merges

| Spec | Upstream versions | Status | Notes |
|---|---|---|---|
| [upstream-merge-v10.14-to-v11.0.2.md](./upstream-merge-v10.14-to-v11.0.2.md) | v10.14.0 → v11.0.2 | ✅ Implemented (2026-05-22) | 244 upstream commits and 27 conflicted paths. Landed on `dev` through PR #151 (`core-upgrade/v11.0.2-v3`); the app is now `11.0.2-theluuupe.*`. Moved here from `spec/` on 2026-10-12 |
