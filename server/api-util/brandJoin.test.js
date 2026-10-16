jest.mock('../log.js', () => ({ error: jest.fn() }));
jest.mock('./scriptManager', () => ({ integrationSdkInit: jest.fn() }));
jest.mock('./studioHelper', () => ({
  StudioManagerClient: jest.fn(),
  STUDIO_USER_TYPE: { BRAND: 'BRAND' },
}));

const log = require('../log.js');
const { BRAND_MEMBERSHIP_TYPES, USER_TYPES } = require('./metadataHelper');
const { integrationSdkInit } = require('./scriptManager');
const { StudioManagerClient } = require('./studioHelper');
const { isBrandJoinUnfinished, joinBrand } = require('./brandJoin');

const BRAND_ID = 'brand-1';
const JOINER_ID = 'joiner-1';
const ADMIN_ID = 'admin-1';

// A person who signed up through a brand's invitation link, or the new-brand link (no brand id).
const joiner = (privateData = { brandStudioId: BRAND_ID }) => ({
  data: {
    data: {
      attributes: {
        email: 'jo@example.com',
        identityProviders: [{ userId: 'auth0|jo' }],
        profile: {
          firstName: 'Jo',
          lastName: 'Iner',
          publicData: { userType: USER_TYPES.BRAND, brandName: 'Typed' },
          privateData,
        },
      },
    },
  },
});

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
const marketplaceUsers = ids => ({
  data: { data: ids.map(uuid => ({ id: { uuid }, attributes: { deleted: false } })) },
});

describe('joinBrand', () => {
  let sdk;
  let studioBrandUserInit;

  const webappAnswers = answer => studioBrandUserInit.mockResolvedValue(answer);
  // The joiner's own write, the last one.
  const written = () => sdk.users.updateProfile.mock.calls.find(([{ id }]) => id === JOINER_ID)[0];

  beforeEach(() => {
    sdk = {
      users: {
        show: jest.fn().mockResolvedValue(joiner()),
        query: jest.fn(),
        updateProfile: jest.fn().mockResolvedValue({}),
      },
    };
    integrationSdkInit.mockReturnValue(sdk);
    studioBrandUserInit = jest.fn();
    StudioManagerClient.mockImplementation(() => ({ studioBrandUserInit }));
  });

  it("joins the webapp with the account's data", async () => {
    webappAnswers({ success: true, studioId: 'studio-1' });
    sdk.users.query.mockResolvedValue(marketplaceUsers([]));

    await joinBrand(JOINER_ID);

    expect(sdk.users.show).toHaveBeenCalledWith({ id: JOINER_ID }, { expand: true });
    expect(studioBrandUserInit).toHaveBeenCalledWith(BRAND_ID, {
      admin: {
        email: 'jo@example.com',
        firstName: 'Jo',
        lastName: 'Iner',
        providerId: 'auth0|jo',
        marketId: JOINER_ID,
        type: 'BRAND',
      },
      companyName: 'Typed',
    });
  });

  it("makes a new brand's admin, with the webapp's name and the members already here", async () => {
    sdk.users.show.mockResolvedValue(joiner({ location: 'NYC' }));
    webappAnswers({
      success: true,
      brandStudioId: 'brand-new',
      studioId: 'studio-1',
      companyName: 'Acme',
      communityId: 'community-1',
    });
    sdk.users.query.mockResolvedValue(marketplaceUsers(['member-1']));

    await expect(joinBrand(JOINER_ID)).resolves.toBe(true);

    expect(sdk.users.query).toHaveBeenCalledWith({ priv_brandStudioId: 'brand-new' });
    expect(written()).toEqual({
      id: JOINER_ID,
      privateData: { brandStudioId: 'brand-new' },
      publicData: { brandName: 'Acme' },
      metadata: {
        brandUsers: ['member-1'],
        membership: BRAND_MEMBERSHIP_TYPES.BASIC,
        isBrandAdmin: true,
        studioId: 'studio-1',
      },
    });
  });

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
        success: true,
        studioId: 'studio-1',
        isBrandAdmin: true,
        companyName: 'Acme',
      });
      sdk.users.query.mockResolvedValue(marketplaceUsers(brandUserIds));

      await expect(joinBrand(JOINER_ID)).resolves.toBe(true);

      expect(written()).toEqual({
        id: JOINER_ID,
        publicData: { brandName: 'Acme' },
        metadata: {
          brandUsers: expectedBrandUsers,
          membership: BRAND_MEMBERSHIP_TYPES.BASIC,
          isBrandAdmin: true,
          studioId: 'studio-1',
        },
      });
      expect(sdk.users.query).toHaveBeenCalledTimes(1);
      expect(sdk.users.query).toHaveBeenCalledWith({ priv_brandStudioId: BRAND_ID });
      expect(sdk.users.updateProfile).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ["the webapp's brand name", { isBrandAdmin: false, companyName: 'Acme' }, 'Acme'],
    ['an empty name when the webapp sends none', {}, ''],
  ])('gives a member of a brand with no Marketplace admin yet %s', async (_, answer, brandName) => {
    webappAnswers({ success: true, studioId: 'studio-1', ...answer });
    sdk.users.query.mockResolvedValue(marketplaceUsers([]));

    await joinBrand(JOINER_ID);

    expect(written().publicData).toEqual({
      brandName,
      brandWebsite: '',
      aboutUs: '',
      brandIndustry: '',
    });
    expect(written().metadata.isBrandAdmin).toBe(false);
    expect(sdk.users.updateProfile).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a member (isBrandAdmin: false)', { isBrandAdmin: false, companyName: 'Acme' }],
    ['a webapp without the change (no flag)', {}],
  ])("copies the admin's brand fields and rebuilds the admin's list for %s", async (_, answer) => {
    webappAnswers({ success: true, studioId: 'studio-1', communityId: 'community-1', ...answer });
    sdk.users.query
      .mockResolvedValueOnce({ data: { data: [brandAdmin({ brandUsers: ['member-1'] })] } })
      // member-2 is missing from the admin's stored list (lost by two joins at once).
      .mockResolvedValueOnce(marketplaceUsers([ADMIN_ID, 'member-1', 'member-2', JOINER_ID]));

    await expect(joinBrand(JOINER_ID)).resolves.toBe(true);

    expect(written()).toEqual({
      id: JOINER_ID,
      publicData: adminFields,
      metadata: {
        membership: BRAND_MEMBERSHIP_TYPES.BASIC,
        isBrandAdmin: false,
        studioId: 'studio-1',
      },
    });
    expect(sdk.users.query).toHaveBeenCalledWith(
      { priv_brandStudioId: BRAND_ID, meta_isBrandAdmin: true },
      { expand: true }
    );
    expect(sdk.users.updateProfile).toHaveBeenCalledWith(
      { id: ADMIN_ID, metadata: { brandUsers: ['member-1', 'member-2', JOINER_ID] } },
      { expand: true }
    );
  });

  it("adds the joiner when the search doesn't list them yet", async () => {
    webappAnswers({ success: true, studioId: 'studio-1' });
    sdk.users.query
      .mockResolvedValueOnce({ data: { data: [brandAdmin({})] } })
      .mockResolvedValueOnce(marketplaceUsers([ADMIN_ID, 'member-1']));

    await joinBrand(JOINER_ID);

    expect(sdk.users.updateProfile).toHaveBeenCalledWith(
      { id: ADMIN_ID, metadata: { brandUsers: ['member-1', JOINER_ID] } },
      { expand: true }
    );
  });

  // spec/v0/login-and-registration.md §7.4: Luupe's tool assigns a buyer.
  it("writes an assigned buyer's type and brand with the rest, in one update", async () => {
    sdk.users.show.mockResolvedValue({
      data: {
        data: {
          attributes: {
            email: 'bo@example.com',
            identityProviders: [{ userId: 'auth0|bo' }],
            profile: { firstName: 'Bo', lastName: 'Yer', publicData: { userType: 'buyer' } },
          },
        },
      },
    });
    webappAnswers({ success: true, studioId: 'studio-1', isBrandAdmin: true, companyName: 'Acme' });
    sdk.users.query.mockResolvedValue(marketplaceUsers([]));

    await expect(joinBrand(JOINER_ID, BRAND_ID)).resolves.toBe(true);

    expect(studioBrandUserInit).toHaveBeenCalledWith(BRAND_ID, expect.any(Object));
    expect(sdk.users.updateProfile).toHaveBeenCalledTimes(1);
    expect(written()).toEqual({
      id: JOINER_ID,
      privateData: { brandStudioId: BRAND_ID },
      publicData: { brandName: 'Acme', userType: USER_TYPES.BRAND },
      metadata: {
        brandUsers: [],
        membership: BRAND_MEMBERSHIP_TYPES.BASIC,
        isBrandAdmin: true,
        studioId: 'studio-1',
      },
    });
  });

  // BR17: nobody is left half set up.
  it.each([
    ['refuses the join', { success: false }],
    ['answers without its user', { success: true }],
  ])('fails, writing nothing, when the webapp %s', async (_, answer) => {
    webappAnswers(answer);

    await expect(joinBrand(JOINER_ID)).resolves.toBe(false);

    expect(sdk.users.updateProfile).not.toHaveBeenCalled();
  });

  it('fails, and logs it, when Sharetribe does', async () => {
    const error = new Error('Sharetribe down');
    webappAnswers({ success: true, studioId: 'studio-1', isBrandAdmin: true });
    sdk.users.query.mockResolvedValue(marketplaceUsers([]));
    sdk.users.updateProfile.mockRejectedValue(error);

    await expect(joinBrand(JOINER_ID)).resolves.toBe(false);

    expect(log.error).toHaveBeenCalledWith(error, 'brand-join-failed', { userId: JOINER_ID });
  });
});

describe('isBrandJoinUnfinished', () => {
  const account = (userType, metadata) => ({
    attributes: { profile: { publicData: { userType }, metadata } },
  });

  it.each([
    ['a brand user without the webapp user', true, account(USER_TYPES.BRAND, {})],
    ['a joined brand user', false, account(USER_TYPES.BRAND, { studioId: 'studio-1' })],
    ['a buyer', false, account(USER_TYPES.BUYER, {})],
    ['a creator', false, account(USER_TYPES.SELLER, undefined)],
  ])('%s: %s', (_, unfinished, user) => {
    expect(isBrandJoinUnfinished(user)).toBe(unfinished);
  });
});
