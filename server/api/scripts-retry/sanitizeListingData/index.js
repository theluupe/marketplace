const { integrationSdkInit } = require('../../../api-util/scriptManager');
const { sanitizeText } = require('./utils');

const ALLOWED_STATES = ['published', 'pendingApproval'];
const LISTING_TYPE = 'product-listing';
const QUERY_PARAMS = { expand: true };
const LISTINGS_PER_PAGE = 100;

// [NOTE:] Change the 'MAX_CREATED_AT' in case we have more than 100 pages of listings. Work around the pagination limit.
// const MAX_CREATED_AT = new Date('2026-01-07T23:59:59.999Z');
const MAX_CREATED_AT = new Date('2025-03-03T14:48:51.765Z');
const MAX_CREATED_AT_ISO = MAX_CREATED_AT.toISOString();

const BASE_QUERY_PARAMS = {
  states: ALLOWED_STATES,
  pub_listingType: LISTING_TYPE,
  createdAtEnd: MAX_CREATED_AT_ISO,
};

async function processListingsPage({ listings, currentPage, totalPages }) {
  if (!listings.length) {
    console.info(`[sanitizeListingData] Page ${currentPage}/${totalPages} empty, stopping.`);
    return { processed: 0, updated: 0, skipped: 0 };
  }
  let processedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  for (const listingResource of listings) {
    try {
      const listingId = listingResource?.id?.uuid;
      const originalTitle = listingResource?.attributes?.title || '';
      const originalDescription = listingResource?.attributes?.description || '';
      const originalKeywords = listingResource?.attributes?.publicData?.keywords || '';

      const sanitizedTitle = sanitizeText(originalTitle);
      const sanitizedDescription = sanitizeText(originalDescription);
      const sanitizedKeywords = sanitizeText(originalKeywords);

      const titleChanged = sanitizedTitle !== originalTitle;
      const descriptionChanged = sanitizedDescription !== originalDescription;
      const keywordsChanged = sanitizedKeywords !== originalKeywords;
      const dataChanged = titleChanged || descriptionChanged || keywordsChanged;

      const withKeywordsLogs = false;
      if (withKeywordsLogs && dataChanged) {
        console.warn('\n\n\n*******************************');
        console.warn('\n[processListing] - originalTitle:', originalTitle);
        console.warn('\n[processListing] - sanitizedTitle:', sanitizedTitle);
        console.warn('\n[processListing] - titleChanged:', titleChanged);
        console.warn('\n-------------\n');
        console.warn('\n[processListing] - originalDescription:', originalDescription);
        console.warn('\n[processListing] - sanitizedDescription:', sanitizedDescription);
        console.warn('\n[processListing] - descriptionChanged:', descriptionChanged);
        console.warn('\n-------------\n');
        console.warn('\n[processListing] - originalKeywords:', originalKeywords);
        console.warn('\n[processListing] - sanitizedKeywords:', sanitizedKeywords);
        console.warn('\n[processListing] - keywordsChanged:', keywordsChanged);
        console.warn('\n*******************************\n\n\n');
      }

      if (!dataChanged) {
        skippedCount++;
        processedCount++;
        continue;
      }

      const integrationSdk = integrationSdkInit();
      const updateData = {
        id: listingId,
      };
      if (titleChanged) {
        updateData.title = sanitizedTitle;
      }
      if (descriptionChanged) {
        updateData.description = sanitizedDescription;
      }
      if (keywordsChanged) {
        updateData.publicData = {
          keywords: sanitizedKeywords,
        };
      }
      await integrationSdk.listings.update(updateData);
      updatedCount++;
      processedCount++;

      const changes = [];
      if (titleChanged) changes.push('title');
      if (descriptionChanged) changes.push('description');
      if (keywordsChanged) changes.push('keywords');
      console.info(
        `+ [sanitizeListingData] Updated listing ${listingId}. ` +
          `Changed fields: ${changes.join(', ')}`
      );
    } catch (error) {
      console.error(
        `[sanitizeListingData] Failed to process listing ${listingResource?.id?.uuid}:`,
        error
      );
      processedCount++;
    }
  }
  const lastListing = listings[listings.length - 1];
  const lastCreatedAt = lastListing?.attributes?.createdAt;
  const lastCreatedAtISO = lastCreatedAt ? lastCreatedAt.toISOString() : 'N/A';
  console.info(
    `[sanitizeListingData] Processed page ${currentPage}/${totalPages}. ` +
      `Processed: ${processedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}. ` +
      `Last listing createdAt: ${lastCreatedAtISO}`
  );
  return { processed: processedCount, updated: updatedCount, skipped: skippedCount };
}

async function processListingsByQuery() {
  // [NOTE:] Change the 'page' in order to start from a custom page after an error.
  let page = 1;
  let totalPages = 1;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  do {
    try {
      const integrationSdk = integrationSdkInit();
      const response = await integrationSdk.listings.query(
        {
          page,
          perPage: LISTINGS_PER_PAGE,
          sort: 'createdAt',
          ...BASE_QUERY_PARAMS,
        },
        QUERY_PARAMS
      );
      const { data, meta = {} } = response?.data || {};
      const listings = data || [];
      totalPages = meta?.totalPages || page;
      console.warn('\n\n\n*******************************');
      const pageStats = await processListingsPage({
        listings,
        currentPage: page,
        totalPages,
      });
      totalProcessed += pageStats.processed;
      totalUpdated += pageStats.updated;
      totalSkipped += pageStats.skipped;
      const hasMore = page < totalPages && listings.length > 0;
      console.warn('\n-------------\n');
      console.warn('[processListingsByQuery] - meta:', meta);
      console.warn('[processListingsByQuery] - listings.length:', listings.length);
      console.warn('[processListingsByQuery] - hasMore:', hasMore);
      console.warn(
        `[processListingsByQuery] - Total stats: Processed: ${totalProcessed}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}`
      );
      console.warn('*******************************\n\n\n');
      if (!hasMore) {
        break;
      }
      page += 1;
    } catch (error) {
      console.error(`[sanitizeListingData] Failed processing listings page ${page}:`, error);
      break;
    }
  } while (page <= totalPages);
  console.info(
    `[sanitizeListingData] Script completed. Total: Processed: ${totalProcessed}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}`
  );
}

async function processSingleListingById(listingId) {
  try {
    const integrationSdk = integrationSdkInit();
    const response = await integrationSdk.listings.query(
      {
        ids: [listingId],
        ...BASE_QUERY_PARAMS,
      },
      QUERY_PARAMS
    );
    const listings = response?.data?.data;
    if (!listings || listings.length === 0) {
      console.warn(`[sanitizeListingData] Listing ${listingId} not found.`);
      return;
    }
    await processListingsPage({
      listings,
      currentPage: 1,
      totalPages: 1,
    });
  } catch (error) {
    console.error(`[sanitizeListingData] Failed processing listing ${listingId}:`, error);
  }
}

async function runSanitize({ listingId }) {
  if (listingId) {
    await processSingleListingById(listingId);
  } else {
    await processListingsByQuery();
  }
}

const sanitizeListingDataScript = (req, res) => {
  const { listingId = null } = req.params;
  if (listingId && typeof listingId !== 'string') {
    return res.status(400).json({ error: 'invalidListingId' });
  }
  res.status(200).json({
    accepted: true,
    listingId: listingId || null,
    message: 'Sanitize listing data script started',
  });
  runSanitize({ listingId }).catch(error => {
    console.error('[sanitizeListingData] Unexpected error during processing:', error);
  });
};

module.exports = {
  sanitizeListingDataScript,
};
