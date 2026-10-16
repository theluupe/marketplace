const _ = require('lodash');
const { updateAuth0User } = require('../../api-util/auth0Helper');
const { getBrandMemberIds } = require('../../api-util/brandMembers');
const {
  USER_TYPES,
  SELLER_MEMBERSHIP_TYPES,
  COMMUNITY_STATUS,
  SELLER_STATUS,
  USER_UPDATE_TYPE,
} = require('../../api-util/metadataHelper');
const { integrationSdkInit, generateScript } = require('../../api-util/scriptManager');
const {
  slackSellerValidationWorkflow,
  slackUserUpdateWarningWorkflow,
  slacktUserUpdatedErrorWorkflow,
} = require('../../api-util/slackHelper');
const { StudioManagerClient: SMClient } = require('../../api-util/studioHelper');
const {
  profileChangesValidation,
  userTypeChangesValidation,
  communityStatusChangesValidation,
  sellerStatusChangesValidation,
  shouldDisplayWarning,
} = require('./util/userUpdateValidations');

const SCRIPT_NAME = 'notifyUserUpdated';
const EVENT_TYPES = 'user/updated';
const RESOURCE_TYPE = 'user';
const QUERY_PARAMS = { expand: true };

async function shouldUpdateBrandUsers(userId, userAttributes, previousValues) {
  const integrationSdk = integrationSdkInit();
  const { profile } = userAttributes;
  const { isBrandAdmin, brandUsers } = profile.metadata || {};
  const { brandStudioId } = profile.privateData || {};
  const { brandName, brandWebsite, aboutUs, brandIndustry, userType } = profile.publicData || {};
  const { profile: previousProfile } = previousValues?.attributes || {};
  const previousPublicData = previousProfile?.publicData || {};
  // previousValues holds only the keys that changed, an added one with `null` (Sharetribe's
  // events reference), so a key's presence means "it changed". Testing its previous value
  // instead missed a field filled in for the first time, such as a new admin's first website
  // (spec/v0/brands-without-admin.md §2.3).
  const aboutUsUpdated = 'aboutUs' in previousPublicData;
  const brandNameUpdated = 'brandName' in previousPublicData;
  const brandWebsiteUpdated = 'brandWebsite' in previousPublicData;
  const brandIndustryUpdated = 'brandIndustry' in previousPublicData;
  const brandDataUpdated =
    aboutUsUpdated || brandNameUpdated || brandWebsiteUpdated || brandIndustryUpdated;
  const isBrand = userType === USER_TYPES.BRAND;
  const shouldUpdate = isBrand && isBrandAdmin && brandDataUpdated;
  const shouldUpdateStudio = isBrand && isBrandAdmin && brandNameUpdated;
  if (shouldUpdate) {
    const brandData = { brandName, brandWebsite, aboutUs, brandIndustry };
    // The brand's members, not the admin's list: a deleted account stayed in that list, and
    // updating it failed the rest of the event (spec/v0/login-and-registration.md §4.5.7). The
    // list is put right on the way.
    const memberIds = await getBrandMemberIds(userId, brandStudioId);
    await Promise.all(
      memberIds.map(brandUserId =>
        integrationSdk.users.updateProfile({
          id: brandUserId,
          publicData: brandData,
        })
      )
    );
    if (_.xor(memberIds, brandUsers || []).length > 0) {
      await integrationSdk.users.updateProfile({ id: userId, metadata: { brandUsers: memberIds } });
    }
  }
  if (shouldUpdateStudio) {
    const studioManagerClient = new SMClient();
    return await studioManagerClient.studioBrandUpdate(brandStudioId, { companyName: brandName });
  }
  return true;
}

// A brand user's community (Circle): once their join has written `studioId`, the webapp's community
// route joins them and answers the id, which is written here; Auth0 gets it with the next update's
// sync (spec/v0/login-and-registration.md §4.5.1). It runs on the join's own write, not on
// `user/created`: the join can finish after that event, at a later login. No retry (§9.2, J2): a
// failure answers false, for the usual alert.
async function shouldJoinCommunity(userId, userAttributes, previousValues) {
  const { profile } = userAttributes;
  const { userType } = profile.publicData || {};
  const { studioId, communityId } = profile.metadata || {};
  const { profile: previousProfile } = previousValues?.attributes || {};
  const justJoined = 'studioId' in (previousProfile?.metadata || {});
  const shouldJoin = userType === USER_TYPES.BRAND && !!studioId && justJoined && !communityId;
  if (!shouldJoin) {
    return true;
  }
  const studioManagerClient = new SMClient();
  const newCommunityId = await studioManagerClient.addUserToCommunity(studioId);
  if (!newCommunityId) {
    return false;
  }
  try {
    const integrationSdk = integrationSdkInit();
    await integrationSdk.users.updateProfile({
      id: userId,
      metadata: { communityId: newCommunityId },
    });
    return true;
  } catch (error) {
    console.error(
      `[notifyUserUpdated] Error saving the community id | userId: ${userId} | Error:`,
      error
    );
    return false;
  }
}

function script() {
  const queryEvents = args => {
    const integrationSdk = integrationSdkInit();
    const filter = { eventTypes: EVENT_TYPES };
    return integrationSdk.events.query({ ...args, ...filter });
  };

  async function shouldStartSellerValidationWorkflow(
    userTypeEvent,
    sellerStatusEvent,
    userId,
    displayName,
    email,
    portfolioURL
  ) {
    const integrationSdk = integrationSdkInit();
    const buyerAppliedToBeSeller = userTypeEvent === USER_UPDATE_TYPE.USER_TYPE_BUYER_TO_SELLER;
    const waitListedSellerAskedForReview =
      sellerStatusEvent === USER_UPDATE_TYPE.SELLER_STATUS_WAITLISTED_TO_APPLIED;
    if (buyerAppliedToBeSeller) {
      const appliedAt = new Date();
      await integrationSdk.users.updateProfile({
        id: userId,
        metadata: {
          membership: SELLER_MEMBERSHIP_TYPES.BASIC,
          communityStatus: COMMUNITY_STATUS.APPLIED,
          sellerStatus: SELLER_STATUS.APPLIED,
          appliedAt: appliedAt.toUTCString(),
        },
      });
    }
    if (buyerAppliedToBeSeller || waitListedSellerAskedForReview) {
      return await slackSellerValidationWorkflow(userId, displayName, email, portfolioURL, false);
    }
  }

  async function profileUpgrade(userId, userAttributes, previousValues) {
    const { profile, email } = userAttributes;
    const profileChanges = profileChangesValidation(userAttributes, previousValues);
    const userTypeChanges = userTypeChangesValidation(userAttributes, previousValues);
    const communityStatusChanges = communityStatusChangesValidation(userAttributes, previousValues);
    const sellerStatusChanges = sellerStatusChangesValidation(userAttributes, previousValues);
    const warnings = [
      ...profileChanges
        .map(entry => (shouldDisplayWarning(entry) ? entry : undefined))
        .filter(n => n),
      ...(shouldDisplayWarning(userTypeChanges) ? [userTypeChanges] : []),
      ...(shouldDisplayWarning(communityStatusChanges) ? [communityStatusChanges] : []),
      ...(shouldDisplayWarning(sellerStatusChanges) ? [sellerStatusChanges] : []),
    ];
    const withWarnings = !!warnings.length;
    if (withWarnings) {
      const { displayName } = profile;
      slackUserUpdateWarningWorkflow(userId, displayName, email, warnings);
    }
    return [userTypeChanges, sellerStatusChanges];
  }

  async function getProfileImage(userId, profileImageId) {
    const integrationSdk = integrationSdkInit();
    if (!profileImageId) return;
    const result = await integrationSdk.users.show(
      { id: userId, 'fields.image': ['variants.default'], include: ['profileImage'] },
      QUERY_PARAMS
    );
    const includedData = result.data.included;
    const includesProfileImages = !!includedData;
    if (!includesProfileImages) return;
    const profileImage = includedData.find(included => included.id.uuid === profileImageId);
    const withProfileImage = !!profileImage;
    if (!withProfileImage) return;
    const defaultVariant = profileImage?.attributes?.variants?.default?.url;
    if (!defaultVariant) return;
    return defaultVariant;
  }

  async function shouldSyncUserProfile(userId, resource, previousValues) {
    const userAttributes = resource.attributes;
    const userRelationships = resource.relationships;
    const { profile } = userAttributes;
    const { firstName, lastName, metadata } = profile;
    const { studioId } = metadata || {};
    const { profileImage } = userRelationships || {};
    const { profile: previousProfile } = previousValues?.attributes || {};
    const { profileImage: previousProfileImage } = previousValues?.relationships || {};
    const { firstName: previousFirstName, lastName: previousLastName } = previousProfile || {};
    const withStudioAccess = !!studioId;
    const firstNameUpdated = !!previousFirstName;
    const lastNameUpdated = !!previousLastName;
    const profileImageUpdated = !!previousProfileImage;
    const profileUpdated = firstNameUpdated || lastNameUpdated || profileImageUpdated;
    const shouldUpdateStudio = withStudioAccess && profileUpdated;
    if (shouldUpdateStudio) {
      const profileImageId = profileImage?.data?.id?.uuid;
      const studioManagerClient = new SMClient();
      return await studioManagerClient.studioUserUpdate(studioId, {
        avatarUri: await getProfileImage(userId, profileImageId),
        firstName,
        lastName,
      });
    }
    return true;
  }

  async function shouldSyncStudioProfileListing(resource, previousValues) {
    const userAttributes = resource.attributes;
    const { profile } = userAttributes;
    const {
      birthday,
      pronouns,
      mentorship,
      portfolioURL: website,
      instagramHandle,
      linkedinHandle,
      tiktokHandle,
      twitterHandle,
      vimeoHandle,
      youtubeHandle,
    } = profile?.publicData || {};
    const { studioId } = profile.metadata || {};
    const { profile: previousProfile } = previousValues?.attributes || {};
    const {
      birthday: previousBirthday,
      pronouns: previousPronouns,
      mentorship: previousMentorship,
      portfolioURL: previousWebsite,
      instagramHandle: previousInstagramHandle,
      linkedinHandle: previousLinkedinHandle,
      tiktokHandle: previousTiktokHandle,
      twitterHandle: previousTwitterHandle,
      vimeoHandle: previousVimeoHandle,
      youtubeHandle: previousYoutubeHandle,
    } = previousProfile?.publicData || {};
    const birthdayUpdated = !!previousBirthday;
    const pronounsUpdated = !!previousPronouns;
    const mentorshipUpdated = !!previousMentorship;
    const websiteUpdated = !!previousWebsite;
    const instagramHandleUpdated = !!previousInstagramHandle;
    const linkedinHandleUpdated = !!previousLinkedinHandle;
    const tiktokHandleUpdated = !!previousTiktokHandle;
    const twitterHandleUpdated = !!previousTwitterHandle;
    const vimeoHandleUpdated = !!previousVimeoHandle;
    const youtubeHandleUpdated = !!previousYoutubeHandle;
    const profileListingUpdated =
      birthdayUpdated ||
      pronounsUpdated ||
      mentorshipUpdated ||
      websiteUpdated ||
      instagramHandleUpdated ||
      linkedinHandleUpdated ||
      tiktokHandleUpdated ||
      twitterHandleUpdated ||
      vimeoHandleUpdated ||
      youtubeHandleUpdated;
    const withStudioAccess = !!studioId;
    const shouldUpdateStudio = withStudioAccess && profileListingUpdated;
    if (shouldUpdateStudio) {
      const studioManagerClient = new SMClient();
      return await studioManagerClient.creatorProfileListingUpdate(studioId, {
        birthday,
        pronouns,
        // A missing list is an empty one: `.map` on it crashed the event before its Auth0 sync
        // (spec/v0/login-and-registration.md §3.6.4).
        mentorship: (mentorship || []).map(entry => _.startCase(entry)).join(', '),
        website,
        instagramHandle,
        linkedinHandle,
        tiktokHandle,
        twitterHandle,
        vimeoHandle,
        youtubeHandle,
      });
    }
    return true;
  }

  async function shouldSyncProfileListing(resource, previousValues) {
    const integrationSdk = integrationSdkInit();
    const userAttributes = resource.attributes;
    const { profile } = userAttributes;
    const { userType } = profile.publicData || {};
    if (userType === USER_TYPES.SELLER) {
      const { firstName, lastName, displayName } = profile;
      const { profile: previousProfile } = previousValues?.attributes || {};
      const {
        firstName: previousFirstName,
        lastName: previousLastName,
        displayName: previousDisplayName,
      } = previousProfile || {};
      const { profileListingId } = profile.metadata || {};
      const withProfileListing = !!profileListingId;
      const firstNameUpdated = !!previousFirstName;
      const lastNameUpdated = !!previousLastName;
      const displayNameUpdated = !!previousDisplayName;
      const profileUpdated = firstNameUpdated || lastNameUpdated || displayNameUpdated;
      const shouldUpdateProfileListing = withProfileListing && profileUpdated;
      if (shouldUpdateProfileListing) {
        await integrationSdk.listings.update({
          id: profileListingId,
          title: `${firstName} ${lastName} ${displayName}`,
        });
      }
      return await shouldSyncStudioProfileListing(resource, previousValues);
    }
    return true;
  }

  async function profileSync(userId, resource, previousValues) {
    const userAttributes = resource.attributes;
    const { profile, identityProviders } = userAttributes;
    const { displayName, firstName, lastName } = profile;
    const { communityStatus, sellerStatus, studioId, communityId } = profile.metadata || {};
    const { userType } = profile.publicData || {};
    // Each step answers whether the webapp took its change (true when it had none to send). A
    // failure doesn't stop the event: the other steps and Auth0 still run, then the usual alert
    // goes out (spec/v0/login-and-registration.md §9.4.3).
    const brandSynced = await shouldUpdateBrandUsers(userId, userAttributes, previousValues);
    const communityJoined = await shouldJoinCommunity(userId, userAttributes, previousValues);
    const userSynced = await shouldSyncUserProfile(userId, resource, previousValues);
    const profileListingSynced = await shouldSyncProfileListing(resource, previousValues);
    const auth0UserId = identityProviders?.[0]?.userId;
    if (auth0UserId) {
      await updateAuth0User({
        auth0UserId,
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
    }
    if (!brandSynced || !communityJoined || !userSynced || !profileListingSynced) {
      slacktUserUpdatedErrorWorkflow(userId);
      console.error(`[notifyUserUpdated] The webapp didn't take the update | userId: ${userId}`);
    }
  }

  const analyzeEvent = async event => {
    const { resourceType, eventType } = event.attributes;
    const isValidEvent = resourceType === RESOURCE_TYPE && eventType === EVENT_TYPES;
    if (isValidEvent) {
      const { resourceId, resource: user, previousValues } = event.attributes;
      const userId = resourceId.uuid;
      const { profile, email } = user.attributes;
      const { displayName } = profile;
      const { userType } = profile.publicData || {};
      try {
        const [userTypeEvent, sellerStatusEvent] = await profileUpgrade(
          userId,
          user.attributes,
          previousValues
        );
        if (userType === USER_TYPES.SELLER) {
          const { portfolioURL } = profile.publicData;
          await shouldStartSellerValidationWorkflow(
            userTypeEvent,
            sellerStatusEvent,
            userId,
            displayName,
            email,
            portfolioURL
          );
        }
        await profileSync(userId, user, previousValues);
      } catch (error) {
        slacktUserUpdatedErrorWorkflow(userId);
        console.error(
          `[notifyUserUpdated] Error processing event | userId: ${userId} | Error:`,
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
module.exports.shouldUpdateBrandUsers = shouldUpdateBrandUsers;
