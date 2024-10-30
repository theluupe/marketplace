const { generateScript, integrationSdkInit } = require('../../api-util/scriptManager');
const { StorageManagerClient } = require('../../api-util/storageManagerHelper');
const { httpFileUrlToStream } = require('../../api-util/httpHelpers');

const SCRIPT_NAME = 'notifyProductListingCreated';
const EVENT_TYPES = 'listing/created';
const RESOURCE_TYPE = 'listing';

const processEvent = async (integrationSdk, event, storageManagerClient) => {
  const { resourceType, eventType, resourceId, resource } = event.attributes;
  if (resourceType !== RESOURCE_TYPE || eventType !== EVENT_TYPES) return;

  const { attributes: listing, relationships } = resource;
  const userId = relationships?.author?.data?.id?.uuid;
  const listingId = resourceId?.uuid;
  const imageUrl = listing?.privateData?.transloaditSslUrl;

  if (!imageUrl || !userId || !listingId) return;

  try {
    const originalAssetData = await storageManagerClient.uploadOriginalAsset(
      userId,
      listingId,
      imageUrl
    );
    const imageStream = await httpFileUrlToStream(imageUrl);
    const { data: sdkImage } = await integrationSdk.images.upload({ image: imageStream });

    await integrationSdk.listings.update(
      {
        id: listingId,
        privateData: { originalAssetUrl: originalAssetData.source, transloaditSslUrl: null },
        images: [sdkImage.data.id],
      },
      { expand: true, include: ['images'] }
    );
  } catch (error) {
    console.error('Error processing event:', error);
  }
};

function script() {
  const integrationSdk = integrationSdkInit();
  const storageManagerClient = new StorageManagerClient();

  const queryEvents = args => integrationSdk.events.query({ ...args, eventTypes: EVENT_TYPES });
  const analyzeEvent = event => processEvent(integrationSdk, event, storageManagerClient);

  generateScript(SCRIPT_NAME, queryEvents, analyzeEvent);
}

module.exports = script;
