const { identifyUserEvent, trackManagementAPIEvent } = require('../../api-util/analytics');
const { updateAuth0User } = require('../../api-util/auth0Helper');
const {
  USER_TYPES,
  COMMUNITY_STATUS,
  SELLER_STATUS,
  BRAND_MEMBERSHIP_TYPES,
  SELLER_MEMBERSHIP_TYPES,
} = require('../../api-util/metadataHelper');
const { ReferralAPIManagerClient: RAMClient } = require('../../api-util/referralManager');
const { integrationSdkInit, generateScript } = require('../../api-util/scriptManager');
const {
  slackSellerValidationWorkflow,
  slackUserCreatedErrorWorkflow,
} = require('../../api-util/slackHelper');
const { StudioManagerClient: SMClient, STUDIO_USER_TYPE } = require('../../api-util/studioHelper');

const SCRIPT_NAME = 'notifyUserCreated';
const EVENT_TYPES = 'user/created';
const RESOURCE_TYPE = 'user';
const QUERY_PARAMS = { expand: true };

function script() {
  const queryEvents = args => {
    const integrationSdk = integrationSdkInit();
    const filter = { eventTypes: EVENT_TYPES };
    return integrationSdk.events.query({ ...args, ...filter });
  };

  async function addBrandUser(brandAdminId, userId, brandUsers) {
    const integrationSdk = integrationSdkInit();
    const parsedBrandUsers = [...new Set([...brandUsers, userId])];
    await integrationSdk.users.updateProfile(
      {
        id: brandAdminId,
        metadata: {
          brandUsers: parsedBrandUsers,
        },
      },
      QUERY_PARAMS
    );
  }

  async function getBrandData(userId, brandStudioId) {
    const integrationSdk = integrationSdkInit();
    const response = await integrationSdk.users.query(
      {
        priv_brandStudioId: brandStudioId,
        meta_isBrandAdmin: true,
      },
      QUERY_PARAMS
    );
    const data = response.data.data;
    const brandFound = data.length > 0;
    if (!brandFound) {
      return {
        brandName: '',
        brandWebsite: '',
        aboutUs: '',
        brandIndustry: '',
      };
    }
    const user = data[0];
    const brandAdminId = user.id.uuid;
    const { profile } = user.attributes;
    const { publicData, metadata } = profile;
    const { brandName, brandWebsite, aboutUs, brandIndustry } = publicData;
    const { brandUsers } = metadata;
    await addBrandUser(brandAdminId, userId, brandUsers);
    return {
      brandName,
      brandWebsite,
      aboutUs,
      brandIndustry,
    };
  }

  async function getExtendedData(userId, userAttributes) {
    const { profile, email, identityProviders } = userAttributes;
    const { firstName, lastName } = profile;
    const { userType } = profile.publicData;
    if (userType === USER_TYPES.BRAND) {
      const { brandStudioId } = profile.privateData;
      const { brandName } = profile.publicData;
      const studioManagerClient = new SMClient();
      const studioBrandUser = await studioManagerClient.studioBrandUserInit(brandStudioId, {
        admin: {
          email,
          firstName,
          lastName,
          providerId: identityProviders[0].userId,
          marketId: userId,
          type: STUDIO_USER_TYPE.BRAND,
        },
        companyName: brandName,
      });
      const { communityId, studioId } = studioBrandUser;
      const withBrandStudioId = !!brandStudioId;
      if (!withBrandStudioId) {
        const { brandStudioId: newBrandStudioId } = studioBrandUser;
        return {
          privateData: {
            brandStudioId: newBrandStudioId,
          },
          metadata: {
            brandUsers: [],
            membership: BRAND_MEMBERSHIP_TYPES.BASIC,
            isBrandAdmin: true,
            communityId,
            studioId,
          },
        };
      }
      const brandData = await getBrandData(userId, brandStudioId);
      return {
        publicData: brandData,
        metadata: {
          membership: BRAND_MEMBERSHIP_TYPES.BASIC,
          isBrandAdmin: false,
          communityId,
          studioId,
        },
      };
    } else if (userType === USER_TYPES.SELLER) {
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
      const isSeller = userType === USER_TYPES.SELLER;
      identifyUserHandler(userId, user.attributes);
      try {
        await referralProgramOptIn(userId, email, firstName, lastName);
        if (isBuyer) {
          return;
        }
        const { metadata, privateData, publicData } = await getExtendedData(
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
        if (isSeller) {
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

  const analyzeEventsBatch = async events => {
    for (const event of events) {
      await analyzeEvent(event);
    }
  };

  generateScript(SCRIPT_NAME, queryEvents, analyzeEventsBatch);
}

module.exports = script;
