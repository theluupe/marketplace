# Marketplace ↔ storage-manager v2 — Integration Spec

> Status: **Proposed** — depends on [storage-manager/spec/v2/storage-manager-v2.md](../../storage-manager/spec/v2/storage-manager-v2.md).
> Owner: marketplace
> Companion: [studio/spec/v2/storage-manager-v2-integration.md](../../studio/spec/v2/storage-manager-v2-integration.md)

---

## 1. Context

### Today (v1)

Marketplace has two storage-manager call sites and one direct GCS call site:

1. `server/scripts/events/notifyProductListingCreated.js` — `POST /assets/marketplace/original` to push the original product image to the marketplace bucket.
2. `server/scripts/events/notifyProductListingRejected.js` — `DELETE /assets` with `{ bucketName, assetPath }` to remove the original when a listing is rejected/deleted.
3. `server/api/digital-product-download.js` — uses `@google-cloud/storage` directly to mint an 8-hour signed URL for the buyer's purchased download.

Plus an upstream Transloadit pipeline that produces preview/thumbnail and uploads them to Sharetribe's image service separately. Storage-manager has no awareness of those.

### Pain points

- `DELETE /assets` requires the caller to **parse** a public GCS URL into `bucketName` + `assetPath`. Brittle (breaks if the URL format changes) and requires the caller to know storage-manager's bucket layout.
- Preview/thumbnail are produced by Transloadit (cost, third-party dependency, no control over output format/quality from our side).
- Marketplace has its own GCS credentials baked in (`GOOGLE_APPLICATION_CREDENTIALS`) just to mint download URLs — duplication of the credentials surface.
- storage-manager's marketplace-residual cleanup worker imports the Sharetribe Flex SDK to enumerate active listings. Marketplace owns that data; storage-manager shouldn't.

### What v2 brings

- Single endpoint to upload + process: `POST /api/v2/uploads` produces `original`, `preview`, `thumbnail` in one async job.
- Identifier-based delete: `DELETE /api/v2/assets/:assetVersionId`.
- Server-side signed URL minting: `POST /api/v2/assets/:assetVersionId/download-url` replaces the direct GCS signing in `digital-product-download.js`.
- Marketplace owns its listing-id list; storage-manager's residual cleanup accepts it as input rather than reaching into Sharetribe.

---

## 2. Affected marketplace surfaces

| Surface | File(s) | Change |
|---|---|---|
| Product listing created | [server/scripts/events/notifyProductListingCreated.js](../server/scripts/events/notifyProductListingCreated.js) | Switch from `uploadOriginalAsset` (v1) to v2 upload + finalize. Persist returned `assetVersionId` on Sharetribe `privateData`. |
| Product listing rejected/deleted | [server/scripts/events/notifyProductListingRejected.js](../server/scripts/events/notifyProductListingRejected.js) | Switch from `deleteAsset(bucketName, assetPath)` to `DELETE /api/v2/assets/:assetVersionId`. |
| Digital product download | [server/api/digital-product-download.js](../server/api/digital-product-download.js) | Replace `@google-cloud/storage` direct signing with `POST /api/v2/assets/:assetVersionId/download-url`. |
| Marketplace residual cleanup orchestration | new server-side helper + cron | Drive storage-manager's v2 marketplace cleanup with a Marketplace-supplied listing-id list. |
| storage-manager helper | [server/api-util/storageManagerHelper.js](../server/api-util/storageManagerHelper.js) | Add v2 client methods alongside v1 for the duration of the cutover. |

---

## 3. Wire format changes

### 3.1 Upload (replaces `uploadOriginalAsset`)

#### v1 (today)

```js
// POST /api/assets/marketplace/original
{
  userId: "sharetribe-author-uuid",
  relationId: "listing-uuid",
  tempSslUrl: "https://temp-ssl-url/file.jpg",
  metadata: { creator: "firstName lastName" }
}
// Response: { id: listingId, source: "https://storage.googleapis.com/.../original.jpg" }
```

#### v2

```js
// POST /api/v2/uploads
{
  surface: "marketplace",
  target: {
    listingId: "listing-uuid",
    ownerId: "sharetribe-author-uuid"
  },
  source: {
    url: "https://temp-ssl-url/file.jpg",
    filename: "file.jpg",
    mimeType: "image/jpeg"
  },
  metadata: {
    creator: "firstName lastName"
  },
  callbacks: {
    onComplete: "https://marketplace.theluupe.com/api/internal/storage-manager/upload-complete",
    onFailed:   "https://marketplace.theluupe.com/api/internal/storage-manager/upload-failed"
  }
}
// 202 Response: {
//   jobId, assetVersionId, source, state: "PENDING"
// }
```

The polling script's `storageHandler` still drives the upload, but the response is now async. Two integration shapes are possible:

- **A. Fire-and-callback.** `notifyProductListingCreated` posts the upload, persists `{ jobId, assetVersionId, source }` on the Sharetribe listing's `privateData` immediately, and lets the storage-manager webhook complete the rest (e.g., setting Sharetribe images via `integrationSdk.images.upload()`). Requires a new internal callback receiver in marketplace.
- **B. Synchronous-feeling poll.** `storageHandler` posts then polls `GET /api/v2/uploads/:jobId` until `READY` or `FAILED`, with a 60s overall timeout. Keeps the existing script flow with minimal change. Worse for very large files (script takes longer) but no callback infrastructure to build.

Recommend **B** for v2.0 (simpler) with **A** as a follow-up if upload duration becomes a problem.

#### Sharetribe `privateData` additions

```jsonc
{
  // existing
  "originalAssetUrl": "https://storage.googleapis.com/marketplace-bucket/v2/marketplace/listing-uuid/{assetVersionId}/original.jpg",
  "originalFileName": "file.jpg",

  // new (v2)
  "storageManagerVersion": 2,
  "assetVersionId": "ckxx…",
  "previewUrl":   "...preview.jpg",   // optional convenience; can be re-derived
  "thumbnailUrl": "...thumbnail.jpg"
}
```

The `storageManagerVersion` discriminator lets all subsequent operations route correctly during the cutover window.

### 3.2 Delete (replaces `deleteAsset(bucketName, assetPath)`)

#### v1 (today)

```js
// DELETE /api/assets
{ bucketName: "MARKETPLACE_ASSETS_BUCKET", assetPath: "author-uuid/listing-uuid/file.jpg" }
```

The marketplace currently extracts `assetPath` by parsing the public URL — see `notifyProductListingRejected.js` lines 100–104.

#### v2

```js
// DELETE /api/v2/assets/:assetVersionId
// (no body)
// 200 Response: { state: "SOFT_DELETED" }
```

If `storageManagerVersion === 1` on the listing's `privateData`, fall back to v1's delete path. The marketplace helper picks the right path:

```js
async function deleteListingAsset(privateData) {
  if (privateData.storageManagerVersion === 2) {
    return storageManagerClient.deleteAssetVersion(privateData.assetVersionId);
  }
  // legacy path
  const { bucketName, assetPath } = parseLegacyUrl(privateData.originalAssetUrl);
  return storageManagerClient.deleteAsset(bucketName, assetPath);
}
```

### 3.3 Buyer download (replaces direct `@google-cloud/storage` signing)

#### v1 (today, in `digital-product-download.js`)

```js
const file = storage.bucket(host).file(pathname.substring(1));
const [signedUrl] = await file.getSignedUrl({
  version: 'v2',
  action: 'read',
  expires: Date.now() + 1000 * 60 * 60 * 8,
  promptSaveAs: filename,
});
```

#### v2

```js
// POST /api/v2/assets/:assetVersionId/download-url
{
  kind: "ORIGINAL",
  expirySeconds: 28800,                    // 8h, parity with current behaviour
  responseDisposition: `attachment; filename="${filename}"`,
  trackDownload: {
    userId: currentUserId,
    kind: "STANDARD",
    format: extension
  }
}
// Response: { url, expiresAt, downloadId }
```

The transaction-state gating (`PURCHASED | COMPLETED | REVIEWED`) and ownership check (current user is transaction customer) **stay in marketplace** — storage-manager isn't aware of transactions. Marketplace simply asks for a signed URL once gating passes.

After this change the marketplace process no longer needs `GOOGLE_APPLICATION_CREDENTIALS` for the download path. Confirm whether other code relies on it before removing the env var.

### 3.4 Residual cleanup (replaces Sharetribe SDK in storage-manager)

The marketplace becomes the source of truth for active listing IDs.

```
Marketplace cron (new)
  1. Page through Sharetribe Flex listings (already implemented in marketplace)
  2. Build the active listing-id set
  3. POST /api/v2/clean-up/marketplace/residual-assets
       body: { activeListingIds: ["...", "..."] }
  4. Poll GET .../status
  5. Optionally email/log the report
```

The Sharetribe SDK + secrets can be removed from storage-manager once this cron is live. The v1 cleanup route stays available until then.

---

## 4. New / changed marketplace endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/internal/storage-manager/upload-complete` | (Optional, only if shape A is chosen) HMAC-verified webhook receiver. |
| POST | `/api/internal/storage-manager/upload-failed` | (Optional, only if shape A is chosen) HMAC-verified webhook receiver. |
| (cron) | (no HTTP) | New scheduled job: `marketplaceResidualCleanup`. Builds the active listing-id list and POSTs to storage-manager. |

---

## 5. `storageManagerHelper.js` changes

Add v2 methods alongside the existing v1 methods. The existing class stays as-is during the cutover; v2 callers use the new methods explicitly.

```js
class StorageManagerClient {
  // v1 — kept for legacy callers
  async uploadOriginalAsset(data) { ... }
  async deleteAsset(bucketName, assetPath) { ... }

  // v2
  async startUpload(payload) {
    // POST /api/v2/uploads
    // returns { jobId, assetVersionId, source, state }
  }
  async waitForUpload(jobId, { timeoutMs = 60_000, pollIntervalMs = 1_500 } = {}) {
    // GET /api/v2/uploads/:jobId until terminal state
  }
  async deleteAssetVersion(assetVersionId) {
    // DELETE /api/v2/assets/:assetVersionId
  }
  async getDownloadUrl(assetVersionId, options) {
    // POST /api/v2/assets/:assetVersionId/download-url
  }
  async startMarketplaceResidualCleanup(activeListingIds) {
    // POST /api/v2/clean-up/marketplace/residual-assets
  }
  async getCleanupStatus(jobKind) {
    // GET /api/v2/clean-up/.../status
  }
}
```

The existing `retryAsync` wrapper, 45s timeout, and `x-api-key` interceptor are kept verbatim.

---

## 6. Cutover plan

1. **Phase 0** — storage-manager v2 mounted, v2 routes available. No marketplace changes yet.
2. **Phase 1** — `storageManagerHelper.js` gets the v2 methods. `notifyProductListingCreated.js` switches to `startUpload` + `waitForUpload`. New listings start landing in `v2/marketplace/...`.
3. **Phase 2** — `notifyProductListingRejected.js` learns the dual delete path (v1 vs v2 based on `storageManagerVersion`). Existing v1 listings continue to delete via the legacy path until they're all gone.
4. **Phase 3** — `digital-product-download.js` switches to `getDownloadUrl`. Direct `@google-cloud/storage` import removed (after confirming nothing else needs it).
5. **Phase 4** — new `marketplaceResidualCleanup` cron deployed. Once a successful run is observed, the Sharetribe SDK is removed from storage-manager (separate PR in storage-manager repo).

Each phase is independently shippable; rollback per phase is just reverting that one PR.

---

## 7. Risks & considerations

- **Async polling timeout.** Sharetribe event-polling scripts are time-budgeted. If `waitForUpload` blocks for >60s on a large image, the script may overshoot its window. Mitigation: shape A (webhook-driven) once warranted; or split the pipeline so storage-manager returns synchronous "original ingested" early and finishes derivatives asynchronously.
- **Discriminator drift.** Listings created during the cutover window have `storageManagerVersion: 2` but their later updates / deletes might be triggered by code paths not yet aware of the discriminator. Audit every code path that reads `originalAssetUrl` before flipping Phase 1.
- **Preview/thumbnail consumers.** Today the Sharetribe listing has its own image (`integrationSdk.images.upload()` from a Transloadit-produced preview). v2 produces its own preview at `v2/marketplace/{listingId}/{assetVersionId}/preview.jpg`. Decide whether to:
  - (a) **Keep** uploading a Sharetribe image as today (storage-manager preview is unused), or
  - (b) **Drop** the Sharetribe image upload and have the marketplace FE consume signed URLs from storage-manager.
  - Recommendation: (a) for v2.0 to avoid frontend changes; revisit in a follow-up.
- **Credentials.** If `digital-product-download.js` was the only consumer of `GOOGLE_APPLICATION_CREDENTIALS`, removing it is a small cleanup. Otherwise leave the env var.
- **Webhook signature validation.** If shape A is chosen, marketplace must implement HMAC-SHA256 validation correctly (constant-time comparison, secret rotation story). Skip until shape A is needed.

---

## 8. Test plan

1. **Helper unit tests** — mock storage-manager responses, verify v2 client methods send correct payloads, parse responses, retry transient failures, and time out properly.
2. **`notifyProductListingCreated` integration test** — end-to-end against a stubbed storage-manager: upload starts, polls to READY, persists `assetVersionId` + URLs on Sharetribe `privateData`.
3. **`notifyProductListingRejected` dual-path test** — listings with `storageManagerVersion: 2` go through `deleteAssetVersion`; listings without it go through legacy `deleteAsset`. No double-delete, no missed delete.
4. **`digital-product-download` test** — gating still enforced; signed URL returned with correct disposition; `trackDownload` produces an `AssetDownload` row.
5. **Residual cleanup cron test** — Sharetribe pagination yields N listing IDs; storage-manager receives them in one POST; status polling reaches READY; report reflects removed files.
6. **Backward-compat regression** — every legacy listing still loads, downloads, and (eventually) deletes correctly. Verify both `storageManagerVersion: 2` and the absence of that field.

---

## 9. Open questions

1. Sync polling vs webhook (shape A vs B)? Recommend B for v2.0.
2. Keep the Sharetribe `images.upload()` step or drop it once v2 produces previews?
3. Default download expiry: keep 8h to match today, or shorten now that the URL is minted on demand from a server-side context?
4. Should `marketplaceResidualCleanup` cron live in marketplace or in a separate ops repo? Currently every other cleanup-style cron lives next to the affected service, suggesting marketplace.
5. Credentials cleanup — confirm `GOOGLE_APPLICATION_CREDENTIALS` has no other consumers in the marketplace process.
