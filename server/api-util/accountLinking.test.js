const { SignJWT } = require('jose');
const {
  verifyLinkToken,
  continueUrl,
  cancelledLogoutUrl,
  methodKind,
  pageData,
} = require('./accountLinking');

// spec/v0/account-linking.md §4.4, §5.3, §5.4 (§10, 2.1 and 2.4)
const SECRET = 'test-linking-secret';

// Signed by the Auth0 Action itself, with the same secret, at 2026-11-20T10:00:00Z: the fixture its own tests pin
// (studio etc/auth0/actions/account-linking.test.mjs). If the Action's token changes, both copies change together.
const ACTION_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFuYUBleGFtcGxlLmNvbSIsIm5ld0FjY291bnQiOnsiaWQiOiJnb29nbGUtb2F1dGgyfDExMSIsImNvbm5lY3Rpb24iOiJnb29nbGUtb2F1dGgyIiwicHJvdmlkZXIiOiJnb29nbGUtb2F1dGgyIn0sIm9yaWdpbmFsIjp7ImlkIjoiYXV0aDB8b3JpZyIsIm1ldGhvZHMiOlt7ImNvbm5lY3Rpb24iOiJVc2VybmFtZS1QYXNzd29yZC1BdXRoZW50aWNhdGlvbiIsInByb3ZpZGVyIjoiYXV0aDAifV19LCJhcHAiOiJTaGFyZXRyaWJlIChRQSkiLCJob3N0IjoibG9naW4uZXhhbXBsZS5jb20iLCJyZXF1ZXN0Ijp7ImNsaWVudF9pZCI6ImNsaWVudC0xIiwicmVkaXJlY3RfdXJpIjoiaHR0cHM6Ly9tYXJrZXQuZXhhbXBsZS9hcGkvYXV0aC9hdXRoMC9jYWxsYmFjayIsInJlc3BvbnNlX3R5cGUiOiJjb2RlIiwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBlbWFpbCIsInN0YXRlIjoieHl6Iiwibm9uY2UiOiJuLTEiLCJjb2RlX2NoYWxsZW5nZSI6ImNjIiwiY29kZV9jaGFsbGVuZ2VfbWV0aG9kIjoiUzI1NiJ9LCJpYXQiOjE3OTUxNjg4MDAsImV4cCI6MTc5NTE2OTcwMH0.PJ7oHKvLsNun-eZlRRrlan9n-zdYkhDtsfmKz-UXMiM';
const ACTION_CLAIMS = {
  email: 'ana@example.com',
  newAccount: { id: 'google-oauth2|111', connection: 'google-oauth2', provider: 'google-oauth2' },
  original: {
    id: 'auth0|orig',
    methods: [{ connection: 'Username-Password-Authentication', provider: 'auth0' }],
  },
  app: 'Sharetribe (QA)',
  host: 'login.example.com',
  request: {
    client_id: 'client-1',
    redirect_uri: 'https://market.example/api/auth/auth0/callback',
    response_type: 'code',
    scope: 'openid profile email',
    state: 'xyz',
    nonce: 'n-1',
    code_challenge: 'cc',
    code_challenge_method: 'S256',
  },
  iat: 1795168800,
  exp: 1795168800 + 15 * 60,
};

const key = secret => new TextEncoder().encode(secret);
const sign = (claims, secret = SECRET) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key(secret));
const { iat, exp, ...CLAIMS } = ACTION_CLAIMS;

// The clock the Action's token was signed at, plus five minutes; promises and crypto keep running for real
const atClock = iso =>
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });

describe('verifyLinkToken', () => {
  beforeEach(() => {
    process.env.AUTH0_LINKING_TOKEN_SECRET = SECRET;
    atClock('2026-11-20T10:05:00Z');
  });
  afterEach(() => jest.useRealTimers());

  it('accepts the token the Auth0 Action signed, with every claim it put in', async () => {
    expect(await verifyLinkToken(ACTION_TOKEN)).toEqual(ACTION_CLAIMS);
  });

  it('refuses the same token once its 15 minutes are over', async () => {
    atClock('2026-11-20T10:15:01Z');
    expect(await verifyLinkToken(ACTION_TOKEN)).toBeNull();
  });

  it('refuses a token signed with another secret', async () => {
    expect(await verifyLinkToken(await sign(CLAIMS, 'not-the-secret'))).toBeNull();
  });

  it('refuses a token whose claims were changed after signing', async () => {
    const [header, , signature] = ACTION_TOKEN.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...ACTION_CLAIMS,
        original: { ...ACTION_CLAIMS.original, id: 'auth0|someone-else' },
      })
    ).toString('base64url');
    expect(await verifyLinkToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('refuses an unsigned token (alg "none")', async () => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    expect(
      await verifyLinkToken(`${encode({ alg: 'none' })}.${encode(ACTION_CLAIMS)}.`)
    ).toBeNull();
  });

  it.each([
    ['no host', { host: undefined }],
    ['a host with a path', { host: 'login.example.com/evil' }],
    ['no original', { original: undefined }],
    [
      'a method without a connection',
      { original: { id: 'auth0|orig', methods: [{ provider: 'auth0' }] } },
    ],
    ['no request', { request: undefined }],
  ])('refuses a token with %s: the page and Continue need it whole', async (_, change) => {
    expect(await verifyLinkToken(await sign({ ...CLAIMS, ...change }))).toBeNull();
  });

  it.each([undefined, '', 'garbage', 42])('refuses %p without throwing', async token => {
    expect(await verifyLinkToken(token)).toBeNull();
  });

  it("throws when the server's secret isn't set: a broken setup, not a bad token", async () => {
    delete process.env.AUTH0_LINKING_TOKEN_SECRET;
    await expect(verifyLinkToken(ACTION_TOKEN)).rejects.toThrow(
      'AUTH0_LINKING_TOKEN_SECRET is not set'
    );
  });
});

describe('continueUrl', () => {
  const params = url => Object.fromEntries(new URL(url).searchParams);

  it('keeps every parameter of the original request but the five it sets, on the same Auth0 address', () => {
    const claims = {
      ...CLAIMS,
      request: {
        ...CLAIMS.request,
        audience: 'https://api.example',
        'ext-mp-user-type': 'buyer',
        response_mode: 'query',
        prompt: 'none',
        screen_hint: 'signup',
        connection: 'google-oauth2',
        login_hint: 'someone@else.com',
        link_token: 'an-old-token',
      },
    };
    const url = continueUrl(claims, 'the-token', 'Username-Password-Authentication');

    expect(url.startsWith('https://login.example.com/authorize?')).toBe(true);
    expect(params(url)).toEqual({
      ...CLAIMS.request,
      audience: 'https://api.example',
      'ext-mp-user-type': 'buyer',
      response_mode: 'query',
      connection: 'Username-Password-Authentication',
      prompt: 'login',
      login_hint: 'ana@example.com',
      link_token: 'the-token',
    });
  });

  it("keeps a third party's request whole (Circle's shape, D22)", () => {
    const circle = {
      client_id: 'circle-client',
      redirect_uri: 'https://community.theluupe.com/oauth2/callback',
      response_type: 'code',
      scope: 'openid email profile',
      state: 'circle-state',
    };
    expect(params(continueUrl({ ...CLAIMS, request: circle }, 't', 'google-oauth2'))).toEqual({
      ...circle,
      connection: 'google-oauth2',
      prompt: 'login',
      login_hint: 'ana@example.com',
      link_token: 't',
    });
  });
});

describe('cancelledLogoutUrl', () => {
  it("goes through Auth0's logout on the login's address, back to the page's cancelled state", () => {
    process.env.REACT_APP_MARKETPLACE_ROOT_URL = 'https://market.example/';
    process.env.AUTH0_MARKETPLACE_CLIENT_ID = 'marketplace-client';
    const url = new URL(cancelledLogoutUrl(CLAIMS));

    expect(`${url.origin}${url.pathname}`).toBe('https://login.example.com/v2/logout');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'marketplace-client',
      returnTo: 'https://market.example/account-linking?state=cancelled',
    });
  });
});

describe('what the page shows', () => {
  it('names the methods the password, Google, or another (§6)', () => {
    expect(['auth0', 'google-oauth2', 'linkedin', undefined].map(methodKind)).toEqual([
      'password',
      'google',
      'other',
      'other',
    ]);
  });

  it("gives the page the email, the app and the methods, and none of the accounts' ids", () => {
    expect(pageData(CLAIMS)).toEqual({
      email: 'ana@example.com',
      app: 'Sharetribe (QA)',
      newMethod: 'google',
      methods: [{ connection: 'Username-Password-Authentication', kind: 'password' }],
    });
  });
});
