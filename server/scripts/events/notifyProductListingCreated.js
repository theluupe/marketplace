const { generateScript, integrationSdkInit } = require('../../api-util/scriptManager');
const { StorageManagerClient } = require('../../api-util/storageManagerHelper');
const { httpFileUrlToStream } = require('../../api-util/httpHelpers');
const { LISTING_TYPES } = require('../../api-util/metadataHelper');
const {
  slackProductListingsCreatedWorkflow,
  slackProductListingsErrorWorkflow,
} = require('../../api-util/slackHelper');
const { retryAsync, RETRY_STORAGE_DELAY, RETRY_SDK_DELAY } = require('../../api-util/retryAsync');

const SCRIPT_NAME = 'notifyProductListingCreated';
const EVENT_TYPES = 'listing/created';
const RESOURCE_TYPE = 'listing';
const RETRIES = 3;

const filterEvents = event => {
  const { resourceType, eventType, resourceId, resource } = event.attributes;
  if (resourceType !== RESOURCE_TYPE || eventType !== EVENT_TYPES) return false;
  const { attributes: listing, relationships } = resource;
  const userId = relationships?.author?.data?.id?.uuid;
  const listingId = resourceId?.uuid;
  const originalAssetUrl = listing?.privateData?.originalAssetUrl;
  const previewAssetUrl = listing?.privateData?.previewAssetUrl;
  const isProductListing = listing?.publicData?.listingType === LISTING_TYPES.PRODUCT;
  if (!originalAssetUrl || !previewAssetUrl || !userId || !listingId || !isProductListing) {
    return false;
  }
  return true;
};

const storageHandler = async events => {
  const storageManagerClient = new StorageManagerClient();
  const data = events.map(event => {
    const { resourceId, resource } = event.attributes;
    const { attributes: listing, relationships } = resource;
    const userId = relationships?.author?.data?.id?.uuid;
    const listingId = resourceId?.uuid;
    const originalAssetUrl = listing?.privateData?.originalAssetUrl;
    return {
      userId,
      relationId: listingId,
      tempSslUrl: originalAssetUrl,
      metadata: {},
    };
  });
  return await storageManagerClient.uploadOriginalAssets(data);
};

const processEvent = async (integrationSdk, event, originalAssetData) => {
  const { resourceId, resource } = event.attributes;
  const { attributes: listing } = resource;
  const listingId = resourceId?.uuid;
  const previewAssetUrl = listing?.privateData?.previewAssetUrl;
  try {
    const imageStream = await httpFileUrlToStream(previewAssetUrl);
    const promiseFn = async () => {
      const { data: sdkImage } = await integrationSdk.images.upload({ image: imageStream });
      await integrationSdk.listings.update(
        {
          id: listingId,
          privateData: { originalAssetUrl: originalAssetData.source, previewAssetUrl: null },
          images: [sdkImage.data.id],
        },
        { expand: true, include: ['images'] }
      );
    };
    await retryAsync(promiseFn, RETRIES, RETRY_SDK_DELAY);
    return true;
  } catch (error) {
    console.error(
      `[notifyProductListingCreated] Error processing event | listingId: ${listingId} | Error:`,
      error
    );
    return false;
  }
};

const analyzeEventGroup = events => {
  try {
    const parsedEvents = events.filter(filterEvents);
    const totalListings = parsedEvents.length;
    const withValidEvents = !!totalListings;
    if (withValidEvents) {
      slackProductListingsCreatedWorkflow(totalListings);
    }
  } catch (error) {
    console.error('[analyzeEventGroup] Error processing events group:', error);
  }
};

function script() {
  const integrationSdk = integrationSdkInit();
  const queryEvents = args => integrationSdk.events.query({ ...args, eventTypes: EVENT_TYPES });
  const analyzeEvent = (event, originalAssetData) =>
    processEvent(integrationSdk, event, originalAssetData);

  const analyzeEventsBatch = async (events, index) => {
    let successList = [];
    let failList = [];
    const parsedEvents = events.filter(filterEvents);
    try {
      const promiseFn = async () => await storageHandler(parsedEvents);
      const originalAssets = await retryAsync(promiseFn, RETRIES, RETRY_STORAGE_DELAY);
      await Promise.all(
        parsedEvents.map(async event => {
          const { resourceId } = event.attributes;
          const listingId = resourceId?.uuid;
          const originalAssetData = originalAssets.find(asset => asset.id === listingId);
          const success = await analyzeEvent(event, originalAssetData);
          if (success) {
            successList.push(listingId);
          } else {
            failList.push(listingId);
          }
        })
      );
      const withErrors = !!failList.length;
      if (withErrors) {
        slackProductListingsErrorWorkflow(failList);
      }
      const totalEvents = events.length;
      const invalidEvents = totalEvents - parsedEvents.length;
      const result = { success: successList.length, fail: failList.length, invalid: invalidEvents };
      return result;
    } catch (error) {
      const failList = parsedEvents.map(event => {
        const { resourceId } = event.attributes;
        const listingId = resourceId?.uuid;
        return listingId;
      });
      slackProductListingsErrorWorkflow(failList);
      console.warn(
        `[notifyProductListingCreated] - Error storing the originals: ${failList.join(', ')}`
      );
      return;
    }
  };

  generateScript(SCRIPT_NAME, queryEvents, analyzeEventsBatch, analyzeEventGroup);
}

module.exports = script;
