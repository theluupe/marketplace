const log = require('../../log.js');
const { USER_TYPES } = require('../../api-util/metadataHelper');
const { StudioManagerClient, STUDIO_USER_TYPE } = require('../../api-util/studioHelper');

// What the webapp knows decides a first sign-up, at login (loginWithIdp.js) and again when the
// account is created (createUserWithIdp.js), which never trusts the browser
// (spec/v0/login-and-registration.md §4.5.3, §6.4, §10.2.3).

// Error pages, by the code the page reads (from `st-autherror` at login, or the sign-up's refusal):
// a login that isn't the person's (§8.3 BR22, §6.4.1), and a brand link their webapp brand doesn't
// allow (§4.5.6).
const SECOND_LOGIN_ERROR_CODE = 'second-login';
const INVITATION_ERROR_CODE = 'invitation';
// An invitation link whose brand the webapp doesn't know (§4.5.2, BR8).
const INVALID_INVITATION_CODE = 'invalid-invitation';

// A person with no Sharetribe account may already be a webapp user: Popup Studio creates brand
// members there first (spec/v0/webapp-user-first-sign-up.md). What the webapp knows decides their
// sign-up, whatever link they came from (spec/v0/login-and-registration.md §4.5.3, §6.4). Returns
// the sign-up cookie's fields, or `errorCode` for an error page. `link` is what their link
// carried: `userType`, and `brandStudioId` for an invitation. Nobody, or a failed lookup, leaves
// the link as it is: that never blocks a sign-up.
const signupFromWebapp = (link, webappUser) => {
  if (!webappUser) return {};
  // §6.4.1: a known person logs in with the Auth0 account the platform has for them.
  if (!webappUser.loginMatches) return { errorCode: SECOND_LOGIN_ERROR_CODE };
  const { type, brandId, companyName, isBrandAdmin } = webappUser;
  // `userTypeFromWebapp` hides the confirm page's switch between buyer and creator (§2.6.1), and
  // `userTypeNotice` shows its banner, "This account is set up as a creator/buyer account" (§6.4.2,
  // §6.4.3): for a creator, unless they came through the creator sign-up anyway.
  if (type === STUDIO_USER_TYPE.CREATOR) {
    return {
      userType: USER_TYPES.SELLER,
      brandStudioId: undefined,
      userTypeFromWebapp: true,
      ...(link.userType === USER_TYPES.SELLER ? {} : { userTypeNotice: true }),
    };
  }
  // §6.4.3: no type, or a brand user without a brand.
  if (type !== STUDIO_USER_TYPE.BRAND || !brandId) {
    return {
      userType: USER_TYPES.BUYER,
      brandStudioId: undefined,
      userTypeFromWebapp: true,
      userTypeNotice: true,
    };
  }
  const isBrandLink = link.userType === USER_TYPES.BRAND;
  const invitedBrandId = isBrandLink ? link.brandStudioId : undefined;
  const isOtherBrandsInvitation = !!invitedBrandId && invitedBrandId !== brandId;
  const isMemberOnNewBrandLink = isBrandLink && !invitedBrandId && !isBrandAdmin;
  // §4.5.6: another brand's invitation (BR9), or a plain member on the new-brand link (BR4).
  if (isOtherBrandsInvitation || isMemberOnNewBrandLink) {
    return { errorCode: INVITATION_ERROR_CODE };
  }
  return {
    userType: USER_TYPES.BRAND,
    brandStudioId: brandId,
    userTypeFromWebapp: true,
    // Their brand's admin, whatever the link (BR3, BR10): the new-brand form, with the brand's
    // webapp name locked.
    ...(isBrandAdmin ? { isBrandAdmin: true, companyName } : {}),
  };
};

const lookUpWebappUser = async (email, auth0UserId) => {
  try {
    return await new StudioManagerClient().lookupUser(email, auth0UserId);
  } catch (e) {
    log.error(e, 'webapp-user-lookup-failed');
    return null;
  }
};

// Whether the webapp says it doesn't know this brand. A failed check answers false: a webapp failure
// never reads as an invalid invitation.
const isUnknownBrand = async brandStudioId => {
  try {
    return (await new StudioManagerClient().getBrand(brandStudioId)) === null;
  } catch (e) {
    log.error(e, 'invitation-brand-failed');
    return false;
  }
};

module.exports = {
  INVALID_INVITATION_CODE,
  INVITATION_ERROR_CODE,
  SECOND_LOGIN_ERROR_CODE,
  isUnknownBrand,
  lookUpWebappUser,
  signupFromWebapp,
};
