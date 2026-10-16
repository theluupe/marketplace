jest.mock('../../api-util/analytics', () => ({
  identifyUserEvent: jest.fn(),
  trackManagementAPIEvent: jest.fn(),
}));
jest.mock('../../api-util/auth0Helper', () => ({ updateAuth0User: jest.fn() }));
jest.mock('../../api-util/referralManager', () => ({ ReferralAPIManagerClient: jest.fn() }));
jest.mock('../../api-util/slackHelper', () => ({
  slackSellerValidationWorkflow: jest.fn(),
  slackUserCreatedErrorWorkflow: jest.fn(),
}));
jest.mock('../../api-util/creatorApproval', () => ({
  approveCommunity: jest.fn(),
  approveSeller: jest.fn(),
}));
jest.mock('../../api/auth/webappSignup', () => ({ lookUpWebappUser: jest.fn() }));
jest.mock('../../api-util/scriptManager', () => ({ integrationSdkInit: jest.fn() }));
jest.mock('../../api-util/studioHelper', () => ({
  StudioManagerClient: jest.fn(),
  STUDIO_USER_TYPE: { BRAND: 'BRAND', CREATOR: 'CREATOR' },
}));

const { updateAuth0User } = require('../../api-util/auth0Helper');
const { approveCommunity, approveSeller } = require('../../api-util/creatorApproval');
const {
  slackSellerValidationWorkflow,
  slackUserCreatedErrorWorkflow,
} = require('../../api-util/slackHelper');
const { lookUpWebappUser } = require('../../api/auth/webappSignup');
const { USER_TYPES } = require('../../api-util/metadataHelper');
const { ReferralAPIManagerClient } = require('../../api-util/referralManager');
const { integrationSdkInit } = require('../../api-util/scriptManager');
const { StudioManagerClient } = require('../../api-util/studioHelper');
const { analyzeEvent } = require('./notifyUserCreated');

describe('notifyUserCreated, a buyer or a brand user', () => {
  let sdk;
  let qualifyReferral;

  const created = userType => ({
    attributes: {
      resourceType: 'user',
      eventType: 'user/created',
      resourceId: { uuid: 'buyer-1' },
      resource: {
        attributes: {
          email: 'bo@example.com',
          identityProviders: [{ userId: 'auth0|bo' }],
          profile: {
            firstName: 'Bo',
            lastName: 'Yer',
            displayName: 'Bo Y',
            publicData: { userType },
            privateData: {},
          },
        },
      },
    },
  });

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    sdk = { users: { updateProfile: jest.fn().mockResolvedValue({}) } };
    integrationSdkInit.mockReturnValue(sdk);
    qualifyReferral = jest.fn();
    ReferralAPIManagerClient.mockImplementation(() => ({ qualifyReferral }));
  });

  it.each([
    ['a buyer', 'the referral code is saved', USER_TYPES.BUYER, { code: 'R1' }],
    ['a buyer', 'the referral call fails', USER_TYPES.BUYER, null],
    ['a brand user', 'the referral code is saved', USER_TYPES.BRAND, { code: 'R1' }],
  ])("writes %s's ids and names to Auth0 when %s", async (_, __, userType, referral) => {
    if (referral) {
      qualifyReferral.mockResolvedValue(referral);
    } else {
      qualifyReferral.mockRejectedValue(new Error('down'));
    }

    await analyzeEvent(created(userType));

    expect(updateAuth0User).toHaveBeenCalledTimes(1);
    expect(updateAuth0User).toHaveBeenCalledWith({
      auth0UserId: 'auth0|bo',
      marketId: 'buyer-1',
      firstName: 'Bo',
      lastName: 'Yer',
      displayName: 'Bo Y',
      userType,
    });
  });

  // spec/v0/login-and-registration.md §4.5.1: the sign-up joins them.
  it("never joins a brand user's brand", async () => {
    qualifyReferral.mockResolvedValue({ code: 'R1' });

    await analyzeEvent(created(USER_TYPES.BRAND));

    expect(StudioManagerClient).not.toHaveBeenCalled();
    expect(sdk.users.updateProfile).toHaveBeenCalledTimes(1);
    expect(sdk.users.updateProfile).toHaveBeenCalledWith({
      id: 'buyer-1',
      privateData: { referralCode: 'R1' },
    });
  });
});

// spec/v0/login-and-registration.md §6.4.2
describe('notifyUserCreated, a creator', () => {
  let sdk;

  const creatorCreated = {
    attributes: {
      resourceType: 'user',
      eventType: 'user/created',
      resourceId: { uuid: 'creator-1' },
      resource: {
        attributes: {
          email: 'cy@example.com',
          identityProviders: [{ userId: 'auth0|cy' }],
          profile: {
            firstName: 'Cy',
            lastName: 'Ator',
            displayName: 'Cy A',
            publicData: { userType: USER_TYPES.SELLER, portfolioURL: 'cy.com' },
            privateData: {},
          },
        },
      },
    },
  };
  const COMMUNITY = { communityId: 12, studioId: 'studio-1', communityStatus: 'APPROVED' };
  const SELLER = { profileListingId: 'listing-1', sellerStatus: 'APPROVED', reviewedAt: 'today' };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    sdk = { users: { updateProfile: jest.fn().mockResolvedValue({}) } };
    integrationSdkInit.mockReturnValue(sdk);
    const qualifyReferral = jest.fn().mockResolvedValue({ code: 'R1' });
    ReferralAPIManagerClient.mockImplementation(() => ({ qualifyReferral }));
    lookUpWebappUser.mockResolvedValue({ type: 'CREATOR', loginMatches: true });
    approveCommunity.mockResolvedValue(COMMUNITY);
    approveSeller.mockResolvedValue(SELLER);
  });

  const writtenMetadata = () =>
    sdk.users.updateProfile.mock.calls.find(([params]) => params.metadata)[0].metadata;

  it('approves one the webapp knows, as a seller and for the community, with no Slack message', async () => {
    await analyzeEvent(creatorCreated);

    expect(lookUpWebappUser).toHaveBeenCalledWith('cy@example.com', 'auth0|cy');
    expect(writtenMetadata()).toEqual({ membership: 'BASIC', ...COMMUNITY, ...SELLER });
    expect(slackSellerValidationWorkflow).not.toHaveBeenCalled();
    expect(updateAuth0User).toHaveBeenCalledWith(
      expect.objectContaining({
        studioId: 'studio-1',
        communityId: 12,
        sellerStatus: 'APPROVED',
        communityStatus: 'APPROVED',
      })
    );
  });

  it.each([
    [
      'nobody the webapp knows (or a failed lookup)',
      () => lookUpWebappUser.mockResolvedValue(null),
    ],
    [
      'a webapp brand user',
      () => lookUpWebappUser.mockResolvedValue({ type: 'BRAND', loginMatches: true }),
    ],
    [
      "a webapp creator whose login isn't theirs",
      () => lookUpWebappUser.mockResolvedValue({ type: 'CREATOR', loginMatches: false }),
    ],
    ['a webapp creator the webapp fails to join', () => approveCommunity.mockResolvedValue(null)],
  ])('sends %s to Slack as an application', async (_, webappAnswers) => {
    webappAnswers();

    await analyzeEvent(creatorCreated);

    expect(writtenMetadata()).toMatchObject({
      sellerStatus: 'APPLIED',
      communityStatus: 'APPLIED',
    });
    expect(approveSeller).not.toHaveBeenCalled();
    expect(slackSellerValidationWorkflow).toHaveBeenCalledWith(
      'creator-1',
      'Cy A',
      'cy@example.com',
      'cy.com',
      false
    );
  });

  it('sends the usual alert when the seller approval fails after the community', async () => {
    approveSeller.mockRejectedValue(new Error('Sharetribe down'));

    await analyzeEvent(creatorCreated);

    expect(slackUserCreatedErrorWorkflow).toHaveBeenCalledWith('creator-1');
    expect(slackSellerValidationWorkflow).not.toHaveBeenCalled();
  });
});
