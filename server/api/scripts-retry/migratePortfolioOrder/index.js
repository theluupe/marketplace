const { integrationSdkInit } = require('../../../api-util/scriptManager');

const ALLOWED_STATES = ['published', 'pendingApproval', 'closed', 'draft'];
const LISTING_TYPE = 'portfolio-showcase';
const QUERY_PARAMS = { expand: true };
const LISTINGS_PER_PAGE = 100;

const BASE_QUERY_PARAMS = {
  states: ALLOWED_STATES,
  pub_listingType: LISTING_TYPE,
};

async function processListingsPage({ listings, currentPage, totalPages }) {
  if (!listings.length) {
    console.info(`[migratePortfolioOrder] Page ${currentPage}/${totalPages} empty, stopping.`);
    return { processed: 0, updated: 0, skipped: 0 };
  }
  let processedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  for (const listingResource of listings) {
    try {
      const listingId = listingResource?.id?.uuid;
      const privateOrder = listingResource?.attributes?.privateData?.order;
      const publicOrder = listingResource?.attributes?.publicData?.order;
      const hasPrivateOrder = privateOrder != null;
      const hasPublicOrder = publicOrder != null;

      // Skip listings that already have publicData.order set and no stale privateData.order.
      if (!hasPrivateOrder && hasPublicOrder) {
        skippedCount++;
        processedCount++;
        continue;
      }
      // Nothing to migrate for listings that never had an order set.
      if (!hasPrivateOrder && !hasPublicOrder) {
        skippedCount++;
        processedCount++;
        continue;
      }

      const integrationSdk = integrationSdkInit();
      const updateData = {
        id: listingId,
        privateData: { order: null },
      };
      // Do not overwrite an existing publicData.order value if one is already present.
      if (!hasPublicOrder) {
        updateData.publicData = { order: privateOrder };
      }
      await integrationSdk.listings.update(updateData);
      updatedCount++;
      processedCount++;
      console.info(
        `+ [migratePortfolioOrder] Updated listing ${listingId}. ` +
          `privateData.order: ${privateOrder} -> publicData.order: ${
            hasPublicOrder ? publicOrder : privateOrder
          }`
      );
    } catch (error) {
      console.error(
        `[migratePortfolioOrder] Failed to process listing ${listingResource?.id?.uuid}:`,
        error
      );
      processedCount++;
    }
  }
  const lastListing = listings[listings.length - 1];
  const lastCreatedAt = lastListing?.attributes?.createdAt;
  const lastCreatedAtISO = lastCreatedAt ? lastCreatedAt.toISOString() : 'N/A';
  console.info(
    `[migratePortfolioOrder] Processed page ${currentPage}/${totalPages}. ` +
      `Processed: ${processedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}. ` +
      `Last listing createdAt: ${lastCreatedAtISO}`
  );
  return { processed: processedCount, updated: updatedCount, skipped: skippedCount };
}

async function processListingsByQuery() {
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
      if (page === 1) {
        console.info('\n\n\n*******************************');
        console.info(
          `[migratePortfolioOrder] Starting migration. ` +
            `Total listings: ${meta?.totalItems ?? 'unknown'}, ` +
            `Total pages: ${totalPages} (perPage: ${LISTINGS_PER_PAGE})`
        );
      }
      const pageStats = await processListingsPage({
        listings,
        currentPage: page,
        totalPages,
      });
      totalProcessed += pageStats.processed;
      totalUpdated += pageStats.updated;
      totalSkipped += pageStats.skipped;
      const hasMore = page < totalPages && listings.length > 0;
      console.info(
        `[migratePortfolioOrder] Total stats: Processed: ${totalProcessed}, ` +
          `Updated: ${totalUpdated}, Skipped: ${totalSkipped}`
      );
      if (!hasMore) {
        break;
      }
      page += 1;
    } catch (error) {
      console.error(`[migratePortfolioOrder] Failed processing listings page ${page}:`, error);
      break;
    }
  } while (page <= totalPages);
  console.info(
    `[migratePortfolioOrder] Script completed. Total: Processed: ${totalProcessed}, ` +
      `Updated: ${totalUpdated}, Skipped: ${totalSkipped}`
  );
  console.info('*******************************\n\n\n');
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
      console.warn(`[migratePortfolioOrder] Listing ${listingId} not found.`);
      return;
    }
    await processListingsPage({
      listings,
      currentPage: 1,
      totalPages: 1,
    });
  } catch (error) {
    console.error(`[migratePortfolioOrder] Failed processing listing ${listingId}:`, error);
  }
}

async function runMigratePortfolioOrder({ listingId }) {
  if (listingId) {
    await processSingleListingById(listingId);
  } else {
    await processListingsByQuery();
  }
}

const migratePortfolioOrderScript = (req, res) => {
  const { listingId = null } = req.params;
  if (listingId && typeof listingId !== 'string') {
    return res.status(400).json({ error: 'invalidListingId' });
  }
  res.status(200).json({
    accepted: true,
    listingId: listingId || null,
    message: 'Migrate portfolio order script started',
  });
  runMigratePortfolioOrder({ listingId }).catch(error => {
    console.error('[migratePortfolioOrder] Unexpected error during processing:', error);
  });
};

module.exports = {
  migratePortfolioOrderScript,
};
