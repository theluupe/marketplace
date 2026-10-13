jest.mock('sharetribe-flex-sdk', () => ({
  createInstance: jest.fn(),
  tokenStore: { expressCookieStore: jest.fn() },
}));
jest.mock('../../api-util/sdk', () => ({ typeHandlers: [] }));
jest.mock('../../log.js', () => ({ error: jest.fn() }));
jest.mock('../../api-util/studioHelper', () => ({
  ...jest.requireActual('../../api-util/studioHelper'),
  StudioManagerClient: jest.fn(),
}));

const sharetribeSdk = require('sharetribe-flex-sdk');
const log = require('../../log.js');
const { StudioManagerClient } = require('../../api-util/studioHelper');
const loginWithIdp = require('./loginWithIdp');

// What auth0.js hands over after the Auth0 login, for a person who came from `link`.
const idpUser = link => ({
  email: 'jo@example.com',
  firstName: 'Jo',
  lastName: 'Iner',
  idpToken: 'idp-token',
  defaultReturn: '/',
  defaultConfirm: '/confirm',
  ...link,
});
const FROM_BUYER_SIGNUP = { userType: 'buyer' };
const FROM_CREATOR_SIGNUP = { userType: 'creative-seller' };
const FROM_OTHER_BRAND_LINK = { userType: 'studio-brand', brandStudioId: 'other-brand' };

describe('loginWithIdp, a person with no Sharetribe account', () => {
  let sdkLoginWithIdp;
  let lookupUser;
  let res;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    sdkLoginWithIdp = jest.fn().mockRejectedValue(new Error('No Sharetribe account'));
    sharetribeSdk.createInstance.mockReturnValue({ loginWithIdp: sdkLoginWithIdp });
    lookupUser = jest.fn().mockResolvedValue(null);
    StudioManagerClient.mockImplementation(() => ({ lookupUser }));
    res = { cookie: jest.fn(), redirect: jest.fn() };
  });

  const signUp = link => loginWithIdp(null, idpUser(link), {}, res, 'client-id', 'auth0');
  const authInfo = () => {
    expect(res.cookie).toHaveBeenCalledWith('st-authinfo', expect.any(Object), expect.any(Object));
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/\/confirm#$/));
    return res.cookie.mock.calls[0][1];
  };
  const asToday = link => ({
    email: 'jo@example.com',
    firstName: 'Jo',
    lastName: 'Iner',
    idpToken: 'idp-token',
    idpId: 'auth0',
    userType: link.userType,
    brandStudioId: link.brandStudioId,
  });

  it.each([
    ['/signup/buyer', FROM_BUYER_SIGNUP],
    ['/signup/creative-seller', FROM_CREATOR_SIGNUP],
    ["another brand's invitation link", FROM_OTHER_BRAND_LINK],
  ])("sends a webapp brand member who came from %s to their brand's sign-up", async (_, link) => {
    lookupUser.mockResolvedValue({ id: 'user-1', type: 'BRAND', brandId: 'brand-1' });

    await signUp(link);

    expect(lookupUser).toHaveBeenCalledWith('jo@example.com');
    expect(authInfo()).toEqual({
      ...asToday(link),
      userType: 'studio-brand',
      brandStudioId: 'brand-1',
    });
  });

  it.each([
    ['/signup/buyer', FROM_BUYER_SIGNUP],
    ["a brand's invitation link", FROM_OTHER_BRAND_LINK],
  ])('sends a webapp creator who came from %s to the creator sign-up', async (_, link) => {
    lookupUser.mockResolvedValue({ id: 'user-1', type: 'CREATOR', brandId: null });

    await signUp(link);

    expect(authInfo()).toEqual({
      ...asToday(link),
      userType: 'creative-seller',
      brandStudioId: undefined,
    });
  });

  it.each([
    ['nobody (or a failed call)', null],
    ['a brand user with no brand', { id: 'user-1', type: 'BRAND', brandId: null }],
    ['a user with no type', { id: 'user-1', type: null, brandId: null }],
  ])('carries on as today when the webapp finds %s', async (_, webappUser) => {
    lookupUser.mockResolvedValue(webappUser);

    await signUp(FROM_OTHER_BRAND_LINK);

    expect(authInfo()).toEqual(asToday(FROM_OTHER_BRAND_LINK));
  });

  it('carries on as today, and logs it, when the lookup throws', async () => {
    const error = new Error('webapp down');
    lookupUser.mockRejectedValue(error);

    await signUp(FROM_BUYER_SIGNUP);

    expect(authInfo()).toEqual(asToday(FROM_BUYER_SIGNUP));
    expect(log.error).toHaveBeenCalledWith(error, 'webapp-user-lookup-failed');
  });

  it('never asks the webapp when the person has a Sharetribe account', async () => {
    sdkLoginWithIdp.mockResolvedValue({ status: 200 });

    await signUp(FROM_BUYER_SIGNUP);

    expect(lookupUser).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/\/#$/));
  });
});
