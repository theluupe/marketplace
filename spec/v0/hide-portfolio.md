# Hide Portfolio behind a flag

> **Status:** 🟡 Pending. Requirements agreed with Rafael 2026-10-12 → 2026-10-16 (§2); next, the spec is grilled, then
> built.
>
> **What it does:** one hardcoded constant, `PORTFOLIO_ENABLED` in `src/util/featureFlags.js`, switches the Portfolio
> feature off: nobody sees a portfolio and nobody can upload one. The code stays. Setting the constant back to `true`
> restores today's behaviour with no other edit.

---

## 1. What Portfolio is today

Portfolio is the listing type `portfolio-showcase` (`LISTING_TYPES.PORTFOLIO` in `src/util/types.js`). Each portfolio
listing is one named collection of images and videos owned by a creative.

| Surface | Where |
|---|---|
| **Seller profile**: a "Portfolio" tab, the **default** tab. Each collection is a pill that shows its images and videos | `SellerProfilePage.js`, `ProfilePage/utils.js`, `LISTING_GRID_DEFAULTS.TYPE` in `types.js` |
| **Manage listings**: a "Portfolio" tab, also the **default**. The pills can be dragged to reorder the collections | `ManageListingsPage.js`, `ManageListingsPage/utils.js`, `ListingTabs.js` (`savePortfolioListingsOrder`) |
| **Upload**: on the Portfolio tab of Manage listings, "Add" and "Manage" open a 3-step wizard (details, images, videos) | `ListingTabs.js` `goToManageListing`; routes `NewPortfolioListingPage` (`/l/portfolio/new`) and `EditPortfolioListingPage` (`/l/portfolio/:id/:mode/:tab`); `containers/EditPortfolioListingPage/` |
| **A portfolio listing's own URL** (`/l/:slug/:id`, `/l/:id`): never a listing page; redirects to the creative's profile with that collection open | `TheLuupeListingPageGate.js` |
| **Search**: portfolio listings are excluded | `SearchPage.duck.js` `searchValidListingTypes` |
| **Checkout**: a portfolio listing can't be bought | `CheckoutPage.js` |
| **Server**: an event script auto-approves new portfolio listings; a retry script migrates their order | `server/scripts/events/notifyPortfolioListingUpdated.js`, `server/api/scripts-retry/migratePortfolioOrder/` |

**Not Portfolio, despite the name:** `portfolioURL`, the creative's external website link, shown on the profile
(`ProfileInfo.js`) and in the Slack seller-approval message. It is out of scope: it is the new direction, and stays.

---

## 2. Decisions

| # | Decision |
|---|---|
| 1 | **Switch off, don't remove.** A constant hides the feature; every line of Portfolio code stays. (Unlike [disable-coupons.md](./disable-coupons.md), which removed its feature.) |
| 2 | **The listing type only.** `portfolioURL` is not touched. |
| 3 | **Shop becomes the default tab** on the profile and on Manage listings. A URL asking for the Portfolio tab (`?pub_listingType=portfolio-showcase`) lands on Shop. |
| 4 | **A portfolio listing's own URL** redirects to the creative's profile, which opens on its default tab. |
| 5 | **Typing a wizard URL** (`/l/portfolio/...`) shows the Not Found page. The two routes stay registered and render Not Found (§3.8): without them, the URLs would fall through to the generic listing routes, one of which is the upstream edit-listing wizard. |
| 6 | **Data untouched.** Existing portfolio listings stay in Sharetribe as they are. Nothing is deleted or migrated, so turning the flag back on shows them again. |
| 7 | **Server untouched.** With nobody uploading, the two server scripts never run. |
| 8 | **The constant:** `PORTFOLIO_ENABLED = false`, in a new TheLuupe-only file, `src/util/featureFlags.js`. Not in the upstream `types.js`, to keep Sharetribe merges simple. |
| 9 | **This spec:** `spec/v0/hide-portfolio.md`, tracked in `TL_README.md`. |
| 10 | **Manage listings keeps a lone "Shop" tab.** The tab bar isn't hidden, so the page layout is the same with either flag value. |

---

## 3. Changes

The flag-off behaviour comes from **one constant and two helpers**. Every gate below reads those, never its own copy of
the rule.

### 3.1 The flag

**New file:** `src/util/featureFlags.js`.

```js
/**
 * Hardcoded switches for TheLuupe features. Changing a value needs a code change and a deploy.
 *
 * PORTFOLIO_ENABLED — the Portfolio feature (`portfolio-showcase` listings): the profile and Manage-listings tabs and
 * the upload wizard. `false` hides it, code and data kept; `true` restores it. See spec/v0/hide-portfolio.md.
 */
export const PORTFOLIO_ENABLED = false;
```

This comment is the **canonical explanation**. Each gate's comment points here (`see util/featureFlags.js`) instead of
restating it.

The file has no imports, so `types.js` can import it without a cycle.

### 3.2 Two helpers and the default tab

**File:** `src/util/types.js`, next to `LISTING_GRID_DEFAULTS`.

```js
import { PORTFOLIO_ENABLED } from './featureFlags';

// Only Portfolio can be switched off — see util/featureFlags.js.
export const isListingTabEnabled = listingTabType =>
  PORTFOLIO_ENABLED || listingTabType !== LISTING_TAB_TYPES.PORTFOLIO;

export const LISTING_GRID_DEFAULTS = {
  TYPE: role => {
    switch (role) {
      case LISTING_GRID_ROLE.FAVORITE:
        return LISTING_TAB_TYPES.PRODUCT;
      default:
        return PORTFOLIO_ENABLED ? LISTING_TAB_TYPES.PORTFOLIO : LISTING_TAB_TYPES.PRODUCT;
    }
  },
  // CATEGORY unchanged
};

// The tab a page shows: the one the URL asks for, unless it is switched off; otherwise the role's default.
export const resolveListingTabType = (requestedType, role) =>
  requestedType && isListingTabEnabled(requestedType)
    ? requestedType
    : LISTING_GRID_DEFAULTS.TYPE(role);
```

An unknown type (`?pub_listingType=foo`) still passes through `resolveListingTabType` unchanged, as today. The pages'
redirects (§3.5) deal with it as they already do.

### 3.3 The tab list

**File:** `src/components/ListingTabs/GridHelpers.js`, `getTabsFeaturesForRole`.

The role's `tabs` are filtered through `isListingTabEnabled` **once**, where the function returns, not in each role's
branch. With the flag off:

| Role | Tabs |
|---|---|
| `PROFILE` | Shop · About · Reviews (Reviews when not hidden, as today) |
| `MANAGE` | Shop (alone, decision 10) |
| `FAVORITE` | Shop · Creatives (unchanged; it never had Portfolio) |

### 3.4 Which tab is current

Three places compute the current tab the same way today, `queryParams.pub_listingType || defaultListingType`:

- `src/components/ListingTabs/ListingTabs.js` (the active tab, `isSortable`, `goToManageListing`)
- `src/containers/ProfilePage/SellerProfilePage/SellerProfilePage.js`
- `src/containers/ManageListingsPage/ManageListingsPage.js`

All three become `resolveListingTabType(queryParams.pub_listingType, role)`. Without this, a Portfolio URL would render
portfolio cards under a tab bar that has no Portfolio tab.

### 3.5 Rewriting a Portfolio URL to Shop

**Files:** the `useEffect` that fixes the URL, in `SellerProfilePage.js` and `ManageListingsPage.js`.

Its `default:` branch handles a missing, unknown or Portfolio tab, and today rewrites the URL to Portfolio
(`updatePortfolioRoute`). With the flag off it rewrites to Shop instead:

```js
default: {
  const invalidListingType = !(
    listingTypeParamValue && Object.values(LISTING_TAB_TYPES).includes(listingTypeParamValue)
  );
  if (!PORTFOLIO_ENABLED) {
    // Shop is the default tab — see util/featureFlags.js.
    if (invalidListingType || !isListingTabEnabled(listingTypeParamValue)) {
      updateProductRoute();
    }
    break;
  }
  // ...today's code, unchanged
}
```

The other types that reach `default:` (`hidden-product-listing`, `service-listing`) keep today's behaviour: no rewrite.

`onTabChange`'s Portfolio case stays. With no Portfolio tab, nothing can call it.

### 3.6 The data loaders

Without this, the server would fetch portfolio listings for a tab that's hidden. On Manage listings, they would also
flash as Shop cards until the URL rewrite (§3.5) reloads the page.

- **`ProfilePage.duck.js` `loadData`.** Today it injects the default type when the URL has neither
  `pub_listingType` nor `pub_categoryLevel1`. It also replaces a type that's switched off
  (`!isListingTabEnabled(pub_listingType)`) with the default. A URL with only `pub_categoryLevel1` keeps today's
  behaviour.
- **`ManageListingsPage.duck.js` `loadData`.** It injects nothing today (no type → no query). It replaces a type
  that's switched off with `LISTING_GRID_DEFAULTS.TYPE(LISTING_GRID_ROLE.MANAGE)`. A missing type still means no query.

Both payload creators already drop `pub_listingId` before calling the SDK, so a leftover id does nothing.

### 3.7 A portfolio listing's own URL

**File:** `src/containers/ListingPage/TheLuupeListingPageGate.js`.

The Portfolio check still redirects to the author's profile. With the flag off it sends no `search`, so the profile
opens on Shop:

```js
search={
  PORTFOLIO_ENABLED
    ? `?pub_listingType=portfolio-showcase&pub_listingId=${rawParams.id}`
    : undefined
}
```

`NamedRedirect` passes `search` straight to React Router's `<Redirect>`, which accepts `undefined`. Point 1 of the
file's JSDoc changes with it.

### 3.8 The wizard routes

**File:** `src/routing/routeConfiguration.js`. Both routes stay registered. Without them:

| URL | Would match | Result |
|---|---|---|
| `/l/portfolio/new` | `ListingPage` (`/l/:slug/:id`, id `new`) | Most likely an error page, since `new` isn't a listing id; Not Found only if the API answers 404. Not verified |
| `/l/portfolio/<id>/edit/details` | `EditListingPage` (`/l/:slug/:id/:type/:tab`) | For the listing's owner, the upstream edit-listing wizard loaded with that portfolio listing |

With the flag off, each route renders `NotFoundPage`, as the catch-all route does (`props => <NotFoundPage {...props} />`):

| Route | Flag off |
|---|---|
| `NewPortfolioListingPage` | `component` is `NotFoundPage`; **no `auth`**, so a logged-out visitor gets Not Found directly instead of the login page |
| `EditPortfolioListingPage` | `component` is `NotFoundPage`; **no `loadData`**, so the server doesn't load a listing for a page it won't show |

Flag on: both routes exactly as today. `NotFoundPage` sets `staticContext.notfound`, so the server answers **404**.

---

## 4. What doesn't change

- **Every surface on the other side of a gate** stays in the code, unchanged, and unreachable while the flag is off:
  - the `EditPortfolioListingPage` container, duck, reducer registration (`containers/reducers.js`) and
    `pageDataLoadingAPI` entry;
  - `PortfolioListingCard`;
  - the Portfolio branches of `ProfilePage/utils.js` and `ManageListingsPage/utils.js`;
  - `goToManageListing`'s Portfolio branch, `savePortfolioListingsOrder`, and the `EditPortfolio*` translations.
- **The search exclusion and the checkout block.** They apply with either flag value: a portfolio listing must never
  be searchable or bought.
- **The server:** `notifyPortfolioListingUpdated`, `migratePortfolioOrder` and `metadataHelper.js`'s `LISTING_TYPES`.
- **`portfolioURL`** on the profile and in Slack.
- **Existing portfolio listings** in Sharetribe.
- **The sitemap.** It still lists every public listing, portfolio ones included, as `/l/<id>`. Those URLs reach the
  gate (§3.7) and redirect to the profile.
- **Shop's "Add" and "Manage" buttons** on Manage listings (the product upload).
- **The hide is UI-only.** Portfolio listings stay public data in Sharetribe: anyone with a Marketplace API client can
  still query them, as today.

---

## 5. Tests

`yarn test` (Jest). **Every gate is tested with both flag values.** That way "set it back to `true` and everything
returns" is tested, not assumed.

**Toggling the flag:** mock the module; never edit the constant for a test. A getter lets one file test both values
(the path is relative to the test file):

```js
let mockPortfolioEnabled = false;
jest.mock('../util/featureFlags', () => ({
  get PORTFOLIO_ENABLED() {
    return mockPortfolioEnabled;
  },
}));
```

Babel compiles each import of the constant into a property read at call time, so the getter is read on every call.

| Gate | Flag off | Flag on (today) | File |
|---|---|---|---|
| §3.2 `LISTING_GRID_DEFAULTS.TYPE` | `PROFILE`, `MANAGE` → Shop; `FAVORITE` → Shop | `PROFILE`, `MANAGE` → Portfolio; `FAVORITE` → Shop | new `src/util/types.test.js` |
| §3.2 `isListingTabEnabled` / `resolveListingTabType` | Portfolio → disabled → role default; Shop stays; missing → role default; unknown passes through | Portfolio stays | same |
| §3.3 `getTabsFeaturesForRole` | the tab keys of §3.3 | today's keys | new `src/components/ListingTabs/GridHelpers.test.js` |
| §3.6 profile `loadData` | a Portfolio URL and an empty URL both query `product-listing` | both query `portfolio-showcase` | `src/containers/ProfilePage/ProfilePage.test.js` (its `Duck` block) |
| §3.6 manage `loadData` | a Portfolio URL queries `product-listing`; an empty URL queries nothing | a Portfolio URL queries `portfolio-showcase`; an empty URL queries nothing | new `src/containers/ManageListingsPage/ManageListingsPage.duck.test.js` |
| §3.4, §3.5 profile page | no "Portfolio" tab; a Portfolio URL shows Shop and is rewritten to the Shop URL | the Portfolio tab is there and active | `ProfilePage.test.js` (render) |
| §3.7 gate | redirect to the profile with no search | with the portfolio search | new `src/containers/ListingPage/TheLuupeListingPageGate.test.js` |
| §3.8 routes | both render `NotFoundPage`; no `auth` on New, no `loadData` on Edit | today's components, `auth` and `loadData` | new `src/routing/routeConfiguration.test.js` |

**Existing tests run against the shipped value, `false`.** Any that assumed Portfolio is the default tab are updated to
expect Shop. They are not mocked back to `true`: they describe what ships.

**Prove each flag-off test can fail:** run it once with the mock set to `true`; it must go red. A flag-off test that
stays green is testing something other than the flag (CLAUDE.md, "prove the test can fail").

Manage listings' page component has no test file today. Its §3.4 and §3.5 behaviour is the same code as the profile's,
and §8's Manual Testing Plan covers it.

---

## 6. Docs, when it ships

- **`TL_README.md`:** this spec's row moves from Pending to Implemented.
- **`spec/v0/README.md`:** its row turns ✅.
- **`TL_CHANGELOG.md`:** an entry.
- **`CLAUDE.md`** (marketplace): one line by the listing types saying `portfolio-showcase` is switched off by
  `PORTFOLIO_ENABLED` (`src/util/featureFlags.js`), so nobody reads Portfolio as live.
- **This spec:** the Manual Testing Plan (§8), covering both flag values, and the status block.

---

## 7. Rollout

- **Ships with the next Marketplace release.** QA first, then PROD, as usual. No data step, no env var.
- **Turning it back on:** set `PORTFOLIO_ENABLED = true` and deploy. It's a hardcoded constant, so this is a code
  change and a deploy, not a runtime switch. Existing portfolios reappear as they were (decision 6).

---

## 8. Manual Testing Plan

*Added when the spec is implemented (CLAUDE.md, "Manual Testing Plan"). It covers both flag values.*
