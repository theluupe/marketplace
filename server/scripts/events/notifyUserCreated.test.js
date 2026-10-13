jest.mock('../../api-util/analytics', () => ({}));
jest.mock('../../api-util/auth0Helper', () => ({}));
jest.mock('../../api-util/referralManager', () => ({}));
jest.mock('../../api-util/slackHelper', () => ({}));
jest.mock('../../api-util/scriptManager', () => ({ integrationSdkInit: jest.fn() }));
jest.mock('../../api-util/studioHelper', () => ({
  StudioManagerClient: jest.fn(),
  STUDIO_USER_TYPE: { BRAND: 'BRAND' },
}));

const { BRAND_MEMBERSHIP_TYPES, USER_TYPES } = require('../../api-util/metadataHelper');
const { integrationSdkInit } = require('../../api-util/scriptManager');
const { StudioManagerClient } = require('../../api-util/studioHelper');
const { getExtendedData } = require('./notifyUserCreated');

const BRAND_ID = 'brand-1';
const JOINER_ID = 'joiner-1';
const ADMIN_ID = 'admin-1';

// A person who signed up through a brand's invitation link.
const joiner = {
  email: 'jo@example.com',
  identityProviders: [{ userId: 'auth0|jo' }],
  profile: {
    firstName: 'Jo',
    lastName: 'Iner',
    publicData: { userType: USER_TYPES.BRAND },
    privateData: { brandStudioId: BRAND_ID },
  },
};

const adminFields = {
  brandName: 'Acme',
  brandWebsite: 'acme.com',
  aboutUs: 'About Acme',
  brandIndustry: 'Fashion',
};
const brandAdmin = metadata => ({
  id: { uuid: ADMIN_ID },
  attributes: { profile: { publicData: adminFields, metadata } },
});

describe('notifyUserCreated getExtendedData, invitation sign-up', () => {
  let sdk;

  const webappAnswers = answer => {
    StudioManagerClient.mockImplementation(() => ({
      studioBrandUserInit: jest.fn().mockResolvedValue(answer),
    }));
  };

  beforeEach(() => {
    sdk = { users: { query: jest.fn(), updateProfile: jest.fn().mockResolvedValue({}) } };
    integrationSdkInit.mockReturnValue(sdk);
  });

  const marketplaceUsers = ids => ({ data: { data: ids.map(uuid => ({ id: { uuid } })) } });

  it.each([
    ['no members yet', [JOINER_ID], []],
    [
      'members who signed up before it',
      ['member-1', JOINER_ID, 'member-2'],
      ['member-1', 'member-2'],
    ],
  ])(
    "makes the webapp's admin the brand's admin, with its name and %s, without looking for another",
    async (_, brandUserIds, expectedBrandUsers) => {
      webappAnswers({
        communityId: 'community-1',
        studioId: 'studio-1',
        isBrandAdmin: true,
        companyName: 'Acme',
      });
      sdk.users.query.mockResolvedValue(marketplaceUsers(brandUserIds));

      const result = await getExtendedData(JOINER_ID, joiner);

      expect(result).toEqual({
        publicData: { brandName: 'Acme' },
        metadata: {
          brandUsers: expectedBrandUsers,
          membership: BRAND_MEMBERSHIP_TYPES.BASIC,
          isBrandAdmin: true,
          communityId: 'community-1',
          studioId: 'studio-1',
        },
      });
      expect(sdk.users.query).toHaveBeenCalledTimes(1);
      expect(sdk.users.query).toHaveBeenCalledWith({ priv_brandStudioId: BRAND_ID });
      expect(sdk.users.updateProfile).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["the webapp's brand name", { isBrandAdmin: false, companyName: 'Acme' }, 'Acme'],
    ['an empty name when the webapp sends none', {}, ''],
  ])('gives a member of a brand with no Marketplace admin yet %s', async (_, answer, brandName) => {
    webappAnswers({ communityId: 'community-1', studioId: 'studio-1', ...answer });
    sdk.users.query.mockResolvedValue(marketplaceUsers([]));

    const result = await getExtendedData(JOINER_ID, joiner);

    expect(result.publicData).toEqual({
      brandName,
      brandWebsite: '',
      aboutUs: '',
      brandIndustry: '',
    });
    expect(result.metadata.isBrandAdmin).toBe(false);
    expect(sdk.users.updateProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['a member (isBrandAdmin: false)', { isBrandAdmin: false, companyName: 'Acme' }],
    ['a webapp without the change (no flag)', {}],
  ])("copies the admin's brand fields and joins the admin's list for %s", async (_, answer) => {
    webappAnswers({ communityId: 'community-1', studioId: 'studio-1', ...answer });
    sdk.users.query.mockResolvedValue({
      data: { data: [brandAdmin({ brandUsers: ['member-1'] })] },
    });

    const result = await getExtendedData(JOINER_ID, joiner);

    expect(result).toEqual({
      publicData: adminFields,
      metadata: {
        membership: BRAND_MEMBERSHIP_TYPES.BASIC,
        isBrandAdmin: false,
        communityId: 'community-1',
        studioId: 'studio-1',
      },
    });
    expect(sdk.users.query).toHaveBeenCalledWith(
      { priv_brandStudioId: BRAND_ID, meta_isBrandAdmin: true },
      { expand: true }
    );
    expect(sdk.users.updateProfile).toHaveBeenCalledWith(
      { id: ADMIN_ID, metadata: { brandUsers: ['member-1', JOINER_ID] } },
      { expand: true }
    );
  });

  it('adds the joiner when the admin has no brandUsers list', async () => {
    webappAnswers({ communityId: 'community-1', studioId: 'studio-1' });
    sdk.users.query.mockResolvedValue({ data: { data: [brandAdmin({})] } });

    await getExtendedData(JOINER_ID, joiner);

    expect(sdk.users.updateProfile).toHaveBeenCalledWith(
      { id: ADMIN_ID, metadata: { brandUsers: [JOINER_ID] } },
      { expand: true }
    );
  });
});
