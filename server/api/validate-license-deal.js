const { integrationSdkInit } = require('../api-util/scriptManager');
const { getSdk, handleError } = require('../api-util/sdk');

module.exports = async (req, res) => {
  const { licenseDealId, listingId } = req.body;

  if (!licenseDealId || !listingId) {
    return res.status(400).json({
      error: 'missingRequiredParameters',
    });
  }

  try {
    const sdk = getSdk(req, res);
    const currentUserResponse = await sdk.currentUser.show();
    const currentUser = currentUserResponse.data.data;
    const currentUserId = currentUser?.id?.uuid;

    if (!currentUserId) {
      return res.status(401).json({
        error: 'unauthenticatedUser',
      });
    }

    const integrationSdk = integrationSdkInit();
    const result = await integrationSdk.listings.show({ id: listingId });
    const listing = result.data.data;
    const publicData = listing.attributes.publicData || {};
    const privateData = listing.attributes.privateData || {};
    const customLicenseDeals = privateData.customLicenseDeals || [];
    const matchingLicenseDeal = customLicenseDeals.find(licenseDeal => {
      return licenseDeal.id === licenseDealId && licenseDeal.buyerId === currentUserId;
    });
    const now = new Date();
    const expiresAt = new Date(matchingLicenseDeal?.expiresAt);
    const isExpired = now > expiresAt;
    const isPublished = listing.attributes.state === 'published';
    const isProductListing =
      publicData.listingType === 'product-listing' ||
      publicData.listingType === 'hidden-product-listing';

    if (!isPublished) {
      return res.status(400).json({
        error: 'listingNotPublished',
      });
    }
    if (!isProductListing) {
      return res.status(400).json({
        error: 'listingTypeNotProduct',
      });
    }
    if (!matchingLicenseDeal) {
      return res.status(404).json({
        error: 'licenseDealNotFound',
      });
    }
    if (isExpired) {
      return res.status(410).json({
        error: 'licenseDealExpired',
        expiredAt: matchingLicenseDeal.expiresAt,
      });
    }

    res.status(200).json({
      success: true,
      license: {
        id: matchingLicenseDeal.id,
        customPrice: matchingLicenseDeal.customPrice,
        customTerms: matchingLicenseDeal.customTerms,
        generatedAt: matchingLicenseDeal.generatedAt,
        expiresAt: matchingLicenseDeal.expiresAt,
      },
      listing: {
        id: listing.id,
        title: listing.attributes.title,
        price: listing.attributes.price,
      },
    });
  } catch (e) {
    handleError(res, e);
  }
};
