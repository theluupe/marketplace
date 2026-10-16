jest.mock('sharetribe-flex-sdk', () => ({
  createInstance: jest.fn(),
  tokenStore: { expressCookieStore: jest.fn() },
}));
jest.mock('../../api-util/sdk', () => ({ typeHandlers: [] }));
jest.mock('../../log.js', () => ({ error: jest.fn() }));
jest.mock('../../api-util/scriptManager', () => ({ integrationSdkInit: jest.fn() }));
jest.mock('../../api-util/studioHelper', () => ({
  ...jest.requireActual('../../api-util/studioHelper'),
  StudioManagerClient: jest.fn(),
}));
jest.mock('./finishSignup', () => ({
  ...jest.requireActual('./finishSignup'),
  finishSignup: jest.fn(),
}));

process.env.REACT_APP_MARKETPLACE_ROOT_URL = 'https://market.example';

const sharetribeSdk = require('sharetribe-flex-sdk');
const log = require('../../log.js');
const { integrationSdkInit } = require('../../api-util/scriptManager');
const { StudioManagerClient } = require('../../api-util/studioHelper');
const { finishSignup } = require('./finishSignup');
const loginWithIdp = require('./loginWithIdp');

// What auth0.js hands over after the Auth0 login, for a person who came from `link`.
const idpUser = link => ({
  email: 'jo@example.com',
  auth0UserId: 'auth0|jo',
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
const FROM_OWN_BRAND_LINK = { userType: 'studio-brand', brandStudioId: 'brand-1' };
const FROM_NEW_BRAND_LINK = { userType: 'studio-brand' };

// The webapp lookup's answers (webapp/spec/marketplace-login-and-registration.md §2.1).
const KNOWN = { id: 'user-1', companyName: null, isBrandAdmin: false, loginMatches: true };
const MEMBER = { ...KNOWN, type: 'BRAND', brandId: 'brand-1', companyName: 'Acme' };
const ADMIN = { ...MEMBER, isBrandAdmin: true };
const CREATOR = { ...KNOWN, type: 'CREATOR', brandId: null };

// Sharetribe's search by email: nobody has it, unless a test says otherwise.
let showUserByEmail;
beforeEach(() => {
  showUserByEmail = jest.fn().mockRejectedValue({ status: 404 });
  integrationSdkInit.mockReturnValue({ users: { show: showUserByEmail } });
  finishSignup.mockResolvedValue({ finished: true, user: null });
});

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

  const errorPage = () => {
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/signup#');
    return res.cookie.mock.calls[0][1].code;
  };
  const brandSignup = {
    userType: 'studio-brand',
    brandStudioId: 'brand-1',
    userTypeFromWebapp: true,
  };

  // spec/v0/login-and-registration.md §4.5.3's table, row by row.
  it.each([
    ['/signup/buyer', FROM_BUYER_SIGNUP],
    ['/signup/creative-seller', FROM_CREATOR_SIGNUP],
    ["their own brand's invitation", FROM_OWN_BRAND_LINK],
  ])(
    "sends a webapp brand member who came from %s to their brand's member form",
    async (_, link) => {
      lookupUser.mockResolvedValue(MEMBER);

      await signUp(link);

      expect(lookupUser).toHaveBeenCalledWith('jo@example.com', 'auth0|jo');
      expect(authInfo()).toEqual({ ...asToday(link), ...brandSignup });
    }
  );

  it.each([
    ['/signup/buyer', FROM_BUYER_SIGNUP],
    ['the new-brand link', FROM_NEW_BRAND_LINK],
    ["their own brand's invitation", FROM_OWN_BRAND_LINK],
  ])(
    "gives a webapp brand's admin who came from %s the brand form, its name locked",
    async (_, link) => {
      lookupUser.mockResolvedValue(ADMIN);

      await signUp(link);

      expect(authInfo()).toEqual({
        ...asToday(link),
        ...brandSignup,
        isBrandAdmin: true,
        companyName: 'Acme',
      });
    }
  );

  it.each([
    ["a member, through another brand's invitation (BR9)", MEMBER, FROM_OTHER_BRAND_LINK],
    ["an admin, through another brand's invitation (BR9)", ADMIN, FROM_OTHER_BRAND_LINK],
    ['a member, through the new-brand link (BR4)', MEMBER, FROM_NEW_BRAND_LINK],
  ])('sends %s to the invitation error page', async (_, webappUser, link) => {
    lookupUser.mockResolvedValue(webappUser);

    await signUp(link);

    expect(errorPage()).toBe('invitation');
  });

  it.each([
    ['/signup/buyer', FROM_BUYER_SIGNUP],
    ['the new-brand link', FROM_NEW_BRAND_LINK],
    ["a brand's invitation", FROM_OTHER_BRAND_LINK],
  ])('sends a webapp creator who came from %s to the creator sign-up', async (_, link) => {
    lookupUser.mockResolvedValue(CREATOR);

    await signUp(link);

    expect(authInfo()).toEqual({
      ...asToday(link),
      userType: 'creative-seller',
      brandStudioId: undefined,
      userTypeFromWebapp: true,
      userTypeNotice: true,
    });
  });

  it('shows no banner to a webapp creator who came from the creator sign-up (§4.5.3)', async () => {
    lookupUser.mockResolvedValue(CREATOR);

    await signUp(FROM_CREATOR_SIGNUP);

    expect(authInfo()).toEqual({
      ...asToday(FROM_CREATOR_SIGNUP),
      brandStudioId: undefined,
      userTypeFromWebapp: true,
    });
  });

  it.each([
    ['a brand user with no brand', { ...KNOWN, type: 'BRAND', brandId: null }],
    ['a user with no type', { ...KNOWN, type: null, brandId: null }],
  ])('sends %s to the buyer sign-up, whatever the link (§6.4.3)', async (_, webappUser) => {
    lookupUser.mockResolvedValue(webappUser);

    await signUp(FROM_OTHER_BRAND_LINK);

    expect(authInfo()).toEqual({
      ...asToday(FROM_OTHER_BRAND_LINK),
      userType: 'buyer',
      brandStudioId: undefined,
      userTypeFromWebapp: true,
      userTypeNotice: true,
    });
  });

  it.each([
    ['a brand member', MEMBER],
    ['a creator', CREATOR],
    ['a user with no type', { ...KNOWN, type: null, brandId: null }],
  ])("sends %s whose login isn't theirs to the second-login page (§6.4.1)", async (_, user) => {
    lookupUser.mockResolvedValue({ ...user, loginMatches: false });

    await signUp(FROM_BUYER_SIGNUP);

    expect(errorPage()).toBe('second-login');
  });

  it('carries on as the link says when the webapp knows nobody (or the call failed)', async () => {
    lookupUser.mockResolvedValue(null);

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

describe('loginWithIdp, redirects after login stay on the site', () => {
  let sdkLoginWithIdp;
  let res;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    sdkLoginWithIdp = jest.fn();
    sharetribeSdk.createInstance.mockReturnValue({ loginWithIdp: sdkLoginWithIdp });
    StudioManagerClient.mockImplementation(() => ({
      lookupUser: jest.fn().mockResolvedValue(null),
    }));
    res = { cookie: jest.fn(), redirect: jest.fn() };
  });

  const logIn = routes => loginWithIdp(null, idpUser(routes), {}, res, 'client-id', 'auth0');
  const withAccount = () => sdkLoginWithIdp.mockResolvedValue({ status: 200 });
  const withoutAccount = () => sdkLoginWithIdp.mockRejectedValue(new Error('No account'));
  const OFF_SITE = ['.evil.com', '@evil.com', '//evil.com', '/\\evil.com', 'https://evil.com'];

  it('sends a person back to the page they came from', async () => {
    withAccount();
    await logIn({ from: '/l/some-listing/123' });
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/l/some-listing/123#');
  });

  // spec/v0/login-and-registration.md §4.5.1
  it('sends a brand user whose join still fails to Try again, not into the Marketplace', async () => {
    withAccount();
    finishSignup.mockResolvedValue({ finished: false });

    await logIn({ from: '/l/some-listing/123' });

    expect(res.cookie).toHaveBeenCalledWith(
      'st-autherror',
      { code: 'unfinished-signup' },
      expect.any(Object)
    );
    expect(res.redirect).toHaveBeenCalledTimes(1);
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/signup#');
  });

  it.each(OFF_SITE)('drops a `from` of %s and uses the default return', async from => {
    withAccount();
    await logIn({ from, defaultReturn: '/inbox' });
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/inbox#');
  });

  it.each(OFF_SITE)('replaces a `defaultReturn` of %s with the home page', async defaultReturn => {
    withAccount();
    await logIn({ defaultReturn });
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/#');
  });

  it.each(OFF_SITE)(
    'replaces a `defaultConfirm` of %s with the confirm page, and keeps no `from`',
    async defaultConfirm => {
      withoutAccount();
      await logIn({ from: '//evil.com', defaultConfirm });
      expect(res.redirect).toHaveBeenCalledWith('https://market.example/confirm#');
      expect(res.cookie.mock.calls[0][1].from).toBeUndefined();
    }
  );

  it('keeps a `from` on the site for after the sign-up', async () => {
    withoutAccount();
    await logIn({ from: '/l/some-listing/123' });
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/confirm#');
    expect(res.cookie.mock.calls[0][1].from).toBe('/l/some-listing/123');
  });
});

// spec/v0/login-and-registration.md §4.5.5, BR15
describe('loginWithIdp, an existing account through a brand link', () => {
  let res;

  beforeEach(() => {
    sharetribeSdk.createInstance.mockReturnValue({
      loginWithIdp: jest.fn().mockResolvedValue({ status: 200 }),
    });
    res = { cookie: jest.fn(), redirect: jest.fn() };
  });

  const account = userType => ({ attributes: { profile: { publicData: { userType } } } });
  const logIn = (link, userType) => {
    finishSignup.mockResolvedValue({ finished: true, user: account(userType) });
    return loginWithIdp(null, idpUser(link), {}, res, 'client-id', 'auth0');
  };

  it.each([
    ['a buyer', 'buyer', 'registered-as-buyer'],
    ['a creator', 'creative-seller', 'registered-as-creator'],
  ])('gives %s a one-time notice, and logs them in', async (_, userType, code) => {
    await logIn(FROM_OTHER_BRAND_LINK, userType);

    expect(res.cookie).toHaveBeenCalledWith('st-authnotice', { code }, expect.any(Object));
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/#');
  });

  it.each([
    ['a brand user, through a brand link', FROM_NEW_BRAND_LINK, 'studio-brand'],
    ['a buyer, through another link', FROM_BUYER_SIGNUP, 'buyer'],
  ])('gives %s no notice', async (_, link, userType) => {
    await logIn(link, userType);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/#');
  });
});

// spec/v0/login-and-registration.md §8.3, BR22
describe('loginWithIdp, a second login method', () => {
  let res;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    sharetribeSdk.createInstance.mockReturnValue({
      loginWithIdp: jest.fn().mockRejectedValue(new Error('No Sharetribe account')),
    });
    StudioManagerClient.mockImplementation(() => ({ lookupUser: jest.fn() }));
    res = { cookie: jest.fn(), redirect: jest.fn() };
  });

  const logIn = () => loginWithIdp(null, idpUser(FROM_BUYER_SIGNUP), {}, res, 'client-id', 'auth0');

  it('sends someone whose email already has an account to the error page, not the form', async () => {
    showUserByEmail.mockResolvedValue({ data: { data: { id: { uuid: 'user-1' } } } });

    await logIn();

    expect(showUserByEmail).toHaveBeenCalledWith({ email: 'jo@example.com' });
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(
      'st-autherror',
      { code: 'second-login' },
      expect.any(Object)
    );
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/signup#');
  });

  it('carries on to the form, and logs it, when the search fails', async () => {
    const error = { status: 500 };
    showUserByEmail.mockRejectedValue(error);

    await logIn();

    expect(log.error).toHaveBeenCalledWith(error, 'email-lookup-failed');
    expect(res.cookie).toHaveBeenCalledWith('st-authinfo', expect.any(Object), expect.any(Object));
    expect(res.redirect).toHaveBeenCalledWith('https://market.example/confirm#');
  });
});
