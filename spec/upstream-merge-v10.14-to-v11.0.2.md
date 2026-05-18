# Upstream Merge: Sharetribe Web Template v10.14.0 → v11.0.2

## 1. Overview

A merge from the `original` branch (which tracks
[`sharetribe/web-template`](https://github.com/sharetribe/web-template)) into
`core-upgrade/v11.0.2-v1` is in progress. It brings **244 upstream commits**
spanning seven upstream releases — `v10.14.0`, `v10.14.1`, `v10.15.0`,
`v11.0.0` (major), `v11.0.1`, `v11.0.2`, plus point fixes between releases.

`git` auto-staged the changes that merged cleanly. The remaining **27 paths**
require manual resolution:

- 23 files marked **both modified** — overlapping edits.
- 2 paths marked **deleted by us** — TheLuupe removed the file; upstream
  modified the still-present version on its side.
- `package.json` and `yarn.lock` — both modified, large.

This document is the executable plan. It records:

1. The strategic decisions that govern every conflict resolution (§1.1).
2. An inventory of what upstream is bringing in (§2).
3. A per-conflict resolution recommendation, fully decided (§3).
4. The "silent risk" auto-merges and the in-merge work that addresses them
   so the merge ships safely (§4).
5. The stepwise sequence to land the merge as a single merge commit (§5).
6. Items intentionally deferred to follow-up specs (§6).

This spec was finalised after a structured grilling session that resolved
nine load-bearing decisions. Where a decision had several reasonable
options, this document records the chosen one and a brief reason — the
rejected alternatives are not preserved here.

### 1.1 Strategic decisions

The following decisions shape every recommendation in this document.

1. **Take all upstream changes; adopt upstream's shape.** When a file has
   been refactored upstream (AuthenticationPage, ListingPage, SearchPage,
   ManageListingCard), the resolution adopts upstream's structure and
   re-implements TheLuupe's behavior in the new shape — not the reverse.
   No carve-outs.

2. **Eject from `sharetribe-scripts` is non-negotiable.** Upstream PR #792
   (v11.0.0) replaces the build with an in-tree `config/` and `scripts/`
   directory. TheLuupe's `Dockerfile` / `cloudbuild.yaml` keep using
   `yarn build` / `yarn start`, but those scripts now point at
   `node scripts/build.js` / `node scripts/start.js` instead of
   `sharetribe-scripts ...`.

3. **Auth0 stays — SSO-only is the canonical login/signup path.** TheLuupe
   replaced upstream's built-in identity (Passport-based for IdP login,
   internal forms for password change/reset) with Auth0 (`SSOButton`,
   `express-openid-connect`, brand-studio onboarding). All upstream
   changes that assume built-in auth are rejected:
   - `passport`, `passport-facebook`, `passport-google-oauth` are dropped
     from `package.json`.
   - `LoginForm`, `SignupForm`, `LinkTabNavHorizontal`,
     `getAuthenticationTabs`, `AuthenticationFormErrorMessage` (login/signup
     branches), and `SocialLoginButtons/` are unused after the merge and
     deleted.
   - `login` and `signup` thunks are not imported in `AuthenticationPage.js`
     (only `signupWithIdp`).
   - The `PasswordChangePage` / `PasswordResetPage` ducks (deleted by us)
     stay deleted.

4. **TheLuupe-specific gating uses the γ-inverted wrapper pattern.** Upstream
   ships `ListingPageAccessWrapper` and `SearchPageAccessWrapper` for
   access control. Where TheLuupe needs additional gating (HIDDEN_PRODUCT
   access, PORTFOLIO/PROFILE redirects), we add a TheLuupe-specific gate
   component that the upstream wrapper delegates to *internally* — i.e.
   `ListingPageAccessWrapper` is minimally modified (4 lines) to route
   inner-render through `TheLuupeListingPageGate`. The upstream wrapper's
   checks run first; the TheLuupe gate runs second; the inner page
   renders last. This minimises the number of call-sites that need
   updating and yields the correct semantic ordering (auth/permission
   checks always precede listing-type-specific routing).

   SearchPage does not need a TheLuupe-specific gate — there is no
   SearchPage-level concern that mirrors HIDDEN_PRODUCT/PORTFOLIO/PROFILE.

5. **Voucherify removal (`spec/disable-coupons.md`) is already merged on
   HEAD.** Conflicts in `server/api-util/lineItemHelpers.js` are unrelated
   to coupon code — they are an `exports.*` vs. `this.*` style issue
   introduced by another upstream PR. Resolve to upstream's `exports.*`
   form. Do not re-introduce voucher code paths.

6. **The negotiation transaction process is TheLuupe-owned.** Upstream
   merged a fix to `negotiation-new-offer-from-request-html.html`
   (i18n key rename `UnitPriceLabel` → `LineTotalForOfferLabel`). Take it,
   but the `default-negotiation` process is TheLuupe-authored — verify the
   new translation key exists in `src/translations/en.json` before pushing
   the template to Console.

7. **Silent-risk fixes are in-merge, not deferred.** Two known semantic
   regressions caused by auto-merged upstream changes are fixed *as part
   of this merge*, not in a follow-up:
   - `sanitize.js` metadata filter (PR #779) — TheLuupe metadata fields
     written via the Integration API would be silently dropped. Fix: an
     explicit allow-list is added to `sanitize.js` (§4.1).
   - `getListingsById` returns a fresh array (PR #829) — all six TheLuupe
     callers migrate to `makeGetListingsByIdSelector` (§4.2).

   This means the merge ships with no known broken features, at the cost
   of more code changes in the merge commit.

8. **Single merge commit (Option α); the human commits manually after
   testing.** The implementation work resolves all conflicts and lands all
   in-merge fixes in the working tree. The final `git commit` (which
   produces the merge commit linking `core-upgrade/v11.0.2-v1` and
   `original`) is performed by the human after they have validated the
   working tree by running tests and exercising the app.

   **The implementation `git add`s each resolved file (and `git rm`s the
   orphan ducks) as a standard merge-resolution step** — this clears the
   file from the unmerged-paths list. **The implementation does NOT run
   `git commit` or `git merge --continue`** — those are the human's
   trigger for finalising the merge.

9. **Be conservative with `package.json` dependency edits.** For every
   added/removed/bumped dependency:
   - **Drop:** prove there are no remaining consumers (`grep -r` for the
     package name in `src/`, `server/`, `scripts/`, `config/`) before
     removing. Never drop a TheLuupe-only package by mistake.
   - **Add:** verify the package is needed by upstream's code that we're
     keeping (e.g. CRA-eject build tooling). Never accept upstream
     additions that exist solely to support features we're rejecting
     (e.g. `passport*` for built-in IdP).
   - **Bump (major versions):** check release notes for breaking changes,
     `grep` for TheLuupe's usage of the package's API, and migrate the
     usage in the same merge if simple. Stop and check with the human
     for non-trivial migrations rather than improvising.
   - **Bump (minor/patch):** generally safe; brief release-note scan only.

---

## 2. What the merge brings in (inventory)

This section summarizes the upstream releases. Source: staged
`CHANGELOG.md`. It is not exhaustive — see the linked PRs for full diffs.

### 2.1 v11.0.0 — major (the bulk of the work)

Four large refactors and one ejection:

| Area | PR | Summary |
| --- | --- | --- |
| Build | [#792](https://github.com/sharetribe/web-template/pull/792) | Eject from `sharetribe-scripts` (CRA fork). New `config/` (webpack, babel, eslint, jest, react-dev-utils) and `scripts/` (start, build, build-server, test) directories in-tree. `package.json` `scripts` and `devDependencies` rewritten. |
| AuthenticationPage | [#811](https://github.com/sharetribe/web-template/pull/811) | Refactor to functional component + hooks. `connect`/`mapStateToProps`/`mapDispatchToProps` removed. Middle-layer `AuthenticationForms`/`AuthenticationOrConfirmInfoForm` removed. `SocialLoginButtons` extracted to its own folder; `socialLoginLogos.js` moved with it. New `AuthenticationPage.helpers.js` (`getAuthInfoFromCookies`, `getHandleSubmitConfirm`, `getHandleSubmitSignup`). |
| ListingPage | [#819](https://github.com/sharetribe/web-template/pull/819) | New `ListingPageAccessWrapper.js` component handles access-control redirects. `getDerivedRenderData` moved to `ListingPage.shared.js`. `Notifications/Notifications.js` and `Notifications/ActionBar.js` (renamed from `ActionBarMaybe.js`) replace inline action-bar logic. `connect` removed. |
| SearchPage | [#815](https://github.com/sharetribe/web-template/pull/815) | New `SearchPageAccessWrapper.js`. `SearchErrors.js` extracted. `getDerivedRenderData`, `onApplyFilters`, `onSortBy`, `onResetAll`, `createFilterValueChangeHandler` moved to `SearchPage.shared.js`. `connect` removed. |
| ManageListingCard | [#805](https://github.com/sharetribe/web-template/pull/805) | Card split into `CardMenu.js`, `CardThumbnail.js`, `PriceInfo.js`. `Overlay.js` refactored. List of cards turned into `ul`/`li` for accessibility. Out-of-stock cards no longer show menu. |
| Stripe (NL) | [#824](https://github.com/sharetribe/web-template/pull/824) | Netherlands sellers must use `business_type: company` (no individual accounts). Affects Stripe Connect onboarding. |
| New schema type | [#812](https://github.com/sharetribe/web-template/pull/812) | `shortText` schema type for user/listing/transaction fields. Sanitized via `sanitizeText`. |
| Color fix | [#825](https://github.com/sharetribe/web-template/pull/825) | Email verification badge color correction. |
| CheckoutPage | [#816](https://github.com/sharetribe/web-template/pull/816) | Fix return value in pay-and-save-card flow. |
| Translations | [#818](https://github.com/sharetribe/web-template/pull/818) | DE/ES/FR updates. |

### 2.2 v10.15.0

| Area | PR | Summary |
| --- | --- | --- |
| Sort | [#760](https://github.com/sharetribe/web-template/pull/760) | `mergeSortConfig`: hosted sort options merge with default. |
| Sort | [#803](https://github.com/sharetribe/web-template/pull/803) | Sort listings by custom **numeric** public-data fields (new `showSorting`, `sortingOrder`, `sortingGroup` validation in `configHelpers.js`; `getSortOptionsFromListingFields` builder). |
| Metadata fields | [#779](https://github.com/sharetribe/web-template/pull/779) | **Custom metadata fields** for listings and users. Operator-controlled (Console / Integration API only — not user-editable). Indexable for search and sortable. New scope `metadata` joins the existing `public`/`private`. `sanitize.js` now filters metadata against config. |
| Mobile | [#806](https://github.com/sharetribe/web-template/pull/806) | h4 font-size + margins on mobile. |
| Styleguide | [#810](https://github.com/sharetribe/web-template/pull/810) | `StripePaymentForm` example fix. |
| Deps | [#809](https://github.com/sharetribe/web-template/pull/809) | `moment-timezone` 0.6.0 → 0.6.1. |

### 2.3 v10.14.x — bug fixes and small additions

| PR | Summary |
| --- | --- |
| [#807](https://github.com/sharetribe/web-template/pull/807) | `SectionListings`: fix anchor-link IDs breaking section matching. |
| [#802](https://github.com/sharetribe/web-template/pull/802) | `CheckoutPage`: add loading spinner. |
| [#799](https://github.com/sharetribe/web-template/pull/799) | `CheckoutPage`: initialize `stripeCustomerFetchError` in initial state. |
| [#801](https://github.com/sharetribe/web-template/pull/801) | Test improvements (avoid warnings, fakeSDK shape). |
| [#796](https://github.com/sharetribe/web-template/pull/796) | Listing card price classes. |
| [#778](https://github.com/sharetribe/web-template/pull/778) | New `HelpText` component; `helpText` from listing/user field assets. |
| [#712](https://github.com/sharetribe/web-template/pull/712) | New `featured-listings` section type. |

### 2.4 v11.0.1 / v11.0.2 — patches

| PR | Summary |
| --- | --- |
| [#831](https://github.com/sharetribe/web-template/pull/831) | `EditListingWizard`: handle required `shortText` fields. |
| [#828](https://github.com/sharetribe/web-template/pull/828) | Dependency bumps (webpack 5.106, lodash 4.18, postcss 8.5.9, etc.). |
| [#829](https://github.com/sharetribe/web-template/pull/829) | `marketplaceData.duck.js`: introduce `makeGetListingsByIdSelector` factory; `getListingsById` allocates a new array each call (perf fix). SearchPage variants migrate to memoized factory. |
| [#840](https://github.com/sharetribe/web-template/pull/840) | User fields: `numberConfig` validation accepts `min`/`max`. |
| [#839](https://github.com/sharetribe/web-template/pull/839) | `InboxSortBy` mobile-layout margin bug. |
| [#838](https://github.com/sharetribe/web-template/pull/838) | `UserCard`: bad margins on `mode` button. |
| [#835](https://github.com/sharetribe/web-template/pull/835) | `mergeSortConfig`: handle missing hosted sort config. |
| [#837](https://github.com/sharetribe/web-template/pull/837) | Email template: i18n key rename `UnitPriceLabel` → `LineTotalForOfferLabel`. |
| [#834](https://github.com/sharetribe/web-template/pull/834) | DE/ES/FR translations. |

---

## 3. Conflict resolutions

27 paths. Each has a fully-decided resolution.

### 3.1 Trivial — accept upstream or one-line hybrid

| File | Resolution |
| --- | --- |
| `src/containers/AuthenticationPage/AuthenticationPage.module.css` | Take upstream's new `.signupWithIdpTitle` and `.confirmInfoText` rules. **Also** fold in the rules currently in `AuthenticationForms/AuthenticationForms.module.css` (which is being deleted per §3.3 AuthenticationPage): `.confirmFormRoot`, `.forBrand`, `.forSeller`, `.infoSection`, `.infoTitle`, `.infoSubtitle`, `.signupForm`, `.confirmForm`, plus any helper classes referenced by TheLuupe's `ConfirmIdProviderInfoForm`. Resolve any class-name collision (e.g. `.signupWithIdpTitle` exists on both sides) by keeping one definition. |
| `src/containers/ListingPage/UserCard/UserCard.module.css` | Take upstream — adds a `@media (--viewportMedium)` `font-weight` rule. PR #838 fix. |
| `src/containers/ManageListingsPage/ManageListingsPage.module.css` | Take upstream's responsive padding scheme (24px / 36px). |
| `src/containers/InboxPage/InboxPage.duck.js` | Hybrid — adopt upstream's slice rebuild with `extraReducers`; add TheLuupe's `loadInboxBaseDataThunk` alongside `loadDataThunk`. |
| `src/containers/ContactDetailsPage/ContactDetailsPage.duck.js` | **Drop** upstream's `resetPasswordThunk` reducer cases. The thunk itself is intentionally removed in TheLuupe (line 8 comment: "Luupe: password reset was intentionally removed (not exposed from ContactDetailsPage)"), so taking the case handlers would be a build-time `ReferenceError` (`resetPasswordThunk is not defined`). The handlers must go with the thunk. |
| `src/containers/SearchPage/SearchPage.duck.js` | Hybrid — adopt upstream's `sortSearchParams()` helper. Wrap it with TheLuupe's creatives default-sort branch (`pub_categoryLevel1 === 'creatives'` → `createdAt`) so TheLuupe's behavior survives without forking the helper. |
| `src/containers/SearchPage/SortBy/SortBy.js` | Hybrid — keep upstream's null-guard refactor. Move the `creativeSearch` default-sort decision out of `SortBy` and into `SearchPage.duck.js` (or the parent that supplies sort props); pass `defaultSort` as a prop to `SortBy`. |
| `src/containers/CheckoutPage/CheckoutPage.js` | Hybrid — keep both: TheLuupe's `CheckoutPageWithoutPayment` import and upstream's new `./CheckoutPage.module.css` import. |
| `src/containers/PageBuilder/SectionBuilder/SectionBuilder.js` | Hybrid — upstream renamed `sections` → `sectionsWithResolvedIds` (PR #807 anchor-link fix). Keep TheLuupe's `sectionIndex` prop, but pass `sectionsWithResolvedIds` to children so the anchor fix lands. |

### 3.2 Server / build conflicts

| File | Resolution |
| --- | --- |
| `server/apiServer.js` | Keep TheLuupe's `startServer()` wrapper, compression, and SEO routes. Upstream's direct `app.listen()` is a regression for our setup. |
| `server/index.js` | Two conflicts. **First** (lines ~93-205): keep TheLuupe's bot-rejection middleware (PHP/wp-*/cgi-bin); drop upstream's robots/sitemap/manifest/well-known/passport/api/SSR block — TheLuupe already has equivalent handlers later in the file (lines 270-447), structured inside `startServer()`. Upstream's block in this region is a duplicate. **Second** (lines ~365-386): keep TheLuupe's `startServer()` call; drop upstream's direct `app.listen()` + SIGINT/SIGTERM block — TheLuupe already has graceful-shutdown handlers inside `startServer()` (added in HEAD prior to this merge). Port upstream's `// eslint-disable-line no-console` comments to TheLuupe's `console.log` calls (post-CRA-eject ESLint may warn). |
| `server/api-util/lineItemHelpers.js` | Take upstream's syntactic improvement — convert all `this.calculateTotalFromLineItems(...)` / `this.hasMinimumCommission(...)` references to `exports.*`. **However, upstream's MERGE_HEAD also introduced a bug:** it changed the variable inside the call from `baseLineItemsForCommission` to `[order]`, where `order` is not in scope (the function signature is `(providerCommission, baseLineItemsForCommission, currency)`). Combine `exports.*` syntax (from upstream) with `baseLineItemsForCommission` (from HEAD) to get a working result. The conflicts are independent of `spec/disable-coupons.md`; do not re-introduce voucher branches. |
| `package.json` | See §3.5. |
| `yarn.lock` | After resolving `package.json`, regenerate with `rm yarn.lock && yarn install`. Do **not** hand-merge. |

### 3.3 Page-shape conflicts (refactor adoption)

These adopt upstream's new structure and re-implement TheLuupe behavior in
the new shape per §1.1 #1.

#### `src/containers/AuthenticationPage/AuthenticationPage.js`

Full rewrite per Option B + Option 2C. Concretely:

- **Migrate the wiring layer to hooks.** Replace
  `compose(connect(mapStateToProps, mapDispatchToProps), withRouter)`
  with `useDispatch`, `useSelector`, `useNavigate`/`useLocation`/`useParams`.
  Component body is already functional; only the wiring is class-style.
- **Adopt upstream's `AuthenticationPage.helpers.js`** for the cookie
  helpers; drop the inline `getAuthInfoFromCookies` / `getAuthErrorFromCookies`
  definitions in `AuthenticationPage.js`.
- **Override `getHandleSubmitConfirm` in place** in
  `AuthenticationPage.helpers.js` with a TheLuupe-aware version that adds
  `brandStudioId`, `location`, `newsletterOptIn`, and the
  `withHiddenPrivateData = isStudioBrand(userType) && !!brandStudioId`
  branch. Same name; single export. Signature gains `brandStudioId` param.
- **Delete `getHandleSubmitSignup`** from `AuthenticationPage.helpers.js` —
  no call-site post-merge (SSO-only).
- **Delete the entire `src/containers/AuthenticationPage/AuthenticationForms/`
  folder** (`AuthenticationForms.js` + `AuthenticationForms.module.css`).
  Move its rules into `AuthenticationPage.module.css` per §3.1.
- **Delete the entire `src/containers/AuthenticationPage/SocialLoginButtons/`
  folder** (`SocialLoginButtons.js`, `SocialLoginButtons.module.css`,
  `socialLoginLogos.js`). No consumer post-merge (SSO-only — `SSOButton`
  uses `SocialLoginButton` from `src/components`, not these).
- **Inline a `<SignupBody>` sub-component** in `AuthenticationPage.js` that
  routes between `<BaseSignup>` / `<BrandSignup>` based on `isStudioBrand`.
  This replaces the deleted `AuthenticationForms` middleware.
- **Inline a `<ConfirmIdProviderInfoForm>` sub-component** in
  `AuthenticationPage.js` that renders the brand/seller info section + the
  `<ConfirmSignupForm>`. Uses the new TheLuupe `getHandleSubmitConfirm`
  from helpers.
- **Keep the SSO-first early returns:** `if (isLogin) return <SSOButton forceRedirect ... />`
  and `if (isSignup && preselectedUserType && !isBrand) return <SSOButton forceRedirect ... />`.
- **Do NOT add** any of the upstream constructs that violate SSO-only:
  `LinkTabNavHorizontal`, `LoginForm`, `SignupForm`, `getAuthenticationTabs`,
  `AuthenticationFormErrorMessage` (login/signup branches), or imports of
  `login` / `signup` from `auth.duck`. Confirm error rendering is kept
  (only path that fires post-merge).
- **Migrate `getListingsById` usage** to `useMemo(makeGetListingsByIdSelector, [])`
  + `useStore` (this caller's slice of the §4.2 work). The closure-pattern
  caller `getListingEntitiesById = listingIds => selectListingsById(state, listingIds)`
  is consumed by `getFeaturedListingsProps` and needs the same shape, so the
  hook-based wrapper uses `useStore()` for ad-hoc state reads inside the
  closure rather than calling `useSelector` (which can't be called inside a
  nested closure):

  ```js
  const dispatch = useDispatch();
  const store = useStore();
  const selectListingsById = useMemo(makeGetListingsByIdSelector, []);
  const getListingEntitiesById = useCallback(
    listingIds => selectListingsById(store.getState(), listingIds),
    [selectListingsById, store]
  );
  ```

- **Inline component placement.** Define `<SignupBody>` and
  `<ConfirmIdProviderInfoForm>` as module-scope sub-components above
  `AuthenticationPageComponent` (not nested inside it) so they don't
  re-create on every render of the parent. Both are passed only the
  props they need; both call hooks (`useConfiguration`, `useIntl`) when
  appropriate.

- **CSS fold details.** The classes folded into `AuthenticationPage.module.css`
  from the deleted `AuthenticationForms.module.css` are: `.confirmFormRoot`
  (with nested `&.forBrand`, `&.forSeller`, `.infoSection`), `.infoTitle`,
  `.infoSubtitle`, `.confirmForm`, `.signupForm`, `.form`. **Skip**
  `.signupWithIdpTitle`, `.confirmInfoText`, and `.error` — those already
  exist in `AuthenticationPage.module.css` from upstream's earlier
  additions. Folding produces ~110 added lines.

Out-of-scope for this file (deferred to §6): nothing — AuthenticationPage
is fully migrated in this merge.

#### `src/containers/ListingPage/ListingPage.shared.js` (2 hunks)

- **Imports conflict (lines 36-40):** combine — both `H2` (used at line 546)
  and `NamedLink` (used at line 226) are needed. Result:
  `import { H2, Page, LayoutSingleColumn, NamedLink } from '../../components';`
- **`handleContactUser` destructuring conflict (lines 308-313):** drop the
  duplicate `setInitialValues` (already in the common section at line 305),
  keep `onRequestToBook` (used at line 333), drop `setInquiryModalOpen`
  (TheLuupe's body never calls it — the post-signup roundtrip uses
  `inquiryModalOpenForListingId` via `callSetInitialValues`, not direct
  modal toggling).
- Adopt upstream's new `getDerivedRenderData` export (all-uppercase agreed
  in common section).

#### `src/containers/ListingPage/ListingPageCarousel.js` (11 hunks) and `src/containers/ListingPage/ListingPageCoverPhoto.js` (9 hunks)

Same pattern in both files. Both end up rewritten end-to-end (HEAD's 645/660 lines → unified 425/446 lines):

- **Adopt upstream's structure.** Replace the inline state derivation
  (lines ~135-200 in HEAD) with a single call to
  `getDerivedRenderData(...)` from `ListingPage.shared.js`.
- **Swap the two inline `<ActionBarMaybe />`** call-sites for a single
  `<Notifications />` from `./Notifications/Notifications`. Update the
  import: `import ActionBarMaybe from './ActionBarMaybe'` →
  `import Notifications from './Notifications/Notifications'`. The old
  `src/containers/ListingPage/ActionBarMaybe.js` is deleted by the merge.
- **Delete the inline access-check block** (HEAD lines 544-577 in Carousel,
  parallel in CoverPhoto): `isPrivateMarketplace`, `isUnauthorizedUser`,
  `hasNoViewingRights`, `pendingApproval` cascade. All of these are now
  handled by `ListingPageAccessWrapper` (upstream-pristine, see §3.6).
- **Delete the inline HIDDEN_PRODUCT block** (HEAD lines 218-228 in
  Carousel, parallel in CoverPhoto): `isHiddenProductListing` /
  `isLuupeAdmin` / `hasAccess` check + `NamedRedirect` to `NoAccessPage`.
  All of this moves to `TheLuupeListingPageGate.js` (new file, see §3.6).
- **Delete the inline PORTFOLIO and PROFILE redirect blocks** (HEAD lines
  178-196 in Carousel, parallel in CoverPhoto). Both move to
  `TheLuupeListingPageGate.js`.
- **Drop upstream's inquiry-modal flow entirely.** TheLuupe routes the
  contact-author CTA to a TypeForm booking URL via `onRequestToBook` —
  there is no in-app inquiry modal. Concretely, drop:
  - `inquiryModalOpen` state hook
  - `handleSubmitInquiry` import and call
  - `sendInquiry` / `onSendInquiry` / `sendInquiryInProgress` /
    `sendInquiryError` (from selectors, dispatchers, and props)
  - `setInquiryModalOpen` parameter passed to `handleContactUser` (the
    helper now expects `onRequestToBook` per the
    `ListingPage.shared.js` resolution above)
  - The corresponding `<SectionAuthorMaybe>` props for inquiry-modal
    state — TheLuupe's `<SectionAuthorMaybe>` only takes `listing`,
    `onContactUser`, `currentUser`.
- **Graft TheLuupe-specific behaviour on top of upstream's structure:**
  - `onRequestToBook()` function in component body — opens
    `https://theluupe.typeform.com/booking#creatorname=...&creatorid=...`
    using `authorDisplayName` and `authorId` from `getDerivedRenderData`'s
    output.
  - Pass `onRequestToBook` to `handleContactUser`.
  - `onToggleFavorites = handleToggleFavorites({...})` from
    `../../util/favorites`. Pass `onToggleFavorites`, `currentUser`, and
    `currentUserFavorites` (read from `currentUser?.attributes?.profile?.privateData?.favorites`)
    to `<OrderPanel>`.
  - `onUpdateFavorites` / `onFetchCurrentUser` dispatchers in the outer
    `ListingPage` wrapper, via `useCallback(payload => dispatch(updateProfile(payload)))`
    and `useCallback(() => dispatch(fetchCurrentUser({})))` respectively.
- **Carousel only** (not CoverPhoto): render `<SectionCategoriesMaybe>`
  + `<SectionKeywordsMaybe>` after `<CustomListingFields>` and before
  `<SectionMapMaybe>`. CoverPhoto's HEAD doesn't have these sections.
- **CoverPhoto only:** preserve upstream's `imageCarouselOpen` state +
  `handleViewPhotosClick` handler + `<SectionHero>` rendering with the
  action bar passed as the `actionBar` prop.

#### `src/containers/ListingPage/Notifications/ActionBar.js` (4 hunks)

This is the **renamed** `ActionBarMaybe.js` (upstream rename via PR #819).

- **Adopt upstream's signature** — `currentUser`, `editParams`, plus the
  `CTAButtonMaybe` helper.
- **Fix relative import paths** for the new file location
  (`'../../../context/...'` instead of `'../../context/...'`).
- **Delete the old `src/containers/ListingPage/ActionBarMaybe.js`** after
  porting — the rename is complete (the merge already deletes it; just
  ensure no caller still imports the old path).
- Update any caller still importing `./ActionBarMaybe` to import
  `./Notifications/ActionBar` (the page-shape work in Carousel/CoverPhoto
  already handles this swap by switching from `<ActionBarMaybe>` to
  `<Notifications>`, which internally imports `./ActionBar`).
- **No TheLuupe-specific layering needed in the function body.** The
  `noPayoutDetailsSetWithOwnListing` notification is already handled by
  the file's existing `isOwnListing && showNoPayoutDetailsSet` branch.
  TheLuupe's `isLuupeAdmin` admin check lives in
  `TheLuupeListingPageGate`, not in the action bar.
- **Caveat:** upstream defines `<CTAButtonMaybe>` (lines ~25-57) and
  destructures `currentUser`, `editParams` from props (lines ~71-80),
  but neither `<CTAButtonMaybe>` nor those props are actually invoked
  in the function body — only `isCTAEnabled` is computed for CSS class
  modifiers. This appears to be incomplete CTA wiring on upstream's
  side. Left as-is to match upstream's signature; the unused imports
  (`useRouteConfiguration`, `generateLinkProps`, `ExternalLink`) and
  unused props will go away once upstream finishes wiring the CTA.

#### `src/containers/ListingPage/CustomListingFields.js` (3 hunks)

- Take upstream's `isFieldForCategory` prop on `sectionDetailsProps` (so
  `<SectionDetails>` can use the helper for per-category filtering).
- **Don't** take upstream's bare `const isTargetCategory = isFieldForCategory(...)`
  shortcut inside `pickExtendedDataFields`. TheLuupe HEAD's
  `isFieldForSelectedCategories(config)` adds a `getListingBaseFields`
  allow-list on top of the category check (excludes `releases`, `keywords`,
  `imageryCategory`, `originalFileName`, `imageSize` from listing-page
  display). The if-condition uses TheLuupe's helper, so the upstream
  shortcut would be dead code if added.
- Preserve TheLuupe's defensive `?.filter(...) ?? []` null guards on
  `displayableFieldConfigs`.

#### `src/containers/SearchPage/SearchPageWithGrid.js` (9 hunks) and `src/containers/SearchPage/SearchPageWithMap.js` (11 hunks)

- **Adopt upstream's structure.** Replace inline state derivation with the
  new shared helpers from `SearchPage.shared.js` (`getDerivedRenderData`,
  `onApplyFilters`, `onSortBy`, `onResetAll`, `createFilterValueChangeHandler`).
- **Adopt `SearchPageAccessWrapper` (upstream-pristine)** — no
  TheLuupe-specific gate is added at the SearchPage level.
- **Delete the inline access-check block** in both files (HEAD lines
  578-595 in Grid, parallel in Map). Now in the wrapper.
- **Migrate to `makeGetListingsByIdSelector`** — change `getListingsById`
  to the memoized factory pattern. Both variants are class components
  using `connect` — use the factory `mapStateToProps` form
  (`const makeMapStateToProps = () => { const sel = makeGetListingsByIdSelector(); return state => ({ listings: sel(state, ids), ... }); }`)
  rather than migrating to hooks.
- **Preserve TheLuupe's grid-only category logic in `SearchPageWithGrid.js`**:
  the keyword-search location-filter injection (lines ~117-134) and the
  `isCreativesSearch` → `GRID_STYLE_SQUARE` override (line ~402-404).
  These do not exist in `SearchPageWithMap.js` and should remain inline
  in the Grid variant only — there is no cross-variant duplication to
  extract.

#### `src/containers/ManageListingsPage/ManageListingCard/ManageListingCard.js` (9 hunks)

- **Adopt upstream's split-component composition** —
  `<CardThumbnail>` (which embeds `<DraftOverlay>`), `<CardMenu>`,
  `<PriceInfo>`, the refactored `<Overlay>`. All sub-components are
  staged as new files; accept them.
- **Take upstream's `discardDraft` end-to-end** — modal, duck thunk, page
  wiring, `onDiscardDraft` prop chain. TheLuupe's HEAD shipping the same
  feature is essentially redundant with what's coming in.
- **Remove the "Finish listing" `<NamedLink>` from `<DraftOverlay>` in
  `CardThumbnail.js`.** Restructure the overlay text so "Discard" reads
  as the primary action rather than as the "alternative". Drop the
  unused `.finishListingDraftLink` CSS class and the
  `ManageListingCard.finishListingDraft` i18n key from
  `src/translations/en.json` if it's not referenced elsewhere.
- **Leave card-click behavior untouched.** Clicking a draft card still
  navigates to `ListingPageVariant?variant=draft` (read-only preview).
- **Re-apply TheLuupe-only parts** in the new component boundaries:
  `createListingURL` builder for the body click, custom thumbnail/price
  logic if present.
- **Modify `<CardThumbnail>` to accept an `isSquareLayout` prop**
  (default `true`). When `false` (i.e. MASONRY grid mode), the inner
  `<Thumbnail>` helper switches from `<AspectRatioWrapper>` to
  `<AspectRatioWrapperMaybe isSquareLayout={false}>` — the latter
  degrades to a plain `<div>` so images render at their natural height.
  **Without this, MASONRY mode renders every image as a square** and
  the masonry grid breaks (HEAD's `ManageListingCard` already handled
  this via `<AspectRatioWrapperMaybe>` directly; upstream's new
  `<CardThumbnail>` lost the conditional). The `css.rootForImage`
  rootClassName on the image is also conditionally applied only when
  `isSquareLayout=true`, mirroring HEAD. Pass
  `isSquareLayout={gridLayout === GRID_STYLE_SQUARE}` from the parent.

#### `src/containers/ManageListingsPage/ManageListingsPage.js` (1 hunk)

- **Keep TheLuupe's `<ListingTabs>` structure.** TheLuupe HEAD wraps the
  listing rendering in a TheLuupe-only `<ListingTabs>` component that
  provides a tabbed UI with built-in grid, pagination, and a
  `<GridLayoutToggle>` for switching between `GRID_STYLE_SQUARE` and
  `GRID_STYLE_MASONRY`. Upstream's new `ul`/`li` + `PaginationLinksMaybe`
  block is functionally equivalent to (and a regression from) TheLuupe's
  tabbed layout — adopting upstream's flat list would lose the tabs UX
  and the layout toggle. Resolution: drop upstream's manual block;
  preserve TheLuupe's `<ListingTabs listingRenderer={listingRenderer} ... />`
  invocation.
- Keep the page-level `<DiscardDraftModal>` rendering as a sibling of
  `<ListingTabs>`. The modal is byte-identical between TheLuupe HEAD
  and upstream.

#### `src/containers/ManageListingsPage/ManageListingsPage.duck.js` (1 hunk)

- **Take upstream's `discardDraft` thunk and reducer cases** (identical
  shape to TheLuupe's HEAD).
- **Preserve the four TheLuupe `queryOwnListings` refinements:**
  - `LISTING_TAB_TYPES` import + `shouldQueryOwnListings` condition
    (skip the API call unless `pub_listingType` or `pub_categoryLevel1`
    is in `queryParams` — TheLuupe's tab-driven listings UI).
  - `withImageLimit` query-param injection (`'limit.images': 1` for
    non-portfolio queries).
  - `action.meta?.condition` early-return in `queryOwnListingsThunk.rejected`
    (suppresses noisy console error when the thunk is skipped via
    `condition`).
  - `queryParams: {}` initial state (vs. upstream's `null`) — defensive
    default for callers that read `queryParams` unconditionally.

#### `src/containers/ProfilePage/ProfilePage.js` (1 hunk)

Keep TheLuupe's thin router pattern; **drop** upstream's helpers block
entirely. TheLuupe HEAD is a 286-line router that delegates to
`<BasicProfilePage>` and `<SellerProfilePage>` based on listing type.
Upstream's MERGE_HEAD is a 529-line page that defines its own helpers
(`AsideContent`, `ReviewsErrorMaybe`, `MobileReviews`, `DesktopReviews`,
`CustomUserFields`, `MainContent`) inline. Those helpers are **not
needed in `ProfilePage.js`** post-merge — TheLuupe's two child pages
handle their own rendering with their own local helpers.

Concretely, the conflict region (lines 35-324) contains the entire
upstream helpers block on its `=======` side. Resolution: keep only
the two TheLuupe imports (`BasicProfilePage`, `SellerProfilePage`) and
drop everything else from the upstream side. The router-only file ends
up at ~293 lines.

If a future TheLuupe change wants any of upstream's helpers, copy them
from `git show MERGE_HEAD:src/containers/ProfilePage/ProfilePage.js`
into the relevant child page.

#### `src/containers/StripePayoutPage/StripePayoutPage.js` (1 hunk)

Hybrid imports.

- Keep TheLuupe's `showBrandManagementTab` import — used at body line
  ~188 (`showBrandManagement: showBrandManagementTab(currentUser)`).
- Keep `showPaymentDetailsForUser` (shared between sides) — used at
  body line ~183.
- Take upstream's `getDisplayAccountType` import from `../../util/stripeConnect`
  — used at body line ~151
  (`const savedAccountType = stripeAccountData ? getDisplayAccountType(stripeAccountData) : null;`).
- **Do not** import upstream's `showCreateListingLinkForUser`. It is
  not consumed in the body; importing it would be unused-import noise.

### 3.4 Deleted-by-us

| File | Resolution |
| --- | --- |
| `src/containers/PasswordChangePage/PasswordChangePage.duck.js` | `git rm`. TheLuupe deleted the entire `PasswordChangePage/` directory in commit `fdf0286e5` ("Remove old wireframe password change page and form") as part of the Auth0 migration; only the `.duck.js` is left orphaned because upstream modified it (Redux Toolkit migration). The orphan must go. |
| `src/containers/PasswordResetPage/PasswordResetPage.duck.js` | `git rm`. Same reasoning. |

### 3.5 `package.json`

Five conflict regions. Resolve as follows; regenerate `yarn.lock` afterwards.

- **Version field.** Set to `11.0.2-theluuupe.1`. The major reflects the
  upstream version we just merged (`v11.0.2`); the suffix `-theluuupe.1`
  starts a fresh pre-release counter for TheLuupe builds on top of the
  v11 base.
- **`scripts` block.** Upstream rewrote build/test scripts to point at the
  new in-tree `scripts/` directory. TheLuupe must keep its custom script
  names so `Dockerfile` and `cloudbuild.yaml` keep working. Mapping:
  - `start` → `node scripts/start.js`
  - `build` → `node scripts/build.js && node scripts/build-server.js`
  - `test` → `node scripts/test.js`
  - `dev`, `dev-frontend`, `dev-backend`, `format`, `format-ci`,
    `config-check`, `test-server`, `test-ci` — preserve names; redirect
    any internal call to `sharetribe-scripts` at the underlying
    `node scripts/*` form.
- **`dependencies`.** Take upstream's bumps (`dotenv` 17.x, `dotenv-expand`
  12.x, `moment-timezone` 0.6.1, `@sentry/node` 10.43.0, `react-refresh`,
  `path-to-regexp` 8.4.2, `webpack` 5.106, `lodash` 4.18,
  `postcss-preset-env` 11.2.1, `inquirer` 8.2.7, `filesize` 11.0.15).
  Preserve TheLuupe-only packages: `@google-cloud/secret-manager`,
  `@google-cloud/storage`, `@slack/web-api`, `@uppy/*` set, `auth0`,
  `analytics-node`, `transloadit`, `exifr`, `papaparse`,
  `@ant-design/icons`, `react-responsive-masonry`. **Drop
  `@voucherify/sdk`** — already removed in `spec/disable-coupons.md`.
  **Drop `passport`, `passport-facebook`, `passport-google-oauth`** — TheLuupe
  uses Auth0.

  **Major-version bumps that need usage verification (per §1.1 #9):**
  - `dotenv` 10.x → 17.x — 7 major versions. Check `.env` loading code,
    especially anywhere the `parsed` API or `DOTENV_CONFIG_*` env vars
    are referenced.
  - `dotenv-expand` 5.x → 12.x — API signature changed (now `expand({ parsed })`
    rather than `expand(dotenvOutput)`). Check call sites.
  - `@sentry/node` 9.47.1 → 10.43.0 — Sentry v10 deprecated some
    integrations and config keys. Check `Sentry.init({...})`. Also pulls
    in `@opentelemetry/instrumentation-http` transitively for HTTP
    instrumentation, which depends on `shimmer` (see below).
  - `style-loader` 3.3.1 → 4.0.0 — default behavior changed for inline
    styles. Likely safe (CSS Modules dominate); verify dev-server still
    HMRs styles correctly.

  **Additional `dependencies` entry required after the `@sentry/node` bump:**

  - `shimmer ^1.2.1`. Sentry v10 transitively requires
    `@opentelemetry/instrumentation@0.57.1`, which lists `shimmer` as a
    regular `dependency` — but yarn 1.22 sometimes fails to install a
    transitive dep when there are multiple nested copies of the parent
    (the project ends up with 4 different `@opentelemetry/instrumentation`
    directories: top-level, plus inside `@fastify/otel`, `@prisma/instrumentation`,
    and `@opentelemetry/instrumentation-http`). The deterministic fix is
    to declare `shimmer` at the top level. Same pattern as the
    `js-cookie` / `invariant` / `redux` additions above. Without this,
    the server fails to boot with
    `Error: Cannot find module 'shimmer'` from
    `server/log.js` → `@sentry/node` → `@opentelemetry/instrumentation`.
- **`devDependencies`.** Take **all** of upstream's CRA-eject build tooling:
  `webpack`, `webpack-dev-server`, `webpack-manifest-plugin`,
  `babel-loader`, `babel-jest`, `babel-plugin-named-asset-import`,
  `case-sensitive-paths-webpack-plugin`, `css-loader`, `style-loader`,
  `mini-css-extract-plugin`, `postcss-loader`, `terser-webpack-plugin`,
  `eslint-webpack-plugin`, `html-webpack-plugin`, `jest`,
  `jest-environment-jsdom`, `react-app-polyfill`, `react-dev-utils` (now
  in-tree), etc. These are no longer transitive — they have to be direct.
- **`eslintConfig`, `babel`, `jest` blocks.** Upstream now relies on
  in-tree configs under `config/`. Take upstream's blocks verbatim.

After resolution, run `yarn install` (do **not** hand-merge `yarn.lock`).
Confirm install completes without warnings about the eject. Confirm
`yarn config-check`, `yarn dev-frontend`, and `yarn dev-backend` all
run successfully before moving on.

### 3.6 New TheLuupe files (created during merge)

Two new TheLuupe-owned files are added during the merge as part of the
Option-γ-inverted gate pattern (§1.1 #4):

#### `src/containers/ListingPage/TheLuupeListingPageGate.js` (new file)

A wrapping component that handles all TheLuupe listing-type-specific
routing/access decisions. Invoked from inside `ListingPageAccessWrapper`
(see immediately below). Receives explicit props from the outer wrapper.

Order of checks inside the gate (matters):

1. **PORTFOLIO redirect** — `if (listingType === LISTING_TYPES.PORTFOLIO) return <NamedRedirect name="ProfilePage" params={{ id: authorId }} search={\`?pub_listingType=portfolio-showcase&pub_listingId=${rawParams.id}\`} />`.
2. **PROFILE redirect** — `if (listingType === LISTING_TYPES.PROFILE) return <NamedRedirect name="ProfilePage" params={{ id: authorId }} />`.
3. **HIDDEN_PRODUCT access gate** — `if (isHiddenProductListing) { const isLuupeAdmin = ...; if (!(isOwnListing || isLuupeAdmin)) return <NamedRedirect name="NoAccessPage" params={{ missingAccessRight: NO_ACCESS_PAGE_FORBIDDEN_LISTING_TYPE }} />; }`.
4. Otherwise, render `children`.

Required props: `currentListing`, `isOwnListing`, `currentUser`,
`rawParams`, `children`.

#### Modification to `src/containers/ListingPage/ListingPageAccessWrapper.js` (~4 lines)

Wrap the final return through the TheLuupe gate, passing the necessary
props derived inside the wrapper:

```jsx
import TheLuupeListingPageGate from './TheLuupeListingPageGate';

// ... existing checks unchanged ...

return (
  <TheLuupeListingPageGate
    currentListing={currentListing}
    isOwnListing={isOwnListing /* derive locally if not already present */}
    currentUser={currentUser}
    rawParams={rawParams}
  >
    <PageComponent
      config={config}
      routeConfiguration={routeConfiguration}
      intl={intl}
      history={history}
      location={location}
      showOwnListingsOnly={hasNoViewingRights}
      {...rest}
    />
  </TheLuupeListingPageGate>
);
```

`isOwnListing` is computed in `getDerivedRenderData` upstream; verify it
can be derived in the wrapper too. If not, derive it locally from
`currentListing.author.id.uuid === currentUser?.id?.uuid`.

`ListingPageAccessWrapper.js` is no longer upstream-pristine after this
change. Future upstream evolutions of this file will conflict on the
final-return block. Acceptable cost per §1.1 #4.

---

## 4. Silent risks (auto-merged)

The auto-stages from the merge include several semantic regressions
that are not flagged by conflict markers. §4.1 and §4.2 are fixed
**in-merge** per §1.1 #7. The remainder are verification steps.

### 4.1 `src/util/sanitize.js` — metadata fields allow-list (defensive, in-merge)

PR #779 added `sanitizeConfiguredMetadata` to `sanitizeUser` and
`sanitizeListing`. The misleading in-file comment claims "only metadata
fields defined in custom field config (assets) are passed through" —
**but the actual function body does not enforce that.** It checks for a
declared field config and sanitises per `schemaType` if found; otherwise
it falls through permissively (text-sanitise for strings, raw for
non-strings). Unknown keys are preserved.

So the immediate breakage I originally framed here (TheLuupe's
Integration-API metadata silently dropped post-merge) **does not happen
today** — TheLuupe's metadata fields fall through the permissive branch
unchanged.

**The allow-list is still added in this merge, but as defensive
future-proofing and explicit policy documentation, not an
immediate-breakage fix.** If upstream ever tightens
`sanitizeConfiguredMetadata` to enforce what the comment claims (drop
unknown keys), TheLuupe stays safe via the allow-list. The
implementation cost is small (~30 lines) and the documentation value is
real.

User metadata keys (11 — none dynamic, since `...newCreatorIds` resolves
to `{ communityId, studioId }` which are already covered):

| Key | Writer(s) | Type |
| --- | --- | --- |
| `brandUsers` | `notifyUserCreated.js` | `Array<UUID>` |
| `membership` | `notifyUserCreated.js`, `notifyUserUpdated.js` | enum |
| `isBrandAdmin` | `notifyUserCreated.js` | boolean |
| `communityId` | `notifyUserCreated.js`, `slackInteractivity.approveCommunityHandler` | string |
| `studioId` | `notifyUserCreated.js`, `slackInteractivity.approveCommunityHandler` | string |
| `sellerStatus` | `notifyUserUpdated.js`, `slackInteractivity.{approve,reject}SellerHandler` | enum (`APPLIED`/`APPROVED`/`WAITLISTED`) |
| `communityStatus` | `notifyUserUpdated.js`, `slackInteractivity.{approve,reject}CommunityHandler` | enum |
| `appliedAt` | `notifyUserUpdated.js` | UTC timestamp string |
| `reviewedAt` | `slackInteractivity.{approve,reject}SellerHandler` | UTC timestamp string |
| `profileListingId` | `slackInteractivity.approveSellerHandler` | UUID string |
| `isLuupeAdmin` | Operator-set in Console (no programmatic write) | boolean |

Listing metadata keys (1):

| Key | Writer | Type |
| --- | --- | --- |
| `creator` | `notifyProductListingCreated.js` | string `"FirstName LastName"` |

Implementation in `src/util/sanitize.js`:

```js
const THELUUPE_ALLOWED_USER_METADATA_KEYS = new Set([
  'brandUsers', 'membership', 'isBrandAdmin', 'communityId', 'studioId',
  'sellerStatus', 'communityStatus', 'appliedAt', 'reviewedAt',
  'profileListingId', 'isLuupeAdmin',
]);

const THELUUPE_ALLOWED_LISTING_METADATA_KEYS = new Set(['creator']);

const isTheLuupeAllowedMetadataKey = (key, entityType) => { /* ... */ };

// sanitizeConfiguredMetadata gains an `entityType` parameter ('user' | 'listing').
// Resolution order inside the reduce:
//   1. If declared in hosted field config → sanitize per schemaType.
//   2. If a known TheLuupe key → pass through, text-sanitize only when string.
//   3. Otherwise → keep upstream's permissive fallthrough (no behaviour change today).
```

Behaviour today: identical to upstream (no key dropped, just text-sanitised
where applicable). The allow-list is the future-proof: if upstream tightens
step 3 to drop unknowns, TheLuupe's keys still survive via step 2.

The pass-through performs minimal type-aware sanitization (apply
`sanitizeText` to strings, leave booleans/numbers/arrays/objects intact)
to retain defence against XSS in user-controlled values, even though
TheLuupe's writers are server-side-controlled.

The allow-list is parameterised by entity type — `sanitizeUser` passes
`'user'`, `sanitizeListing` passes `'listing'`.

When adding a new server-side metadata writer, add the key here too.
A follow-up to add a CI check / lint rule would be valuable (§6 #3).

### 4.2 `src/ducks/marketplaceData.duck.js` — `getListingsById` returns a fresh array (in-merge fix)

PR #829 made `getListingsById` allocate a new array each call (correctness
fix) and added `makeGetListingsByIdSelector` for memoized usage.

**Fix: migrate all 6 TheLuupe consumers in this merge.**

| Caller | Wiring style | Migration |
| --- | --- | --- |
| `SearchPageWithGrid.js` | `connect` (factory mapStateToProps) | Use factory mapStateToProps with `makeGetListingsByIdSelector`. Already in-merge per §3.3 SearchPage. |
| `SearchPageWithMap.js` | `connect` (factory mapStateToProps) | Same. Already in-merge per §3.3 SearchPage. |
| `LandingPage.js` | `connect` | Convert `mapStateToProps` to factory form; instantiate one `makeGetListingsByIdSelector()` per component instance; use it inside the closure passed as `getListingEntitiesById`. |
| `FavoriteListingsPage.js` | `connect` | Same factory-mapStateToProps pattern. The direct `const listings = getListingsById(...)` flows into props via the factory closure now memoized. |
| `CMSPage.js` | `connect` | Same factory-mapStateToProps pattern. |
| `PrivacyPolicyPage.js` | `connect` | Same factory-mapStateToProps pattern. |
| `TermsOfServicePage.js` | `connect` | Same factory-mapStateToProps pattern. |
| `AuthenticationPage.js` | hooks (post-merge per §3.3) | Use `useMemo(makeGetListingsByIdSelector, [])` + `useSelector`. |

Factory mapStateToProps form (Redux-recommended for memoized selectors
under `connect`):

```js
const makeMapStateToProps = () => {
  const getListingsByIdSelector = makeGetListingsByIdSelector();
  return (state, ownProps) => {
    // ... other mapped state ...
    const getListingEntitiesById = listingIds => getListingsByIdSelector(state, listingIds);
    return { /* ... */, getListingEntitiesById };
  };
};
export default connect(makeMapStateToProps, mapDispatchToProps)(Component);
```

This keeps the existing `connect` HOC and avoids a per-page hooks
refactor while correctly memoising the selector per-instance. The 4
LandingPage/CMSPage/PrivacyPolicy/ToS containers can be migrated to
hooks as a separate follow-up if/when desired (§6).

### 4.3 `src/util/configHelpers.js` — listing-field validation tightened (verification)

Upstream added validation for `showFilter`, `showSorting`,
`sortingOrder.{asc,desc}`, `sortingGroup`, plus `getSortOptionsFromListingFields`
and changes to `mergeSortConfig`.

Risk: if any TheLuupe listing-field config (in Sharetribe Console or
in `src/config/configListing.js`) is missing one of these now-validated
keys, the validator may treat it as invalid and the field may be
filtered out of search/sort UIs.

Verification: run `yarn config-check`, then load the search and
edit-listing pages with each TheLuupe listing type after the merge.
Watch for "filtered out" warnings in the console.

**Confirmed in-merge silent-risk fix**: `src/containers/SearchPage/SearchPageWithGrid.js`'s
`creativesLocationField` (the augmented "location" filter shown on
`/s?pub_categoryLevel1=creatives` for `profile-listing`) declared
`filterConfig: { indexForSearch: true, group: 'primary' }` only. Pre-merge,
`groupListingFieldConfigs` gated visibility on
`filterConfig?.indexForSearch === true`. Upstream rewrote that gate to use
`isFilterEnabled(filterConfig)` (in `src/util/search.js`), which **only**
checks `showFilter === true` — the function's doc comment claims a
fallback to `indexForSearch` but the implementation does not. Result: the
creatives location filter silently disappeared from the SRP. **Fix**: add
`showFilter: true` alongside the existing `indexForSearch: true` in the
field's `filterConfig`. Any future TheLuupe listing field that wants to
be both indexed and visible needs both keys.

**Confirmed in-merge silent-risk fix**: `src/containers/SearchPage/SearchPage.shared.js`'s
new shared `createFilterValueChangeHandler` (which replaced
TheLuupe HEAD's per-page `getHandleChangedValueFn`) regressed the
address/bounds handling. Pre-merge, the keyword-search branch was
`keywordsMaybe = { keywords }` and address/bounds were only re-spread
from the URL in the location-search branch (`{ address, bounds }`).
Upstream's rewrite always re-spreads `address, bounds` at the bottom of
the merged-query-params object — clobbering whatever the sidebar
LocationFilter put into `updatedURLParams`. Result: selecting a location
in the creatives LocationFilter became a no-op (URL never updated).
Upstream never hit this because they don't render a LocationFilter inside
keyword-search mode. **Fix**: restore the pre-merge conditional
(`isMainSearchTypeKeywords(config) ? { keywords } : { address, bounds }`)
and drop the always-spread `address, bounds` at the bottom.

### 4.4 `ext/transaction-processes/default-negotiation/templates/.../*-html.html` (post-merge action)

PR #837 renamed an i18n key in one negotiation email:
`NegotiationNewOfferFromRequest.UnitPriceLabel` → `LineTotalForOfferLabel`.

Confirm `LineTotalForOfferLabel` exists in `src/translations/en.json`
(and any localized variants TheLuupe maintains). Then **push the updated
template to the Sharetribe Console** via `sharetribe-cli` after the
merge lands.

### 4.5 `src/containers/CheckoutPage/CheckoutPage.duck.js` (verification)

Auto-merged. Upstream PR #802 added a loader; PR #816 fixed
`pay-and-save-card` return; PR #799 fixed `stripeCustomerFetchError`
initial state. TheLuupe extends this duck with license-deal validation
calls.

Verification: confirm the `licenseDealId` thread (`POST /api/validate-license-deal`)
still flows correctly, and that the new initial state still includes
`stripeCustomerFetchError: null` *after* TheLuupe's overrides.

### 4.6 `src/containers/TransactionPage/TransactionPage.js` (verification)

Auto-merged successfully — both `parse` import and the `licenseDeal`
search-param preservation block survived. Verify by inspection:
`createResourceLocatorString('CheckoutPage', ..., currentSearchParams)`
must still receive `currentSearchParams` (not `{}`). This is a known
TheLuupe-only behavior.

### 4.7 Translation files (verification)

Upstream added/renamed keys for: `shortText` field schema, `helpText`
component, `featured-listings` section, `LineTotalForOfferLabel`,
`InboxSortBy` mobile label, `UserCard` margins, `SocialLoginButtons`
copy, refactored AuthenticationPage messages.

Risk: a TheLuupe-overridden key may have been silently overwritten by
upstream's auto-merge.

Verification: for each of `en.json`, `de.json`, `es.json`, `fr.json`,
diff against `HEAD` and confirm TheLuupe-customized strings (anything
referencing "TheLuupe", "Studio", "Brand", "creative", license deals,
seller approval) survived. Particular attention to:

- `ManageListingCard.finishListingDraft` and
  `ManageListingCard.finishListingDraftLink` keys can be deleted if no
  consumer remains after §3.3 ManageListingCard removes the "Finish
  listing" link.
- `AuthenticationPage.signupSellerWithAuth0` and other TheLuupe-specific
  Auth0 keys must survive.

### 4.8 `Dockerfile`, `cloudbuild.yaml`, `.nvmrc`

These files do not exist upstream — they're TheLuupe-only — and the
naive `git diff HEAD MERGE_HEAD` shows them as "deleted on the upstream
side." They are **safe** because the merge is into HEAD; they remain.

**`Dockerfile` requires a one-line change** as a direct consequence of
the CRA-eject (PR #792). The Dockerfile sets `ENV NODE_ENV=production`
before `RUN yarn install`. In yarn classic, `yarn install` with
`NODE_ENV=production` set skips `devDependencies`. Pre-merge this was
fine because the build was driven by `sharetribe-scripts` (a regular
`dependency`). Post-merge, all build tooling (webpack, babel-loader,
css-loader, postcss-loader, html-webpack-plugin, etc.) is in
`devDependencies` — so `yarn build` would fail. Upstream documents this
in `README.md` (PR #836).

Fix: change `RUN yarn install` → `RUN yarn install --production=false`.

Verify `Dockerfile`'s `yarn build` and `yarn start` still resolve to
working scripts after the `package.json` resolution in §3.5. Test the
production build locally before completing the merge.

### 4.9 `src/containers/AuthenticationPage/AuthenticationPage.helpers.js` (in-merge action)

This new file is staged. Per §3.3 AuthenticationPage, it stays — but
with edits:

- Drop `getHandleSubmitSignup` (no consumer).
- Override `getHandleSubmitConfirm` with the TheLuupe-aware version.

The remaining helpers (`getNonUserFieldParams`, `getExtendedDataMaybe`,
`getAuthInfoFromCookies`, `getAuthErrorFromCookies`) are adopted as-is
from upstream.

### 4.10 New wrapper files (verification before §3.3 work)

All staged as new files; read each before touching its sibling
conflict in §3.3:

- `src/containers/ListingPage/ListingPageAccessWrapper.js` (modified
  per §3.6).
- `src/containers/ListingPage/Notifications/Notifications.js`.
- `src/containers/SearchPage/SearchPageAccessWrapper.js`
  (upstream-pristine — no TheLuupe modification).
- `src/containers/SearchPage/SearchErrors.js`.
- `src/containers/ManageListingsPage/ManageListingCard/{CardMenu,CardThumbnail,PriceInfo}.js`.

---

## 5. Resolution plan (single merge commit, Option α)

The merge is in progress on `core-upgrade/v11.0.2-v1`. The
implementation work resolves all conflicts and lands all in-merge fixes
in the working tree, marks each resolved file with `git add` (or
`git rm` for deletions), then **stops**. The human runs tests, exercises
the app, and runs the final `git commit` themselves.

> **The implementation `git add`s each resolved file** so it's removed
> from the unmerged-paths list (this is standard merge-resolution, not
> staging-for-commit). **The implementation does NOT run `git commit`
> or `git merge --continue`** — those are the human's trigger for
> finalising the merge.

### Stage A — Mechanical resolutions

1. **Delete the orphan ducks** (§3.4):
   `git rm src/containers/PasswordChangePage/PasswordChangePage.duck.js`
   `git rm src/containers/PasswordResetPage/PasswordResetPage.duck.js`
2. **Resolve `package.json`** (§3.5). Verify each dependency add/drop/bump
   per §1.1 #9 (no unnecessary additions, no accidental removals, major
   bumps audited for usage). `git add package.json`. Then regenerate the
   lock file: `git checkout --theirs yarn.lock` (or `rm yarn.lock`),
   `yarn install`, `git add yarn.lock`. Run `yarn config-check` to
   confirm the install is healthy.
3. **Resolve all CSS conflicts** (§3.1, three files).
4. **Resolve the trivial duck conflicts** (`InboxPage.duck`,
   `ContactDetailsPage.duck`, `SearchPage.duck`).
5. **Resolve the server file conflicts** (`apiServer.js`, `index.js`,
   `lineItemHelpers.js`).
6. **Resolve the small JS conflicts** (`SectionBuilder.js`,
   `CheckoutPage.js`, `SortBy/SortBy.js`).

After Stage A, `yarn dev-frontend` and `yarn dev-backend` should both
start. Search and Listing pages will be broken (Stage B addresses this).

### Stage B — In-merge silent-risk fixes

7. **Sanitizer allow-list** (§4.1). Modify `src/util/sanitize.js` to
   add `THELUUPE_ALLOWED_USER_METADATA_KEYS` and
   `THELUUPE_ALLOWED_LISTING_METADATA_KEYS`, and route the allow-list
   check inside `sanitizeConfiguredMetadata` (or in two parameterised
   variants for user vs. listing).
8. **`getListingsById` migration for the 5 connect-based callers
   (LandingPage, FavoriteListingsPage, CMSPage, PrivacyPolicy, ToS)**
   per §4.2. Use the factory mapStateToProps pattern. The two SearchPage
   variants are migrated as part of Stage C step 11.

### Stage C — Page-shape adoptions

9. **ManageListingCard family**: read `CardMenu.js`, `CardThumbnail.js`,
   `PriceInfo.js`, `Overlay.js`, the upstream `DiscardDraftModal/`, and
   the upstream `ManageListingsPage.duck.js` discardDraft cases. Then
   resolve `ManageListingCard.js`, `ManageListingsPage.js`,
   `ManageListingsPage.duck.js` per §3.3. Remove "Finish listing" CTA
   from `<DraftOverlay>`. Drop unused i18n keys per §4.7. Regenerate
   the snapshot test.
10. **SearchPage family**: read `SearchPageAccessWrapper.js`,
    `SearchErrors.js`, the new `SearchPage.shared.js`. Then resolve
    `SearchPageWithGrid.js` and `SearchPageWithMap.js` per §3.3,
    including the factory-mapStateToProps migration to
    `makeGetListingsByIdSelector`.
11. **ListingPage family**: read `ListingPageAccessWrapper.js`,
    `Notifications/Notifications.js`, the new `ListingPage.shared.js`.
    **Create `TheLuupeListingPageGate.js`** per §3.6, then modify
    `ListingPageAccessWrapper.js` minimally to delegate through it.
    Then resolve `ListingPage.shared.js`, `ListingPageCarousel.js`,
    `ListingPageCoverPhoto.js`, `Notifications/ActionBar.js`,
    `CustomListingFields.js`. Delete the old
    `src/containers/ListingPage/ActionBarMaybe.js`.
12. **ProfilePage**: resolve per §3.3.
13. **StripePayoutPage**: resolve per §3.3.
14. **AuthenticationPage**: full rewrite per §3.3:
    - Migrate the wiring to hooks.
    - Delete the `AuthenticationForms/` folder; fold its CSS rules into
      `AuthenticationPage.module.css` (§3.1).
    - Delete the `SocialLoginButtons/` folder.
    - Inline `<SignupBody>` and `<ConfirmIdProviderInfoForm>` in
      `AuthenticationPage.js`.
    - Override `getHandleSubmitConfirm` in `AuthenticationPage.helpers.js`;
      delete `getHandleSubmitSignup`.
    - Migrate this caller's `getListingsById` usage to
      `useMemo(makeGetListingsByIdSelector, [])` + `useSelector`.

### Stage D — Verification (still pre-commit)

15. **Run `yarn format-ci`** — resolve any formatting differences.
16. **Run `yarn test-server`** — must pass.
17. **Run `yarn test`** — expect snapshot updates for ManageListingCard,
    ListingPage, AuthenticationPage. Inspect each snapshot diff before
    accepting.
18. **`configHelpers.js` validation audit** (§4.3). Run `yarn config-check`,
    load search and edit-listing UIs for every TheLuupe listing type.
19. **Translation diff** (§4.7). For each of `en.json`, `de.json`,
    `es.json`, `fr.json`, `git diff HEAD -- src/translations/<lang>.json`
    and confirm no TheLuupe-customized string was overwritten. Drop
    unused keys per §4.7.
20. **Manual smoke (browser):**
    - Sign up via Auth0 (creator + studio-brand path).
    - Browse search (Grid + Map variants); apply filters; switch sort.
      Confirm creatives category triggers `GRID_STYLE_SQUARE` and
      `createdAt` default sort.
    - View a `product-listing`, `hidden-product-listing` (as both an
      owner and a non-admin non-owner — verify the gate),
      `service-listing`, `portfolio-showcase` (verify ProfilePage
      redirect with query params), `profile-listing` (verify ProfilePage
      redirect).
    - Edit a listing — confirm Phototag, Uppy, Transloadit upload still
      work, including required `shortText` if any field uses it.
    - Place an order with a `licenseDeal` in the URL — confirm checkout
      preserves it (§4.6).
    - Place an order without a license deal — confirm Stripe checkout
      loader appears (PR #802).
    - Open the Inbox; confirm `InboxSortBy` mobile layout (PR #839).
    - Open `ManageListingsPage`; confirm cards render as `ul`/`li`,
      out-of-stock cards omit the menu (PR #805), draft cards show the
      `<DraftOverlay>` with **only** a Discard action (no "Finish
      listing"), discard-draft modal still triggers.
    - Confirm the seller approval / community approval Slack flows
      still set `sellerStatus` / `communityStatus` / `studioId` /
      `communityId` and that those values are visible in the user's
      profile after a fetch (validates §4.1).
    - Hit a negotiation transaction; confirm new-offer email renders
      (or trigger via test).

### Stage E — Hand-off

21. Working tree is fully resolved; `git status` shows no `UU` /
    `DU` / `UD` paths and no leftover conflict markers in the diff.
22. **Stop.** Hand off to the human. They run `git commit` (which
    creates the merge commit) when they're ready.

---

## 6. Open decisions (deferred to follow-up specs)

1. **Hooks migration for the 4 closure-pattern containers.** LandingPage,
   CMSPage, PrivacyPolicyPage, TermsOfServicePage stay on `connect`
   after this merge — they only get the factory-mapStateToProps
   memoised-selector treatment for `getListingsById`. A follow-up spec
   can plan their full migration to hooks (drop `connect`,
   `useDispatch`/`useSelector`/`useNavigate`), aligned with how
   AuthenticationPage migrates here.

2. **Drafts retirement.** Drafts are an intermediate state created by
   the multi-step `EditListingWizard` and `EditPortfolioListingWizard`.
   The batch upload flow (`BatchEditListingPage`) does not produce
   drafts. Removing the multi-step wizard entirely (or auto-cleaning
   abandoned drafts) is a real product decision well outside the merge
   scope. This merge keeps `discardDraft` (taken from upstream) and
   removes only the "Finish listing" CTA so drafts are discard-only
   from `ManageListingsPage`.

3. **Sanitizer allow-list governance.** The allow-list in `sanitize.js`
   is static today. As TheLuupe adds new server-side metadata writers,
   developers must remember to extend the allow-list. Consider a
   follow-up to add a CI check or lint rule that scans for new
   `metadata: { ... }` writes and warns if their keys aren't in the
   allow-list.

4. **Shared `canBypassListingAccessGates(currentUser)` helper.** The
   `isLuupeAdmin` admin-bypass pattern exists in 5+ places
   (`ListingPageCarousel`, `ListingPageCoverPhoto`, `CheckoutPage`,
   `transaction.js` x2). After this merge consolidates the listing-page
   gates into `TheLuupeListingPageGate`, a follow-up can extract the
   admin-bypass check into a shared helper.
