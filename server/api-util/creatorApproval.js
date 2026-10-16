const { identifyUserEvent, trackManagementAPIEvent } = require('./analytics');
const { COMMUNITY_STATUS, SELLER_STATUS, LISTING_TYPES } = require('./metadataHelper');
const { integrationSdkInit } = require('./scriptManager');
const { StudioManagerClient: SMClient, STUDIO_USER_TYPE } = require('./studioHelper');

// A creator's two approvals, shared by Slack's Approve buttons (slackInteractivity.js) and the
// automatic approval of a creator the webapp already knows (notifyUserCreated.js,
// spec/v0/login-and-registration.md §6.4.2). Each answers the metadata to write.

// Seller: posting allowed, a published profile listing, and the "Approved as a seller" email
// (its Segment event).
async function approveSeller(userId, userAttributes) {
  console.warn(`--- APPROVE SELLER: ${userId}`);
  const integrationSdk = integrationSdkInit();
  const reviewedAt = new Date();
  await integrationSdk.users.updatePermissions({
    id: userId,
    postListings: 'permission/allow',
  });
  const { profile, email } = userAttributes;
  const { creativeSpecialty } = profile.publicData || {};
  const { location } = profile.privateData || {};
  const { firstName, lastName, displayName } = profile;
  const listingResponse = await integrationSdk.listings.create(
    {
      authorId: userId,
      title: `${firstName} ${lastName} ${displayName}`,
      description: '',
      state: 'published',
      geolocation: location?.geolocation,
      publicData: {
        location: {
          address: location?.address,
          building: location?.building,
        },
        listingType: LISTING_TYPES.PROFILE,
        categoryLevel1: 'creatives',
        creativeSpecialty,
        // DEFAULT VALUES
        transactionProcessAlias: 'default-inquiry/release-1',
        unitType: 'inquiry',
      },
    },
    { expand: true }
  );
  const eventUser = { id: userId, email };
  const eventTraits = {
    type: 'CREATOR',
    hasProductListings: 'NO',
    sellerStatus: SELLER_STATUS.APPROVED,
  };
  identifyUserEvent(eventUser, eventTraits);
  trackManagementAPIEvent('NEW_CREATOR | MARKET_SELLER - Approved', eventUser);
  const profileListing = listingResponse.data.data;
  const profileListingId = profileListing?.id?.uuid;
  const metadata = {
    profileListingId,
    sellerStatus: SELLER_STATUS.APPROVED,
    reviewedAt: reviewedAt.toUTCString(),
  };
  return metadata;
}

// Community: the webapp's creator (`POST /creator`; for one it already knows, it only saves the
// Marketplace id and answers its ids). null when the webapp fails: writing APPROVED then left a
// creator approved with no webapp account, and nobody was told
// (spec/v0/login-and-registration.md §3.6.3).
async function approveCommunity(userId, userAttributes) {
  console.warn(`--- APPROVE COMMUNITY: ${userId}`);
  const { profile, email, identityProviders } = userAttributes;
  // A missing list is an empty one: `.join` on it crashed the approval
  // (spec/v0/login-and-registration.md §3.6.4).
  const { creativeSpecialty = [] } = profile.publicData || {};
  const { location } = profile.privateData || {};
  const { firstName, lastName } = profile;
  const studioManagerClient = new SMClient();
  const { communityId, studioId } = await studioManagerClient.studioCreatorInit({
    attributes: {
      creativeSpecialty: creativeSpecialty.join(', '),
      location: location?.address,
    },
    user: {
      email,
      firstName,
      lastName,
      providerId: identityProviders[0].userId,
      marketId: userId,
      type: STUDIO_USER_TYPE.CREATOR,
    },
  });
  if (!communityId || !studioId) {
    return null;
  }
  return {
    communityId,
    studioId,
    communityStatus: COMMUNITY_STATUS.APPROVED,
  };
}

module.exports = { approveCommunity, approveSeller };
