jest.mock('sharetribe-flex-sdk', () => ({
  createInstance: jest.fn(),
  tokenStore: { expressCookieStore: jest.fn() },
}));
jest.mock('../../api-util/sdk', () => ({
  handleError: jest.fn(),
  serialize: jest.fn(data => data),
  typeHandlers: [],
}));
jest.mock('../../log.js', () => ({ error: jest.fn() }));
jest.mock('../../api-util/studioHelper', () => ({
  ...jest.requireActual('../../api-util/studioHelper'),
  StudioManagerClient: jest.fn(),
}));
jest.mock('./finishSignup', () => ({
  ...jest.requireActual('./finishSignup'),
  finishSignup: jest.fn(),
}));

const sharetribeSdk = require('sharetribe-flex-sdk');
const { StudioManagerClient } = require('../../api-util/studioHelper');
const { finishSignup } = require('./finishSignup');
const createUserWithIdp = require('./createUserWithIdp');

// The webapp lookup's answers (webapp/spec/marketplace-login-and-registration.md §2.1).
const KNOWN = { id: 'user-1', companyName: null, isBrandAdmin: false, loginMatches: true };
const MEMBER = { ...KNOWN, type: 'BRAND', brandId: 'brand-1', companyName: 'Acme' };
const CREATOR = { ...KNOWN, type: 'CREATOR', brandId: null };

describe('createUserWithIdp', () => {
  let sdk;
  let res;
  let lookupUser;
  let getBrand;
  const tokenStore = { removeToken: jest.fn() };

  beforeEach(() => {
    sdk = {
      currentUser: { createWithIdp: jest.fn().mockResolvedValue({}) },
      loginWithIdp: jest.fn().mockResolvedValue({ status: 200, statusText: 'OK', data: {} }),
    };
    sharetribeSdk.createInstance.mockReturnValue(sdk);
    sharetribeSdk.tokenStore.expressCookieStore.mockReturnValue(tokenStore);
    lookupUser = jest.fn().mockResolvedValue(null);
    getBrand = jest.fn().mockResolvedValue({ id: 'brand-9', companyName: 'Initech' });
    StudioManagerClient.mockImplementation(() => ({ lookupUser, getBrand }));
    finishSignup.mockResolvedValue({ finished: true });
    res = {};
    ['clearCookie', 'status', 'set', 'send', 'end', 'json'].forEach(method => {
      res[method] = jest.fn(() => res);
    });
  });

  // What the confirm form sends: the person's choice of type and invitation, and the form's fields.
  const signUp = async (form, session = { email: 'jo@example.com', sub: 'auth0|jo' }) => {
    await createUserWithIdp(
      {
        body: { idpToken: 'token', idpId: 'auth0', firstName: 'Jo', lastName: 'Doe', ...form },
        oidc: { user: session },
      },
      res
    );
  };
  const created = () => sdk.currentUser.createWithIdp.mock.calls[0][0];
  const refusedWith = (status, code) => {
    expect(sdk.currentUser.createWithIdp).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ name: 'SignupRefused', message: code, status });
  };

  it("ignores the form's email, so Sharetribe takes Auth0's", async () => {
    await signUp({ email: 'someone-else@example.com', publicData: { userType: 'buyer' } });

    expect(created()).not.toHaveProperty('email');
    expect(created()).toMatchObject({ idpToken: 'token', firstName: 'Jo', lastName: 'Doe' });
    expect(res.end).toHaveBeenCalled();
  });

  it("asks the webapp with the session's email and Auth0 id, not the browser's", async () => {
    await signUp({ email: 'someone-else@example.com' });

    expect(lookupUser).toHaveBeenCalledWith('jo@example.com', 'auth0|jo');
  });

  // spec/v0/login-and-registration.md §4.5.1
  it("logs the person in once the account's brand join is done", async () => {
    await signUp({ publicData: { userType: 'studio-brand' } });

    expect(finishSignup).toHaveBeenCalledWith(sdk, tokenStore);
    expect(res.send).toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith('st-authinfo');
  });

  it('refuses the sign-up, offering Try again, when the brand join fails', async () => {
    finishSignup.mockResolvedValue({ finished: false });

    await signUp({ publicData: { userType: 'studio-brand' } });

    expect(sdk.currentUser.createWithIdp).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      name: 'SignupRefused',
      message: 'unfinished-signup',
      status: 502,
    });
  });

  it('refuses as an expired sign-up without an Auth0 session (§2.6.3)', async () => {
    await createUserWithIdp({ body: { idpToken: 'token', idpId: 'auth0' } }, res);

    refusedWith(401, 'session-expired');
  });

  // spec/v0/login-and-registration.md §10.2.3
  describe("the type and the brand are the server's", () => {
    it.each([
      ['a creator', { userType: 'creative-seller' }, {}, 'creative-seller'],
      ['a buyer', { userType: 'buyer' }, {}, 'buyer'],
      ['an unknown type', { userType: 'admin' }, {}, 'buyer'],
      ['no type', {}, {}, 'buyer'],
    ])(
      "signs up %s the webapp doesn't know as their link says",
      async (_, publicData, privateData, userType) => {
        await signUp({ publicData, privateData });

        expect(created().publicData.userType).toBe(userType);
      }
    );

    it("keeps the invitation of a person the webapp doesn't know (S4)", async () => {
      await signUp({
        publicData: { userType: 'studio-brand' },
        privateData: { brandStudioId: 'brand-9', location: 'NYC' },
      });

      expect(created().publicData.userType).toBe('studio-brand');
      expect(created().privateData).toEqual({ brandStudioId: 'brand-9', location: 'NYC' });
    });

    // §4.5.2, BR8
    it("refuses an invitation whose brand the webapp doesn't know", async () => {
      getBrand.mockResolvedValue(null);

      await signUp({
        publicData: { userType: 'studio-brand' },
        privateData: { brandStudioId: 'x' },
      });

      expect(getBrand).toHaveBeenCalledWith('x');
      refusedWith(404, 'invalid-invitation');
    });

    it("carries on when the webapp can't be asked about the invitation's brand", async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      getBrand.mockRejectedValue(new Error('webapp down'));

      await signUp({
        publicData: { userType: 'studio-brand' },
        privateData: { brandStudioId: 'brand-9' },
      });

      expect(created().privateData).toEqual({ brandStudioId: 'brand-9' });
    });

    it("never checks a brand the webapp gave, nor a link that isn't an invitation", async () => {
      await signUp({ publicData: { userType: 'studio-brand' } });
      lookupUser.mockResolvedValue(MEMBER);
      await signUp({ publicData: { userType: 'buyer' } });

      expect(getBrand).not.toHaveBeenCalled();
    });

    it("drops a brand id sent with a type that isn't a brand", async () => {
      await signUp({
        publicData: { userType: 'buyer' },
        privateData: { brandStudioId: 'brand-9' },
      });

      expect(created().privateData).toEqual({});
    });

    it('makes a webapp creator a creator, whatever the browser sent (§6.4)', async () => {
      lookupUser.mockResolvedValue(CREATOR);

      await signUp({ publicData: { userType: 'buyer' } });

      expect(created().publicData.userType).toBe('creative-seller');
    });

    it('puts a webapp brand member in their own brand, whatever the browser sent', async () => {
      lookupUser.mockResolvedValue(MEMBER);

      await signUp({ publicData: { userType: 'buyer', pub: 1 }, privateData: {} });

      expect(created().publicData).toEqual({ userType: 'studio-brand', pub: 1 });
      expect(created().privateData).toEqual({ brandStudioId: 'brand-1' });
    });

    it("gives a webapp brand's admin the brand's webapp name (§4.5.3)", async () => {
      lookupUser.mockResolvedValue({ ...MEMBER, isBrandAdmin: true });

      await signUp({
        publicData: { userType: 'studio-brand', brandName: 'Typed over', brandWebsite: 'acme.com' },
        privateData: { brandStudioId: 'brand-1' },
      });

      expect(created().publicData).toEqual({
        userType: 'studio-brand',
        brandName: 'Acme',
        brandWebsite: 'acme.com',
      });
    });

    it.each([
      [
        "a login that isn't theirs (§6.4.1)",
        { ...CREATOR, loginMatches: false },
        {},
        'second-login',
      ],
      [
        "another brand's invitation (BR9)",
        MEMBER,
        { publicData: { userType: 'studio-brand' }, privateData: { brandStudioId: 'brand-9' } },
        'invitation',
      ],
    ])('refuses %s', async (_, webappUser, form, code) => {
      lookupUser.mockResolvedValue(webappUser);

      await signUp(form);

      refusedWith(403, code);
    });
  });
});
