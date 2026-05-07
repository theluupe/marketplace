# Disable Discount Coupons (Voucherify Removal)

## 1. Overview

The marketplace currently exposes a discount-coupon feature backed by [Voucherify](https://voucherify.io/). This spec removes that feature in preparation for a future, in-house coupon implementation that will not depend on Voucherify.

The plan is **removal, not feature-flagging**. A disabled-but-reachable Voucherify integration would rot in place, and the future implementation is expected to use a different validation contract, redemption model, and possibly different discount shapes (fixed-amount, free-shipping, multi-code stacking). It is cleaner to delete now and reintroduce later than to maintain dormant code.

### 1.1 Strategic decisions

The following decisions were agreed upon before drafting this spec and shape every section below:

1. **Remove, do not feature-flag.** No env-var toggle, no dormant code path. The buyer-facing entry point disappears entirely.
2. **Preserve historical-transaction display.** Past orders that already have a `line-item/voucher-discount` line item embedded in their transaction history must continue to render correctly in receipts and order breakdowns. The display path stays; only the creation path is removed.
3. **No DB migration needed.** Coupon codes lived in Voucherify, not in our database. Existing transactions retain their embedded line items and protected-data redemption records as historical artifacts; nothing to migrate.

---

## 2. Files to Remove

All edits below land in a **single PR, single commit**. Order within the diff doesn't matter to the final state.

### 2.1 Voucherify SDK integration

**Delete file:** `server/api-util/voucherifyHelper.js`

This is a pure Voucherify SDK wrapper (`getCustomer`, `validateVoucherForUser`, `redeemVoucherForUser`). Its API surface is Voucherify-shaped and will not be reused by the future implementation.

**`package.json`** — remove the `@voucherify/sdk` dependency:

```diff
-    "@voucherify/sdk": "^2.9.2",
```

Run `yarn install` after the change to update `yarn.lock`.

**Environment variables** — remove from any deployment config (Cloud Run, GitHub secrets, local `.env`):

```
VOUCHERIFY_API_URL
VOUCHERIFY_APPLICATION_ID
VOUCHERIFY_SECRET_KEY
```

These are not present in the committed `.env-template` / `.env.development` / `.env.production` / `.env.test` files, so no repo file needs editing — but they must be removed from any environment where they are set. Confirm with the deploy operator before completing.

---

### 2.2 Validation API endpoint

**Delete file:** `server/api/validate-voucher.js`

**Edit `server/apiRouter.js`** — remove two lines:

```diff
-const validateVoucher = require('./api/validate-voucher');
```

```diff
-router.post('/validate-voucher', validateVoucher);
```

(Lines 49 and 110 in the current file.)

---

### 2.3 Redemption hook in transaction finalization

**Edit `server/api/initiate-privileged.js`**

Remove the import (line 5) and the redemption call inside the third `.then()` (lines 114–125). The `additionalProtectedData` object should retain `licenseDealMaybe` only.

```diff
-const { redeemVoucherForUser } = require('../api-util/voucherifyHelper');
```

```diff
     .then(async ({ processAlias, orderData }) => {
       const listingId = listing.id.uuid;
       const licenseDealId = orderData?.licenseDealId;
-      const voucherCode = orderData?.voucherCode;
       const licenseDeal =
         !isSpeculative && (await hasLicenseDeal(listingId, licenseDealId, currentUserId));
-      const voucherRedemption =
-        !isSpeculative && (await redeemVoucherForUser(currentUser, voucherCode, listingId));
       const licenseDealMaybe = licenseDeal ? { licenseDeal } : {};
-      const voucherRedemptionMaybe = voucherRedemption
-        ? { voucherRedemption: voucherRedemption.redemption }
-        : {};
       const additionalProtectedData = {
         ...licenseDealMaybe,
-        ...voucherRedemptionMaybe,
       };
```

---

### 2.4 Server-side line-item generation

**Edit `server/api-util/lineItemHelpers.js`**

Remove four exports and the import:

- Line 9: `const { validateVoucherForUser } = require('./voucherifyHelper');` — remove.
- Lines 383–400: `exports.validateVoucher` — remove entirely.
- Lines 402–404: `exports.getDiscount` — remove entirely. After this PR it would have zero call sites. Per the codebase's "remove dead code rather than commenting it out" rule (CLAUDE.md § Code quality), it goes too. The clamp invariant it encoded is captured in §6 bullet 5 as an explicit expression for the future implementation to reuse.
- Lines 406–427: `exports.getVoucherDiscountLineItem` — remove entirely.

In `getProviderCommissionMaybe` (around lines 479–512), simplify the voucher-aware branches back to the no-discount path:

```diff
-  const voucherDiscountMaybe = this.getVoucherDiscountLineItem(
-    voucherData,
-    baseLineItemsForCommission,
-    providerCommission
-  );
-  const voucherDiscountPercentage =
-    !voucherData || !voucherData.isValid
-      ? 0
-      : this.getDiscount(voucherData?.discount?.percent_off, providerCommission.percentage);
-
   // Note: extraLineItems for product selling (aka shipping fee)
   // is not included in either customer or provider commission calculation.

   // The provider commission is what the provider pays for the transaction, and
   // it is the subtracted from the baseLineItemsForCommission price to get the provider payout:
   // orderPrice - providerCommission = providerPayout
   return useMinimumCommission
     ? [
         {
           code: 'line-item/provider-commission',
           unitPrice: new Money(providerCommission?.minimum_amount, currency),
           quantity: getNegation(1),
           includeFor: ['provider'],
         },
       ]
     : [
         {
           code: 'line-item/provider-commission',
           unitPrice: totalMoneyIn,
-          percentage: getNegation(providerCommission.percentage - voucherDiscountPercentage),
+          percentage: getNegation(providerCommission.percentage),
           includeFor: ['provider'],
         },
-        ...voucherDiscountMaybe,
       ];
```

The `voucherData` parameter on `getProviderCommissionMaybe` becomes unused — drop it from the signature.

**Edit `server/api-util/lineItems.js`**

Remove voucher extraction and validation (lines 7, 237, 243, 255 region):

```diff
 const {
   ...
-  validateVoucher,
   ...
 } = require('./lineItemHelpers');
```

```diff
   const listingId = listing.id.uuid;
   const licenseDealId = orderData?.licenseDealId;
-  const voucherCode = orderData?.voucherCode;
   const licenseDeal = await hasLicenseDeal(listingId, licenseDealId, currentUserId);
   const licenseUpgradeLineItem = getLicenseUpgradeLineItem(licenseDeal, currency);

-  // Calculate the base line items that should be included in commission calculations WITHOUT voucher discount
   const baseLineItemsForCommission = [order, ...licenseUpgradeLineItem];
-  const voucherData = await validateVoucher(currentUserId, voucherCode);
```

Then update the `getProviderCommissionMaybe` call to drop the `voucherData` argument:

```diff
   const providerCommissionMaybe = getProviderCommissionMaybe(
     providerCommission,
     baseLineItemsForCommission,
-    currency,
-    voucherData
+    currency
   );
```

Update the comment on line 267 to drop "voucher discounts" from the listed line-item ordering.

---

### 2.5 Buyer UI

**Delete directory:** `src/components/FieldVoucherInput/`

Contains `FieldVoucherInput.js` and `FieldVoucherInput.module.css`.

**Edit `src/components/index.js`** — remove the barrel export (line 117):

```diff
-export { default as FieldVoucherInput } from './FieldVoucherInput/FieldVoucherInput';
```

**Edit `src/components/OrderPanel/ProductOrderForm/ProductOrderForm.js`**

Remove the import (line 19), the prop (line 47), the JSX block (lines 339–346), the recalc trigger logic (lines 165, 189, 192–194, 204, 209), and the initial-value seeding (line 440). Specifically:

```diff
 import {
   ...
-  FieldVoucherInput,
   ...
 } from '../../../components';
```

```diff
   const {
     ...
-    voucherCode,
     ...
   } = props;
```

```diff
-    const voucherCodeMaybe = voucherCode ? { voucherCode } : {};
     const orderData = {
       ...stockReservationQuantityMaybe,
       ...deliveryMethodMaybe,
-      ...voucherCodeMaybe,
       ...
     };
```

```diff
     const { quantity, deliveryMethod, isVoucherApplied, voucherCode } = formValues.values;
     const quantityChanged = quantity !== currentValues.quantity;
     const deliveryMethodChanged = deliveryMethod !== currentValues.deliveryMethod;
-    const appliedVoucherChanged = isVoucherApplied !== currentValues.isVoucherApplied;
-    const shouldRecalculate = quantityChanged || deliveryMethodChanged || appliedVoucherChanged;
-    const includeVoucherCode = isVoucherApplied && voucherCode;
+    const shouldRecalculate = quantityChanged || deliveryMethodChanged;
```

(Trim the destructure to drop `isVoucherApplied` and `voucherCode` once unused, and remove the spreads of `includeVoucherCode` and `isVoucherApplied` from the orderData/setCurrentValues calls.)

```diff
       {!withNoPaymentPurchase && (
-        <FieldVoucherInput
-          form={formApi}
-          formId={formId}
-          listingId={listingId.uuid}
-          isLoggedIn={isLoggedIn}
-        />
       )}
```

The whole `{!withNoPaymentPurchase && (...)}` block becomes empty — remove the conditional wrapper too.

```diff
-  const initialValues = { ...quantityMaybe, ...deliveryMethodMaybe, isVoucherApplied: false };
+  const initialValues = { ...quantityMaybe, ...deliveryMethodMaybe };
```

After these edits, search the file once more for `voucher` / `Voucher` to confirm no stragglers remain.

---

### 2.6 Checkout containers

**Edit `src/containers/CheckoutPage/CheckoutPageWithPayment.js`**

Lines 122–123 and 168 — remove `voucherCode` extraction and spread:

```diff
-  const voucherCode = pageData.orderData?.voucherCode;
-  const voucherCodeMaybe = voucherCode ? { voucherCode } : {};
```

```diff
   const orderParams = {
     ...
-    ...voucherCodeMaybe,
     ...
   };
```

**Edit `src/containers/CheckoutPage/CheckoutPageWithoutPayment.js`**

Lines 117–118 and 151 — same pattern, same edits.

---

### 2.7 Frontend API client

**Edit `src/util/api.js`** — remove the client function (lines 167–169):

```diff
-export const validateVoucher = body => {
-  return post(`/api/validate-voucher`, body);
-};
```

Search the codebase for remaining `validateVoucher` imports from `src/util/api.js` and confirm none exist after the UI deletions above.

---

### 2.8 i18n strings (input UI only)

**Edit `src/translations/en.json`** — remove the four `FieldVoucherInput.*` keys (lines 551–554):

```diff
-  "FieldVoucherInput.appliedVoucher": "APPLIED",
-  "FieldVoucherInput.label": "Have a coupon code?",
-  "FieldVoucherInput.loginText": "Log in to apply a discount code!",
-  "FieldVoucherInput.placeholder": "Enter discount code",
```

**Keep** `OrderBreakdown.voucherDiscount` (line 864) — see §3.

Confirmed via grep — no voucher keys exist in `de.json`, `es.json`, or `fr.json`. No edits to those locale files are needed.

---

### 2.9 Email templates (no-Stripe — dead voucher block)

**Edit `ext/custom-transaction-processes/default-purchase-no-stripe/templates/purchase-new-order/purchase-new-order-html.html`**

**Edit `ext/custom-transaction-processes/default-purchase-no-stripe/templates/purchase-order-receipt/purchase-order-receipt-html.html`**

Both files contain a Handlebars block that renders a row when `code === "line-item/voucher-discount"`:

```hbs
{{#eq "line-item/voucher-discount" code}}
   ...
   <p>{{t "PurchaseNewOrder.VoucherDiscountLabel" "Voucher discount"}}</p>
{{/eq}}
```

Per §6 bullet 6 (vouchers are Stripe-only and have always been Stripe-only), this block is dead in the no-Stripe templates — it was copy-pasted from the Stripe templates and never had a code path that produced a `line-item/voucher-discount` line item. Remove the block in both files, including the surrounding `{{else}}`/`{{/eq}}` chain glue so the remaining conditional structure stays syntactically valid.

**Do NOT modify** the equivalent block in the `default-purchase` (Stripe) templates — those are preserved untouched for historical-transaction rendering. See §3.

**Operational:** these template files are not just repo artifacts — they must be pushed to Sharetribe Console using the team's flex-cli equivalent for the change to take effect in production. See §8.3.

---

## 3. Files to Preserve (Historical Compatibility)

These files stay untouched. Their job is to render `line-item/voucher-discount` line items that already exist in completed transactions. Without them, historical receipts and order breakdowns would lose the discount row.

| File | Reason to keep |
|---|---|
| `src/util/types.js` (`LINE_ITEM_VOUCHER_DISCOUNT` constant, lines 409 and 424) | Identifier used by historical line items |
| `src/components/OrderBreakdown/LineItemVoucherDiscount.js` | Renders the discount row in historical breakdowns |
| `src/components/OrderBreakdown/OrderBreakdown.js` (import line 34, render line 122) | Wires the renderer into the breakdown |
| `src/translations/en.json` — `OrderBreakdown.voucherDiscount` (line 864) | Label shown by `LineItemVoucherDiscount` |
| `ext/email-texts.json` — `PurchaseNewOrder.VoucherDiscountLabel` (line 128), `PurchaseOrderReceipt.VoucherDiscountLabel` (line 222) | Receipt-email labels for historical orders |
| `ext/custom-transaction-processes/default-purchase/templates/purchase-new-order/purchase-new-order-html.html` | Voucher Handlebars block preserved untouched — historical Stripe new-order emails re-render with the discount row |
| `ext/custom-transaction-processes/default-purchase/templates/purchase-order-receipt/purchase-order-receipt-html.html` | Voucher Handlebars block preserved untouched — historical Stripe receipts re-render with the discount row |

---

## 4. Documentation Updates

### 4.1 `CLAUDE.md`

Remove the "Vouchers / discounts" section under "TheLuupe-specific features":

```diff
-### Vouchers / discounts
-
-Powered by [Voucherify](https://voucherify.io/). `POST /api/validate-voucher` gets-or-creates a Voucherify customer, validates the code, and returns discount metadata. Only percentage discounts (`APPLY_TO_ORDER`) are supported.
-
```

No replacement section. The feature is gone; future maintainers reading CLAUDE.md should see no mention of it until a new implementation lands.

### 4.2 `TL_CHANGELOG.md`

Add a new top-of-file entry noting the removal. Existing references in older entries (lines 63–65, 97) are historical record and should remain unmodified.

```markdown
## [Coupon Feature Removal] — 2026-05-07

- Removed the Voucherify-backed discount-coupon feature in preparation for a future in-house implementation.
- Buyer-facing input, validation endpoint, redemption hook, and SDK dependency have all been deleted.
- Cleaned dead voucher Handlebars block from `default-purchase-no-stripe` email templates (always dead — vouchers were Stripe-only).
- Historical transactions retain their embedded `line-item/voucher-discount` line items; the Stripe email templates and frontend renderer are preserved so past receipts continue to display correctly.
- Future-implementation guardrails (Stripe-only, no stacking with license deals, no refund reversal, clamp invariant) are tracked in `spec/disable-coupons.md` §6.
```

---

## 5. Tests

A repo-wide search for `voucher` and `coupon` under `*.test.js` (excluding `node_modules`) returns zero matches. No test files need to be modified or removed.

After the changes above, run:

```bash
yarn test-server
yarn test
yarn format-ci
```

CI must remain green.

---

## 6. Notes for the Future Implementation

When the in-house coupon feature is added later, capture these decisions in its design doc up front. They are not assumptions to inherit silently from the Voucherify code. Bullets 6–8 below were settled during the design grilling for this spec and should be preserved as hard constraints unless the future spec deliberately revisits them with a documented rationale.

1. **Who funds the discount.** The Voucherify implementation took the discount entirely out of platform commission and capped the discount percentage at the commission percentage. If the new implementation wants seller-funded discounts, fixed-amount discounts, or discounts that can exceed commission, the line-item math is materially different from what was here. Decide explicitly.
2. **Atomicity of validation and redemption.** The Voucherify flow validated twice (input blur, recalc) and redeemed once at finalization, with no lock between the steps. A custom implementation on our own database can — and should — make redemption transactional with the transaction state transition. Single-use codes need this guarantee or they will leak.
3. **Code shape.** Voucherify's customer-keyed model assumed every code was tied to a Voucherify customer record. A simpler schema (codes that aren't tied to a specific user, or are tied to a brand or campaign) is worth considering.
4. **Line-item code reuse.** If the new implementation produces a percentage discount applied to the order, reusing the existing `line-item/voucher-discount` code gives historical and new transactions a unified rendering path for free. **Caveat:** if you reuse the line-item code, you must also commit to the same funding model as bullet 1 (discount comes out of platform commission, capped at commission percentage). A different funding model with the same line-item code creates silent semantic drift across historical and new transactions, which will mislead financial reporting. If the new shape is materially different (fixed-amount, multiple stackable codes, per-listing rather than per-order, or a different funding model), pick a fresh line-item code rather than overloading the existing one. Either way, the existing renderer in `LineItemVoucherDiscount.js` should not be modified to handle a new shape — add a new component instead.
5. **Discount clamp invariant.** The discount percentage must not exceed the platform commission percentage. Implement as `Math.max(0, Math.min(discountPct, commissionPct))` at line-item generation time. The original `getDiscount` helper that encoded this invariant is deleted in this PR per the codebase's "no dead code" rule (CLAUDE.md § Code quality); the future implementation should re-implement the clamp inline or in a freshly named helper specific to its context.
6. **Eligible transaction processes (Stripe-only).** The Voucherify implementation only rendered the coupon input on Stripe-payment checkouts (`default-purchase`); off-platform-payment checkouts (`default-purchase-no-stripe`) had no voucher field. **This restriction must be preserved by the future implementation** — off-platform-payment checkouts have no actual payment to discount, so they cannot meaningfully support coupons. The corresponding email templates for `default-purchase-no-stripe` are stripped of voucher rendering in this PR (§2.9), reinforcing the invariant in the email layer too.
7. **No stacking with license deals.** The Voucherify implementation processed both `licenseDealId` and `voucherCode` independently in `lineItems.js` and allowed the discounts to compound on the same transaction — likely an accident, since license deals are 1:1 negotiated price concessions and coupons are broadcast discounts. **The future implementation should reject coupon codes on transactions with an active license deal**, or explicitly choose to allow stacking with a documented business rationale. Default position: reject.
8. **No reversal of redemptions on refund or cancel.** The Voucherify implementation did not reverse a redemption when its transaction was later refunded or canceled. **The future implementation deliberately inherits this behavior** — once a code is redeemed, the redemption stays counted, even if the transaction is later refunded. This is a known leak (single-use codes get burned on refunded orders) and is accepted, not fixed, by deliberate choice. If business need changes, revisit then.

---

## 7. Summary Table

| File | Action |
|---|---|
| `server/api-util/voucherifyHelper.js` | **Delete** |
| `server/api/validate-voucher.js` | **Delete** |
| `src/components/FieldVoucherInput/` (directory) | **Delete** |
| `package.json` | Remove `@voucherify/sdk` dependency |
| `server/apiRouter.js` | Remove import + route registration |
| `server/api/initiate-privileged.js` | Remove redemption call + protected-data spread |
| `server/api-util/lineItems.js` | Remove voucher code extraction, validation call, and `voucherData` arg |
| `server/api-util/lineItemHelpers.js` | Remove `validateVoucher`, `getDiscount`, and `getVoucherDiscountLineItem` exports + voucher branches in `getProviderCommissionMaybe`. |
| `src/components/index.js` | Remove `FieldVoucherInput` barrel export |
| `src/components/OrderPanel/ProductOrderForm/ProductOrderForm.js` | Remove import, prop, JSX block, recalc logic, initial-value seeding |
| `src/containers/CheckoutPage/CheckoutPageWithPayment.js` | Remove `voucherCode` extraction + orderData spread |
| `src/containers/CheckoutPage/CheckoutPageWithoutPayment.js` | Remove `voucherCode` extraction + orderData spread |
| `src/util/api.js` | Remove `validateVoucher` client function |
| `src/translations/en.json` | Remove `FieldVoucherInput.*` keys (4). **Keep** `OrderBreakdown.voucherDiscount` |
| `src/util/types.js` | **Keep** (`LINE_ITEM_VOUCHER_DISCOUNT`) |
| `src/components/OrderBreakdown/LineItemVoucherDiscount.js` | **Keep** |
| `src/components/OrderBreakdown/OrderBreakdown.js` | **Keep** |
| `ext/email-texts.json` | **Keep** (both `*.VoucherDiscountLabel` keys) |
| `ext/custom-transaction-processes/default-purchase-no-stripe/templates/.../purchase-new-order-html.html` | Remove dead `line-item/voucher-discount` Handlebars block (always dead — vouchers Stripe-only) |
| `ext/custom-transaction-processes/default-purchase-no-stripe/templates/.../purchase-order-receipt-html.html` | Remove dead `line-item/voucher-discount` Handlebars block (always dead — vouchers Stripe-only) |
| `ext/custom-transaction-processes/default-purchase/templates/...` | **Keep** Stripe email templates untouched — historical receipts re-render correctly |
| `CLAUDE.md` | Remove "Vouchers / discounts" section |
| `TL_CHANGELOG.md` | Add removal entry |
| Deployment config | Remove `VOUCHERIFY_API_URL`, `VOUCHERIFY_APPLICATION_ID`, `VOUCHERIFY_SECRET_KEY` |

---

## 8. Verification Plan

### 8.1 Static checks

- `grep -rni "voucher\|coupon\|voucherify" src server` returns only the preserved references listed in §3 (constant in `types.js`, `LineItemVoucherDiscount.js`, `OrderBreakdown.js` import + render, `getDiscount` helper, `OrderBreakdown.voucherDiscount` key, `*.VoucherDiscountLabel` keys).
- `grep -rni "voucherify" .` (excluding `node_modules`, `yarn.lock` if needed) returns nothing.
- `yarn install` completes without `@voucherify/sdk` in `yarn.lock`.
- `yarn format-ci` passes.
- `yarn test-server` and `yarn test` pass.

### 8.2 Runtime smoke tests

| Scenario | Expected |
|---|---|
| **New product checkout (with Stripe)** | Order panel has no coupon input. Checkout completes. No `line-item/voucher-discount` in the resulting transaction. |
| **New product checkout (without Stripe)** | Same — no coupon input rendered. Off-platform checkout completes. |
| **Order breakdown for a historical transaction that had a voucher applied** | Breakdown still shows the "Discount" row with the historical amount, sourced from the persisted line item. Email receipt for that historical transaction (re-rendered) still shows "Voucher discount". |
| **Server logs on checkout** | No outbound Voucherify HTTP calls. No `Voucherify validation error` messages. |
| **`POST /api/validate-voucher`** | Returns 404 (route deleted). |

### 8.3 Deployment verification

- After deploy, confirm `VOUCHERIFY_*` env vars are removed from the runtime environment.
- Confirm the Voucherify dashboard shows no new validation or redemption requests from production traffic.
- Push the modified `default-purchase-no-stripe` email templates (§2.9) to Sharetribe Console using the team's flex-cli equivalent. The Stripe templates (`default-purchase`) are unchanged but should be re-pushed if the team's normal workflow re-pushes the whole template set as a unit.

---

## 9. What Does NOT Change

- Stripe integration, transaction processes, license deals, Phototag, Auth0, Slack, Studio Manager, referral program — unmodified.
- Order-breakdown rendering of any other line-item type.
- Buyer/Seller/Admin role logic.
- Existing transactions — no migration, no protected-data rewrites. The `protectedData.voucherRedemption` field on historical transactions remains as dead historical data; no code reads it (verified via grep), so leaving it in place costs nothing and avoids the risk of mutating closed transactions.
- The two `default-purchase` (Stripe) email templates and their voucher Handlebars blocks (§3).
