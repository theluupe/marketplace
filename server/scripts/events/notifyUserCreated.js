const { identifyUserEvent, trackManagementAPIEvent } = require('../../api-util/analytics');
const { updateAuth0User } = require('../../api-util/auth0Helper');
const { approveCommunity, approveSeller } = require('../../api-util/creatorApproval');
const {
  USER_TYPES,
  COMMUNITY_STATUS,
  SELLER_STATUS,
  SELLER_MEMBERSHIP_TYPES,
} = require('../../api-util/metadataHelper');
const { ReferralAPIManagerClient: RAMClient } = require('../../api-util/referralManager');
const { integrationSdkInit, generateScript } = require('../../api-util/scriptManager');
const {
  slackSellerValidationWorkflow,
  slackUserCreatedErrorWorkflow,
} = require('../../api-util/slackHelper');
const { STUDIO_USER_TYPE } = require('../../api-util/studioHelper');
const { lookUpWebappUser } = require('../../api/auth/webappSignup');

const SCRIPT_NAME = 'notifyUserCreated';
const EVENT_TYPES = 'user/created';
const RESOURCE_TYPE = 'user';
const QUERY_PARAMS = { expand: true };

// A creator the webapp already knows is approved here, as a seller and for the community, with no
// Slack message (spec/v0/login-and-registration.md §6.4.2). The job asks the webapp itself and
// never trusts what the browser sent. The community comes first: when the webapp fails there,
// nothing is approved yet, and they're handled as an unknown creator (APPLIED and the Slack
// message), as when the webapp can't be asked at all. Answers the metadata, or null.
async function autoApproveCreator(userId, userAttributes) {
  const { email, identityProviders } = userAttributes;
  const webappUser = await lookUpWebappUser(email, identityProviders[0].userId);
  const isWebappCreator =
    webappUser?.type === STUDIO_USER_TYPE.CREATOR && webappUser.loginMatches === true;
  if (!isWebappCreator) {
    return null;
  }
  const community = await approveCommunity(userId, userAttributes);
  if (!community) {
    return null;
  }
  const seller = await approveSeller(userId, userAttributes);
  return { membership: SELLER_MEMBERSHIP_TYPES.BASIC, ...community, ...seller };
}

async function getExtendedData(userId, userAttributes) {
  const { profile } = userAttributes;
  const { userType } = profile.publicData;
  if (userType === USER_TYPES.SELLER) {
    const approved = await autoApproveCreator(userId, userAttributes);
    if (approved) {
      return { metadata: approved, autoApproved: true };
    }
    const appliedAt = new Date();
    return {
      metadata: {
        membership: SELLER_MEMBERSHIP_TYPES.BASIC,
        communityStatus: COMMUNITY_STATUS.APPLIED,
        sellerStatus: SELLER_STATUS.APPLIED,
        appliedAt: appliedAt.toUTCString(),
      },
    };
  }
}

async function identifyUserHandler(userId, userAttributes) {
  const { profile, email } = userAttributes;
  const { firstName, lastName } = profile;
  const { newsletterOptIn } = profile?.privateData || {};
  const { userType } = profile.publicData || {};
  const isSeller = userType === USER_TYPES.SELLER;
  const isBrand = userType === USER_TYPES.BRAND;
  const isProd = process.env.NODE_ENV === 'production';
  const eventUser = { id: userId, email };
  const eventTraits = {
    firstName,
    lastName,
    type: isBrand ? 'BRAND' : 'BUYER',
    creatorFoundingMember: 'NO',
    communityUser: 'NO',
    isProdUser: isProd ? 'YES' : 'NO',
    subscribedToNewsletter: !!newsletterOptIn ? 'YES' : 'NO',
    ...(isSeller ? { sellerStatus: SELLER_STATUS.APPLIED } : {}),
  };
  identifyUserEvent(eventUser, eventTraits);
  if (!!newsletterOptIn) {
    const eventUser = { id: userId, email };
    trackManagementAPIEvent('User subscribed to newsletter', eventUser);
  }
}

async function referralProgramOptIn(userId, email, firstName, lastName) {
  try {
    const integrationSdk = integrationSdkInit();
    const referralManagerClient = new RAMClient();
    const rfUser = await referralManagerClient.qualifyReferral(userId, email, firstName, lastName);
    const { code } = rfUser || {};
    await integrationSdk.users.updateProfile({
      id: userId,
      privateData: {
        referralCode: code,
      },
    });
  } catch (error) {
    slackUserCreatedErrorWorkflow(userId);
    console.error(
      `[notifyUserCreated] Error qualifying referral (won't stop excecution) | userId: ${userId} | Error:`,
      error
    );
  }
  return;
}

const analyzeEvent = async event => {
  const integrationSdk = integrationSdkInit();
  const { resourceType, eventType } = event.attributes;
  const isValidEvent = resourceType === RESOURCE_TYPE && eventType === EVENT_TYPES;
  if (isValidEvent) {
    const { resourceId, resource: user } = event.attributes;
    const userId = resourceId.uuid;
    const { profile, email, identityProviders } = user.attributes;
    const { displayName, firstName, lastName } = profile;
    const { userType } = profile.publicData;
    const isBuyer = userType === USER_TYPES.BUYER;
    const isBrand = userType === USER_TYPES.BRAND;
    const isSeller = userType === USER_TYPES.SELLER;
    identifyUserHandler(userId, user.attributes);
    try {
      await referralProgramOptIn(userId, email, firstName, lastName);
      // Brand users are joined during sign-up (spec/v0/login-and-registration.md §4.5.1). The
      // `user/updated` event of the join's write brings their `studioId` to Auth0 and joins their
      // community (notifyUserUpdated.js).
      if (isBuyer || isBrand) {
        // Written here, not left to the `user/updated` event of the referral code, which never
        // comes when the referral call fails (spec/v0/login-and-registration.md §2.6.5).
        await updateAuth0User({
          auth0UserId: identityProviders[0].userId,
          marketId: userId,
          firstName,
          lastName,
          displayName,
          userType,
        });
        return;
      }
      const { metadata, privateData, publicData, autoApproved } = await getExtendedData(
        userId,
        user.attributes
      );
      const { studioId, communityId, sellerStatus, communityStatus } = metadata || {};
      await integrationSdk.users.updateProfile(
        {
          id: userId,
          ...(!!privateData && { privateData }),
          ...(!!publicData && { publicData }),
          metadata,
        },
        QUERY_PARAMS
      );
      await updateAuth0User({
        auth0UserId: identityProviders[0].userId,
        marketId: userId,
        studioId,
        communityId,
        firstName,
        lastName,
        displayName,
        sellerStatus,
        communityStatus,
        userType,
      });
      if (isSeller && !autoApproved) {
        const { displayName } = profile;
        const { portfolioURL } = profile.publicData;
        await slackSellerValidationWorkflow(userId, displayName, email, portfolioURL, false);
      }
    } catch (error) {
      slackUserCreatedErrorWorkflow(userId);
      console.error(
        `[notifyUserCreated] Error processing event | userId: ${userId} | Error:`,
        error
      );
    }
  }
};

function script() {
  const queryEvents = args => {
    const integrationSdk = integrationSdkInit();
    const filter = { eventTypes: EVENT_TYPES };
    return integrationSdk.events.query({ ...args, ...filter });
  };

  const analyzeEventsBatch = async events => {
    for (const event of events) {
      await analyzeEvent(event);
    }
  };

  generateScript(SCRIPT_NAME, queryEvents, analyzeEventsBatch);
}

module.exports = script;
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.RESOURCE_TYPE = RESOURCE_TYPE;
module.exports.analyzeEvent = analyzeEvent;
module.exports.getExtendedData = getExtendedData;
