const { integrationSdkInit } = require('../../../api-util/scriptManager');
const keywordsForListing = require('./keywordsForListing');
const {
  wait,
  parseKeywords,
  mergeKeywords,
  buildIncludedMap,
  resolveRelationship,
  getImageDownloadUrl,
} = require('./utils');

const ALLOWED_STATES = ['published', 'pendingApproval'];
const LISTING_TYPE = 'product-listing';
const INCLUDE_RELATIONSHIPS = ['author', 'images'];
const QUERY_PARAMS = { expand: true };
const PHOTOTAG_DELAY_MS = 1500;
const LISTINGS_PER_PAGE = 50;

// [NOTE:] Change the 'MAX_CREATED_AT' in case we have more than 100 pages of listings. Work around the pagination limit.
const MAX_CREATED_AT = new Date('2025-10-15T00:00:00.000Z');
// const MAX_CREATED_AT = new Date('2025-02-21T01:34:13.634Z');
const MAX_CREATED_AT_ISO = MAX_CREATED_AT.toISOString();

const BASE_QUERY_PARAMS = {
  states: ALLOWED_STATES,
  pub_listingType: LISTING_TYPE,
  include: INCLUDE_RELATIONSHIPS,
  createdAtEnd: MAX_CREATED_AT_ISO,
};

async function processListing({ listingResource, includedMap }) {
  const listingId = listingResource?.id?.uuid;
  const attributes = listingResource?.attributes || {};
  const { publicData = {}, createdAt } = attributes;
  const createdAtISO = createdAt.toISOString();
  const images = resolveRelationship(listingResource, 'images', includedMap);
  const author = resolveRelationship(listingResource, 'author', includedMap);
  if (!author) {
    console.warn(`[upgradePhototagKeywords] Skipping listing ${listingId} missing author.`);
    return;
  }
  if (!Array.isArray(images) || images.length === 0) {
    console.warn(`[upgradePhototagKeywords] Skipping listing ${listingId} missing images.`);
    return;
  }
  const primaryImage = images[0];
  const { url: imageUrl } = getImageDownloadUrl(primaryImage);
  if (!imageUrl) {
    console.warn(`[upgradePhototagKeywords] Skipping listing ${listingId} missing image URL.`);
    return;
  }
  const originalKeywords = publicData.keywords;
  const existingKeywords = parseKeywords(originalKeywords);
  if (existingKeywords.length > 40) {
    console.warn(
      `- [upgradePhototagKeywords] Skipping listing ${listingId} existing keywords length ${existingKeywords.length}.`
    );
    return;
  }
  try {
    const generatedData = await keywordsForListing({
      author,
      imageUrl,
      filename: publicData?.originalFileName,
      contentType: publicData?.fileType,
    });
    const generatedKeywords = generatedData?.keywords || [];
    if (!generatedKeywords.length && originalKeywords === existingKeywords.join(' ')) {
      console.info(
        `[upgradePhototagKeywords] No keywords returned for listing ${listingId}, skipping update.`
      );
      return;
    }
    const mergedKeywords = mergeKeywords(existingKeywords, generatedKeywords);

    const withKeywordsLogs = false;
    if (withKeywordsLogs) {
      console.warn('\n\n\n*******************************');
      console.warn('\n[processListing] - originalKeywords:', originalKeywords);
      console.warn('\n[processListing] - existingKeywords:', existingKeywords);
      console.warn('\n[processListing] - generatedData:', generatedData);
      console.warn('\n[processListing] - generatedKeywords:', generatedKeywords);
      console.warn('\n[processListing] - mergedKeywords:', mergedKeywords);
      console.warn('\n*******************************\n\n\n');
    }

    try {
      const integrationSdk = integrationSdkInit();
      await integrationSdk.listings.update({
        id: listingId,
        publicData: {
          keywords: mergedKeywords.join(' '),
        },
      });
      console.info(
        `+ [upgradePhototagKeywords] Updated listing ${listingId} (createdAt: ${createdAtISO}).`
      );
    } catch (error) {
      console.error(`[upgradePhototagKeywords] Failed to update listing ${listingId}:`);
      throw error;
    }
  } catch (error) {
    const status = error?.response?.status || 500;
    const message = error?.response?.data || { error: 'phototagRequestFailed' };
    const errorData = { status, message };
    console.error(
      `[upgradePhototagKeywords] Failed to fetch PhotoTag keywords for listing ${listingId}:`,
      errorData
    );
    throw error;
  }
}

async function processListingsPage({ listings, included, currentPage, totalPages }) {
  if (!listings.length) {
    console.info(`[upgradePhototagKeywords] Page ${currentPage}/${totalPages} empty, stopping.`);
    return;
  }
  const includedMap = buildIncludedMap(included);
  let processingPromises = [];
  for (const listingResource of listings) {
    await wait(PHOTOTAG_DELAY_MS);
    processingPromises.push(processListing({ listingResource, includedMap }));
  }
  await Promise.all(processingPromises);
  const lastListing = listings[listings.length - 1];
  const lastCreatedAt = lastListing?.attributes?.createdAt;
  const lastCreatedAtISO = lastCreatedAt.toISOString();
  console.info(
    `[upgradePhototagKeywords] Processed page ${currentPage}/${totalPages}. Last listing createdAt: ${lastCreatedAtISO}`
  );
}

async function processListingsByQuery() {
  // [NOTE:] Change the 'page' in order to start from a custom page after an error.
  let page = 1;
  let totalPages = 1;
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
      const { data, included = [], meta = {} } = response?.data || {};
      const listings = data || [];
      totalPages = meta?.totalPages || page;
      console.warn('\n\n\n*******************************');
      await processListingsPage({
        listings,
        included,
        currentPage: page,
        totalPages,
      });
      const hasMore = page < totalPages && listings.length > 0;
      console.warn('\n-------------\n');
      console.warn('[processListingsByQuery] - meta:', meta);
      console.warn('[processListingsByQuery] - listings.length:', listings.length);
      console.warn('[processListingsByQuery] - hasMore:', hasMore);
      console.warn('*******************************\n\n\n');
      if (!hasMore) {
        break;
      }
      page += 1;
    } catch (error) {
      console.error(`[upgradePhototagKeywords] Failed processing listings page ${page}:`, error);
      break;
    }
  } while (page <= totalPages);
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
    const included = response?.data?.included || [];
    if (!listings) {
      console.warn(`[upgradePhototagKeywords] Listing ${listingId} not found.`);
      return;
    }
    await processListingsPage({
      listings,
      included,
      currentPage: 1,
      totalPages: 1,
    });
  } catch (error) {
    console.error(`[upgradePhototagKeywords] Failed processing listing ${listingId}:`, error);
  }
}

async function runUpgrade({ listingId }) {
  if (listingId) {
    await processSingleListingById(listingId);
  } else {
    await processListingsByQuery();
  }
}

const upgradePhototagKeywordsScript = (req, res) => {
  const { listingId = null } = req.params;
  if (listingId && typeof listingId !== 'string') {
    return res.status(400).json({ error: 'invalidListingId' });
  }
  res.status(200).json({
    accepted: true,
    listingId: listingId || null,
    message: 'Upgrade PhotoTag keywords script started',
  });
  runUpgrade({ listingId }).catch(() => {
    console.error('[upgradePhototagKeywords] Unexpected error during processing');
  });
};

module.exports = {
  upgradePhototagKeywordsScript,
};
