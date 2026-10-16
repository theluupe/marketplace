# Hide Portfolio behind a flag

> **Status:** ✅ Implemented (2026-10-16). Requirements agreed with Rafael 2026-10-12 → 2026-10-16 and grilled 2026-10-16
> (§2; the grill changed decisions 2, 3 and 10, added 11 and 12, and accepted the two gaps at the end of §4). Rafael
> picked the labelled website link (§3.10) after comparing both variants in a browser. Ships with the next Marketplace
> release (§7). No Manual Testing Plan, by Rafael's call (§8).
>
> **What it does:** one hardcoded constant, `PORTFOLIO_ENABLED` in `src/util/featureFlags.js`, switches the Portfolio
> feature off: nobody sees a portfolio and nobody can upload one. Visitors don't see a Portfolio tab at all. Creatives
> still have one on Manage listings, showing only a message that portfolios are paused (§3.9). The code stays. Setting
> the constant back to `true` restores the Portfolio feature with no other edit.
>
> **Also, permanently (not behind the flag):** the creative's portfolio website (`portfolioURL`) gets a clearer place on
> the public profile (§3.10). It's the replacement for Portfolio, so it stays when Portfolio comes back.

---

## 1. What Portfolio is today

Portfolio is the listing type `portfolio-showcase` (`LISTING_TYPES.PORTFOLIO` in `src/util/types.js`). Each portfolio
listing is one named collection of images and videos owned by a creative.

| Surface | Where |
|---|---|
| **Seller profile**: a "Portfolio" tab, the **default** tab. Each collection is a pill that shows its images and videos | `SellerProfilePage.js`, `ProfilePage/utils.js`, `LISTING_GRID_DEFAULTS.TYPE` in `types.js` |
| **Manage listings**: a "Portfolio" tab, also the **default**. The pills can be dragged to reorder the collections | `ManageListingsPage.js`, `ManageListingsPage/utils.js`, `ListingTabs.js` (`savePortfolioListingsOrder`) |
| **Upload**: on the Portfolio tab of Manage listings, "Add New" and "Manage" open a 3-step wizard (details, images, videos) | `ListingTabs.js` `goToManageListing`; routes `NewPortfolioListingPage` (`/l/portfolio/new`) and `EditPortfolioListingPage` (`/l/portfolio/:id/:mode/:tab`); `containers/EditPortfolioListingPage/` |
| **A portfolio listing's own URL** (`/l/:slug/:id`, `/l/:id`): never a listing page; redirects to the creative's profile with that collection open | `TheLuupeListingPageGate.js` |
| **Search**: portfolio listings are excluded | `SearchPage.duck.js` `searchValidListingTypes` |
| **Checkout**: a portfolio listing can't be bought | `CheckoutPage.js` |
| **Server**: an event script auto-approves new portfolio listings; a retry script migrates their order | `server/scripts/events/notifyPortfolioListingUpdated.js`, `server/api/scripts-retry/migratePortfolioOrder/` |

**Not Portfolio, despite the name:** `portfolioURL`, the creative's external website link, shown on the profile
(`ProfileInfo.js`) and in the Slack seller-approval message. The flag doesn't touch it: it's the new direction. Its
presentation on the profile changes permanently (§3.10, decision 12).

---

## 2. Decisions

| # | Decision |
|---|---|
| 1 | **Switch off, don't remove.** A constant hides the feature; every line of Portfolio code stays. (Unlike [disable-coupons.md](./disable-coupons.md), which removed its feature.) |
| 2 | **The listing type only.** The flag doesn't touch `portfolioURL`. (Its presentation on the profile changes permanently, decision 12.) |
| 3 | **Shop becomes the default tab** on the profile and on Manage listings. On the profile, a URL asking for the Portfolio tab (`?pub_listingType=portfolio-showcase`) lands on Shop; on Manage listings it lands on the paused tab (decision 11). **Accepted cost (grill, 2026-10-16):** a creative with a portfolio but no Shop listings now opens on Shop's empty state ("Nothing to see here yet — check back soon!"). Rejected: About as the default (buyers land a click away from products), and a per-creative default (the server would need an extra query before it could pick the tab, for a feature that is switched off). |
| 4 | **A portfolio listing's own URL** redirects to the creative's profile, which opens on its default tab. |
| 5 | **Typing a wizard URL** (`/l/portfolio/...`) shows the Not Found page. The two routes stay registered and render Not Found (§3.8): without them, the URLs would fall through to the generic listing routes, one of which is the upstream edit-listing wizard. |
| 6 | **Data untouched.** Existing portfolio listings stay in Sharetribe as they are. Nothing is deleted or migrated, so turning the flag back on shows them again. |
| 7 | **Server untouched.** With nobody uploading, the two server scripts never run. |
| 8 | **The constant:** `PORTFOLIO_ENABLED = false`, in a new TheLuupe-only file, `src/util/featureFlags.js`. Not in the upstream `types.js`, to keep Sharetribe merges simple. |
| 9 | **This spec:** `spec/v0/hide-portfolio.md`, tracked in `TL_README.md`. |
| 10 | ~~**Manage listings keeps a lone "Shop" tab.**~~ **Superseded by 11** (grill, 2026-10-16). It kept the tab bar for a lone tab so the layout didn't change between flag values; decision 11 keeps two tabs, so the layout is today's. |
| 11 | **Manage listings keeps a paused Portfolio tab** (grill, 2026-10-16, Rafael's proposal). Creatives are told where their portfolio went, in the place they look for it, and only creatives see it. The tab shows **only a message**, which says the collections are saved only to a creative who has some (Q6): no collections, no images (still nothing displayed), no "Add New" or "Manage" buttons (they lead to the wizard, which is Not Found). Shop stays the default tab, so nobody lands on the message without clicking Portfolio. The public profile keeps Portfolio fully hidden. Chosen over telling creatives outside the app only, and over a notice on the Shop tab. |
| 12 | **The portfolio website gets a clearer place on the public profile, permanently** (grill, 2026-10-16: an enhancement Rafael brought into this spec). Today it's a bare domain under the bio. With Portfolio off, it's the only path to a creative's work beyond Shop. **Not behind the flag:** it's the replacement for Portfolio, not part of hiding it, so it stays when Portfolio comes back. Flipping the flag back restores the Portfolio feature, not today's exact profile header. Chosen over a flag-dependent version (two renderings to keep and test). Details: §3.10. |

---

## 3. Changes

The flag-off behaviour comes from **one constant and three helpers**. Every gate below reads those, never its own copy
of the rule.

### 3.1 The flag

**New file:** `src/util/featureFlags.js`.

```js
/**
 * Hardcoded switches for TheLuupe features. Changing a value needs a code change and a deploy.
 *
 * PORTFOLIO_ENABLED — the Portfolio feature (`portfolio-showcase` listings): the profile and Manage-listings tabs and
 * the upload wizard. `false` hides it, code and data kept: no Portfolio tab on the profile, and on Manage listings a
 * Portfolio tab that only says portfolios are paused. `true` restores it. See spec/v0/hide-portfolio.md.
 */
export const PORTFOLIO_ENABLED = false;
```

This comment is the **canonical explanation**. Each gate's comment points here (`see util/featureFlags.js`) instead of
restating it.

The file has no imports, so `types.js` can import it without a cycle.

### 3.2 Three helpers and the default tab

**File:** `src/util/types.js`, next to `LISTING_GRID_DEFAULTS`.

```js
import { PORTFOLIO_ENABLED } from './featureFlags';

// Only Portfolio can be switched off. Manage listings still shows its tab, paused; the other pages hide it —
// see util/featureFlags.js.
export const isListingTabShown = (listingTabType, role) =>
  PORTFOLIO_ENABLED ||
  listingTabType !== LISTING_TAB_TYPES.PORTFOLIO ||
  role === LISTING_GRID_ROLE.MANAGE;

// A shown tab whose content is replaced by a "paused" message (§3.9).
export const isListingTabPaused = listingTabType =>
  !PORTFOLIO_ENABLED && listingTabType === LISTING_TAB_TYPES.PORTFOLIO;

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

// The tab a page shows: the one the URL asks for, if that page shows it; otherwise the role's default.
export const resolveListingTabType = (requestedType, role) =>
  requestedType && isListingTabShown(requestedType, role)
    ? requestedType
    : LISTING_GRID_DEFAULTS.TYPE(role);
```

With the flag off, Shop is the default for every role, Manage listings included: a creative only reaches the paused
tab by clicking it, or through an old Portfolio link.

An unknown type (`?pub_listingType=foo`) still passes through `resolveListingTabType` unchanged, as today. The pages'
redirects (§3.5) deal with it as they already do.

### 3.3 The tab list

**File:** `src/components/ListingTabs/GridHelpers.js`, `getTabsFeaturesForRole`.

The role's `tabs` are filtered through `isListingTabShown(tab.key, role)` **once**, where the function returns, not in
each role's branch. With the flag off:

| Role | Tabs |
|---|---|
| `PROFILE` | Shop · About · Reviews (Reviews when not hidden, as today) |
| `MANAGE` | Shop · Portfolio, today's two tabs. Portfolio is paused (§3.9, decision 11) |
| `FAVORITE` | Shop · Creatives (unchanged; it never had Portfolio) |

### 3.4 Which tab is current

Three places compute the current tab the same way today, `queryParams.pub_listingType || defaultListingType`:

- `src/components/ListingTabs/ListingTabs.js` (the active tab, `isSortable`, `goToManageListing`)
- `src/containers/ProfilePage/SellerProfilePage/SellerProfilePage.js`
- `src/containers/ManageListingsPage/ManageListingsPage.js`

All three become `resolveListingTabType(queryParams.pub_listingType, role)`. Without this, a Portfolio URL on the
profile would render portfolio cards under a tab bar that has no Portfolio tab. On Manage listings, Portfolio resolves
to itself (the tab is shown), and §3.9 replaces its content.

> **Trap: on both pages, `queryParams` is not the URL.** It's the arguments of the **last listings query that
> started**, from the store (`state.ProfilePage.queryParams`, `state.ManageListingsPage.queryParams`, set in the
> query thunk's `pending` case). The current tab is therefore whatever the loader last queried. A tab the loader
> doesn't query can never become current, which is why the paused tab runs a query (§3.6).

### 3.5 Rewriting a hidden tab's URL to Shop

**Files:** the `useEffect` that fixes the URL, in `SellerProfilePage.js` (role `PROFILE`) and `ManageListingsPage.js`
(role `MANAGE`).

Its `default:` branch handles a missing, unknown or Portfolio tab, and today rewrites the URL to Portfolio
(`updatePortfolioRoute`). With the flag off it rewrites to Shop instead, unless the page shows the tab:

```js
default: {
  const invalidListingType = !(
    listingTypeParamValue && Object.values(LISTING_TAB_TYPES).includes(listingTypeParamValue)
  );
  if (!PORTFOLIO_ENABLED) {
    // Shop is the default tab — see util/featureFlags.js.
    // role: LISTING_GRID_ROLE.PROFILE on the profile, LISTING_GRID_ROLE.MANAGE on Manage listings.
    if (invalidListingType || !isListingTabShown(listingTypeParamValue, role)) {
      updateProductRoute();
    }
    break;
  }
  // ...today's code, unchanged
}
```

| Page | A Portfolio URL, flag off |
|---|---|
| Profile | Rewritten to Shop. The loader has already swapped the type for Shop (§3.6), so the store says Shop and the `PRODUCT` case adds Shop's category to the URL. The `default:` branch above covers a missing or unknown type |
| Manage listings | Stays on Portfolio and shows the paused message (§3.9). Today's rewrite to the first collection (`updatePortfolioRoute(currentCategory)`) doesn't run |

The other types that reach `default:` (`hidden-product-listing`, `service-listing`) keep today's behaviour: no rewrite.

`onTabChange`'s Portfolio case stays. On the profile nothing can call it. On Manage listings it's what clicking the
paused tab calls: `updatePortfolioRoute()` with no id, so the URL carries no collection.

### 3.6 The data loaders

Without this, the server would fetch portfolio listings that no page shows.

- **`ProfilePage.duck.js` `loadData`.** Today it injects the default type when the URL has neither
  `pub_listingType` nor `pub_categoryLevel1`. It also replaces a type the profile doesn't show
  (`!isListingTabShown(pub_listingType, LISTING_GRID_ROLE.PROFILE)`) with the default. A URL with only
  `pub_categoryLevel1` keeps today's behaviour.
- **`ManageListingsPage.duck.js` `loadData`.** For a paused type (`isListingTabPaused(pub_listingType)`) it queries
  **only the count**: `queryOwnListings({ pub_listingType: 'portfolio-showcase', page: 1, perPage: 1 })`, with no
  `include` and no image fields, so no images come back. The page reads the total from the response's
  `meta.totalItems` (the store's `pagination`). The count covers every own portfolio listing, drafts and closed ones
  included, as today's Portfolio tab lists them.

  It must be a real query, not a skipped one:
  - **It makes the tab current.** Its `pending` case records the Portfolio type in `queryParams` (§3.4). A loader that
    queried nothing would leave the store on the previous tab, so the paused tab could never be selected. (The first
    draft of this spec said "don't query"; corrected in the grill, 2026-10-16.)
  - **It clears the previous tab's listings.** `pending` empties `currentPageResultIds`. A skipped query (the thunk's
    `condition`) doesn't: its `rejected` case returns before touching the state.

  A missing type still means no query, as today.

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

### 3.9 The paused Portfolio tab (Manage listings)

**Files:** `src/containers/ManageListingsPage/ManageListingsPage.js`, `src/components/ListingTabs/ListingTabs.js`,
`src/translations/en.json`.

While the flag is off and Portfolio is the current tab on Manage listings (`isListingTabPaused(currentListingType)`):

| Piece | Behaviour |
|---|---|
| **Content** | Only a message, in `ListingTabs`' existing empty-state panel, instead of `ManageListingsPage.noResults`. Which one depends on the count (§3.6), read once it has loaded (`!queryInProgress`): more than 0 → `ManageListingsPage.portfolioPausedCollectionsSaved`; 0, or a failed count → `ManageListingsPage.portfolioPaused`. A failed count never claims the collections are saved |
| **While the count loads** | `ListingTabs`' usual loading message: the page passes the real `queryInProgress` |
| **What else the page passes** | `items={[]}`, `categories={[]}`, `pagination={null}`, `queryListingsError={null}`. The count's one listing is in the store, but the tab never renders listings. `pagination` stays out because, at one per page, a creative with 5 collections would get 5 page links |
| **"Add New" and "Manage"** | Hidden: both lead to the wizard, which is Not Found. `ListingTabs` hides its action buttons when `isListingTabPaused(currentListingType)`. It resolves the current tab itself (§3.4), so the page passes nothing for this |
| **Collection pills and reordering** | None. With no categories, `ScrollableLinks` doesn't render |
| **Grid-layout toggle** | None. It belongs to the grid, which the empty-state panel replaces |

**Copy:** two new keys, in `en.json` only, like TheLuupe's other keys (`de`/`es`/`fr` carry only upstream ones). A key
missing from the hosted translations in Console falls back to `en.json`.

```json
"ManageListingsPage.portfolioPaused": "Portfolios are paused. To show your work, add your portfolio website to your profile.",
"ManageListingsPage.portfolioPausedCollectionsSaved": "Portfolios are paused, and your collections are saved. To show your work, add your portfolio website to your profile."
```

Chosen in the grill (2026-10-16):
- **Q3:** the wording, over a promise that portfolios return ("…and will be back") and over reassurance alone. It makes
  no promise about the future, and it points creatives to `portfolioURL`, the new direction (decision 2).
- **Q6:** "your collections are saved" only for a creative who saved some. Newly approved creatives have none (they
  can't post listings before approval), yet the approval email's link (§4) opens this tab, so they get the first
  message. Chosen over hiding the tab from creatives without collections, which would need the count on every Manage
  listings load, Shop included, before the tabs could render.

"Your portfolio website" is generic on purpose: the field's on-screen label is set in Console, not in the code. If that
label differs, match it here or in Console.

Flag on: the tab shows the collections, the pills and both buttons, exactly as today.

### 3.10 The portfolio website on the public profile (permanent)

**File:** `src/containers/ProfilePage/SellerProfilePage/ProfileInfo.js` (and `ProfilePage.module.css`). Not behind the
flag (decision 12).

**Today:** the last line of the header's right column, under the bio, is a link button whose label is the URL itself
without `https://` and `www.` (`stripUrl`), cut off with "…" when long, shown only when the creative set one.

**Change: a labelled link**, *Portfolio · janedoe.com ↗*, where the bare link is today, under the bio, replacing it: a
label, the domain as today (`stripUrl`), and an external-link mark. Shown only when the creative set a website; it
opens it in a new tab, as today. New copy, in `en.json`: `ProfilePage.portfolioWebsiteLabel` ("Portfolio").

**Chosen by Rafael (2026-10-16)**, after comparing both variants in a browser (grill Q8 had them both built). Rejected:
a secondary **View portfolio ↗** button in the visitor actions, next to "Request to book". It was removed with its copy
key, `ProfilePage.viewPortfolio`.

**The creative's own profile** (grill Q9, 2026-10-16): nothing extra. The link shows to them as to anyone, their actions
area keeps "Edit profile" alone, and there's no nudge when they have no website: the paused message on Manage listings
(§3.9) already points them to it.

**Found while building:** today's code called `stripUrl(portfolioURL)` on every render, and `stripUrl` throws without a
URL, so a creative with no website would crash the profile header. Whether any real profile can reach it depends on
whether Console makes the field required, which the code can't tell. The label is now computed only when there is a
website.

---

## 4. What doesn't change

- **Every surface on the other side of a gate** stays in the code, unchanged, and unreachable while the flag is off.
  The paused tab (§3.9) is reachable, but it renders none of these, and reads none of them except
  `ManageListingsPage/utils.js`'s `updatePortfolioRoute`, which sets its URL (§3.5):
  - the `EditPortfolioListingPage` container, duck, reducer registration (`containers/reducers.js`) and
    `pageDataLoadingAPI` entry;
  - `PortfolioListingCard`;
  - the Portfolio branches of `ProfilePage/utils.js` and `ManageListingsPage/utils.js`;
  - `goToManageListing`'s Portfolio branch, `savePortfolioListingsOrder`, and the `EditPortfolio*` translations.
- **The search exclusion and the checkout block.** They apply with either flag value: a portfolio listing must never
  be searchable or bought.
- **The server:** `notifyPortfolioListingUpdated`, `migratePortfolioOrder` and `metadataHelper.js`'s `LISTING_TYPES`.
- **`portfolioURL`'s data**, and its use in the Slack seller-approval message. Only its presentation on the profile
  changes (§3.10).
- **Existing portfolio listings** in Sharetribe.
- **The sitemap.** It still lists every public listing, portfolio ones included, as `/l/<id>`. Those URLs reach the
  gate (§3.7) and redirect to the profile.
- **Shop's "Add New" and "Manage" buttons** on Manage listings (the product upload).
- **The "creative seller approved" email** (sent through SendGrid; source copy in
  `webapp/etc/emails/app/sendgrid/creative-seller-approved.mjml`). It still tells newly approved creatives to "Add
  photos and videos to your Portfolio", linking to `/listings?page=1&pub_listingType=portfolio-showcase`. With the flag
  off, that link lands on the paused tab (§3.9), whose message explains and points to the website field. **Accepted
  mismatch (grill, 2026-10-16):** the email is left as it is for now. It can't read the flag, so any rewording is a
  manual change in SendGrid and in the webapp's copy. A rewording that holds with either flag value was offered and
  deferred: "Add your portfolio website to your profile to show what you do best."
- **Content hosted in the Sharetribe Console** (content pages, hosted translations, Sharetribe's email templates). Not
  checked for Portfolio mentions, by decision (grill, 2026-10-16): like the approval email, whatever is there stays.
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
| §3.2 `isListingTabShown` | Portfolio: hidden for `PROFILE` and `FAVORITE`, shown for `MANAGE`; every other tab shown | every tab shown | same |
| §3.2 `isListingTabPaused` | Portfolio paused; every other tab not | nothing paused | same |
| §3.2 `resolveListingTabType` | Portfolio → Shop for `PROFILE`, stays for `MANAGE`; Shop stays; missing → Shop; unknown passes through | Portfolio stays; missing → Portfolio | same |
| §3.3 `getTabsFeaturesForRole` | the tab keys of §3.3 | today's keys (for `MANAGE`, the same two) | new `src/components/ListingTabs/GridHelpers.test.js` |
| §3.6 profile `loadData` | a Portfolio URL and an empty URL both query `product-listing` | both query `portfolio-showcase` | new `src/containers/ProfilePage/ProfilePage.duck.test.js` |
| §3.6 manage `loadData` | a Portfolio URL queries `portfolio-showcase` with `perPage: 1` and no images; an empty URL queries nothing | a Portfolio URL queries `portfolio-showcase`; an empty URL queries nothing | new `src/containers/ManageListingsPage/ManageListingsPage.duck.test.js` |
| §3.4, §3.5 profile page | no "Portfolio" tab; a Portfolio URL shows Shop and is rewritten to the Shop URL | the Portfolio tab is there and active | new `src/containers/ProfilePage/SellerProfilePage/SellerProfilePage.test.js` |
| §3.4, §3.5, §3.9 Manage listings page | Shop is the default; a Portfolio URL stays on Portfolio, with no "Add New"/"Manage", no pills and no pagination; a count above 0 → the "collections are saved" message, 0 or a failed count → the short one, loading → the loading message; **the counted listing is never rendered** | the Portfolio tab shows the collections and both buttons | new `src/containers/ManageListingsPage/ManageListingsPage.test.js` (render) |
| §3.7 gate | redirect to the profile with no search | with the portfolio search | new `src/containers/ListingPage/TheLuupeListingPageGate.test.js` |
| §3.10 website on the profile | **The same with both values** (it isn't behind the flag): with a website, the labelled link, opening it in a new tab; without one, nothing; on the creative's own profile, the link too | same | `SellerProfilePage.test.js` (renders `ProfileInfo`) |
| §3.8 routes | both render `NotFoundPage`; no `auth` on New, no `loadData` on Edit | today's components, `auth` and `loadData` | new `src/routing/routeConfiguration.test.js` |

**Built (2026-10-16):** the profile's tests went to new files instead of `ProfilePage.test.js`, whose 7 tests all fail
at baseline (an older duck API and state shape); a new test added there would sit in a red suite. The render tests
render `SellerProfilePage` and `ProfileInfo` directly, with the Topbar and Footer mocked.

**Existing tests run against the shipped value, `false`.** Any that assumed Portfolio is the default tab are updated to
expect Shop. They are not mocked back to `true`: they describe what ships.

**Prove each flag-off test can fail:** run it once with the mock set to `true`; it must go red. A flag-off test that
stays green is testing something other than the flag (CLAUDE.md, "prove the test can fail").

Manage listings' page has no test file today. The paused tab is new UI, and the store traps (§3.4, §3.6) can't be seen
from the loader alone, so it gets a render test.

---

## 6. Docs, when it ships

- **`TL_README.md`:** this spec's row moves from Pending to Implemented.
- **`spec/v0/README.md`:** its row turns ✅.
- **`TL_CHANGELOG.md`:** an entry.
- **Hosted translations (Console):** nothing to do; the new key falls back to `en.json` (§3.9). Add it in Console only
  to change the wording without a deploy.
- **`CLAUDE.md`** (marketplace): one line by the listing types saying `portfolio-showcase` is switched off by
  `PORTFOLIO_ENABLED` (`src/util/featureFlags.js`), so nobody reads Portfolio as live.
- **This spec:** the status block. The Manual Testing Plan (§8) was dropped by Rafael (2026-10-16).

---

## 7. Rollout

- **Before release: Rafael picks variant A or B** for the website on the profile (§3.10). **Done 2026-10-16:** the
  labelled link (A) is kept; the button (B) was removed with its copy key.
- **Ships with the next Marketplace release.** QA first, then PROD, as usual. No data step, no env var.
- **Turning it back on:** set `PORTFOLIO_ENABLED = true` and deploy. It's a hardcoded constant, so this is a code
  change and a deploy, not a runtime switch. Existing portfolios reappear as they were (decision 6).

---

## 8. Manual Testing Plan

**None, by Rafael's decision (2026-10-16)**, an exception to CLAUDE.md's rule for this small spec. He checked the
profile in a browser when he picked the website link (§3.10); the gates are covered by the tests of §5, with both flag
values.
