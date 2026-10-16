const log = require('../log.js');
const { getBrandMemberIds } = require('./brandMembers');
const { USER_TYPES, BRAND_MEMBERSHIP_TYPES } = require('./metadataHelper');
const { integrationSdkInit } = require('./scriptManager');
const { StudioManagerClient, STUDIO_USER_TYPE } = require('./studioHelper');

const QUERY_PARAMS = { expand: true };

// A brand user's join: the webapp's, then the Marketplace's brand data. It runs during sign-up,
// not in the background job, so nobody lands with no brand (spec/v0/login-and-registration.md
// §4.5.1). Shared by the sign-up, the login that finishes an unfinished one, and Luupe's assign
// tool (§7.4).

// The join writes `studioId` with the rest of the brand data, in one update, so a brand user
// without it hasn't been joined.
const isBrandJoinUnfinished = user => {
  const { publicData, metadata } = user?.attributes?.profile || {};
  return publicData?.userType === USER_TYPES.BRAND && !metadata?.studioId;
};

// The admin's list is rebuilt from the brand's members, not read, added to and written back: two
// members joining at once dropped one of them for good (spec/v0/login-and-registration.md §9.4.4).
// The joiner is added in case the search doesn't list a brand-new account yet.
async function updateBrandUsers(brandAdminId, brandStudioId, joinerId) {
  const integrationSdk = integrationSdkInit();
  const memberIds = await getBrandMemberIds(brandAdminId, brandStudioId);
  await integrationSdk.users.updateProfile(
    {
      id: brandAdminId,
      metadata: {
        brandUsers: [...new Set([...memberIds, joinerId])],
      },
    },
    QUERY_PARAMS
  );
}

// A member's brand fields: the Marketplace admin's, copied.
async function getBrandData(userId, brandStudioId, companyName) {
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
    // No Marketplace admin yet: Popup Studio's brands get theirs in the webapp, and people sign
    // up here in any order (spec/v0/webapp-user-first-sign-up.md). The webapp names the brand;
    // its admin joins this member to its list when they sign up.
    return {
      brandName: companyName || '',
      brandWebsite: '',
      aboutUs: '',
      brandIndustry: '',
    };
  }
  const user = data[0];
  const brandAdminId = user.id.uuid;
  const { profile } = user.attributes;
  const { publicData } = profile;
  const { brandName, brandWebsite, aboutUs, brandIndustry } = publicData;
  await updateBrandUsers(brandAdminId, brandStudioId, userId);
  return {
    brandName,
    brandWebsite,
    aboutUs,
    brandIndustry,
  };
}

// The Marketplace's brand data, as the job wrote it before (§4.3), without `communityId`: the
// job's Circle step writes it (§4.5.1).
async function getJoinedBrandData(userId, brandStudioId, joined) {
  const { studioId, isBrandAdmin, companyName } = joined;
  const joinedBrandStudioId = brandStudioId || joined.brandStudioId;
  // A new brand (the new-brand link, `POST /brand`), or a brand whose admin the webapp says they
  // are: either the first person to join a brand with no admin (spec/v0/brands-without-admin.md),
  // or a brand's webapp admin registering it here (§4.5.3). The webapp's name wins, and the
  // members who signed up here before them start their list (spec/v0/webapp-user-first-sign-up.md).
  // A webapp without that change sends no flag, and an invited joiner stays a plain member.
  if (!brandStudioId || isBrandAdmin) {
    return {
      ...(brandStudioId ? {} : { privateData: { brandStudioId: joinedBrandStudioId } }),
      ...(companyName ? { publicData: { brandName: companyName } } : {}),
      metadata: {
        brandUsers: await getBrandMemberIds(userId, joinedBrandStudioId),
        membership: BRAND_MEMBERSHIP_TYPES.BASIC,
        isBrandAdmin: true,
        studioId,
      },
    };
  }
  return {
    publicData: await getBrandData(userId, brandStudioId, companyName),
    metadata: {
      membership: BRAND_MEMBERSHIP_TYPES.BASIC,
      isBrandAdmin: false,
      studioId,
    },
  };
}

// Answers whether the join worked. Safe to run again: the webapp returns the same user for someone
// already in that brand, and `POST /brand` returns the brand of a person who's already its admin
// (webapp/spec/marketplace-login-and-registration.md §2.3, §2.4).
//
// `assignedBrandStudioId` is Luupe's tool assigning a buyer to a brand (§7.4): the account's type
// and brand are written with the rest of the brand data, in the same update, so a failed join
// leaves them a buyer.
const joinBrand = async (userId, assignedBrandStudioId) => {
  try {
    const integrationSdk = integrationSdkInit();
    const response = await integrationSdk.users.show({ id: userId }, QUERY_PARAMS);
    const { email, identityProviders, profile } = response.data.data.attributes;
    const { firstName, lastName } = profile;
    const brandStudioId = assignedBrandStudioId || profile.privateData?.brandStudioId;
    const { brandName } = profile.publicData || {};
    const joined = await new StudioManagerClient().studioBrandUserInit(brandStudioId, {
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
    // A refusal, or a failed call (the client logs it).
    if (!joined.success || !joined.studioId || !(brandStudioId || joined.brandStudioId)) {
      return false;
    }
    const brandData = await getJoinedBrandData(userId, brandStudioId, joined);
    const privateData = assignedBrandStudioId
      ? { ...brandData.privateData, brandStudioId }
      : brandData.privateData;
    const publicData = assignedBrandStudioId
      ? { ...brandData.publicData, userType: USER_TYPES.BRAND }
      : brandData.publicData;
    await integrationSdk.users.updateProfile(
      {
        id: userId,
        ...(privateData ? { privateData } : {}),
        ...(publicData ? { publicData } : {}),
        metadata: brandData.metadata,
      },
      QUERY_PARAMS
    );
    return true;
  } catch (e) {
    log.error(e, 'brand-join-failed', { userId });
    return false;
  }
};

module.exports = { isBrandJoinUnfinished, joinBrand };
