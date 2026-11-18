jest.mock('../log', () => ({ error: jest.fn(), info: jest.fn() }));
jest.mock('../api-util/auth0Helper', () => ({
  getAuth0User: jest.fn(),
  deleteAuth0User: jest.fn(),
}));

const { SignJWT } = require('jose');
const log = require('../log');
const { getAuth0User, deleteAuth0User } = require('../api-util/auth0Helper');
const { session, continueLogin, cancel } = require('./account-linking');

// spec/v0/account-linking.md §5.1–§5.4, §5.6 (§10, 2.3 and 2.4)
const SECRET = 'test-linking-secret';
const PASSWORD = { connection: 'Username-Password-Authentication', provider: 'auth0' };
const ORIGINAL = {
  user_id: 'auth0|orig',
  email: 'ana@example.com',
  created_at: '2025-01-10T10:00:00.000Z',
  identities: [{ provider: 'auth0', user_id: 'orig' }],
};
const PENDING = {
  user_id: 'google-oauth2|111',
  email: 'ana@example.com',
  created_at: '2026-11-20T09:59:00.000Z',
  identities: [{ provider: 'google-oauth2', user_id: '111' }],
};
const CLAIMS = {
  email: 'ana@example.com',
  newAccount: { id: PENDING.user_id, connection: 'google-oauth2', provider: 'google-oauth2' },
  original: { id: ORIGINAL.user_id, methods: [PASSWORD] },
  app: 'Sharetribe (QA)',
  host: 'login.example.com',
  request: { client_id: 'client-1', redirect_uri: 'https://market.example/cb', state: 'xyz' },
};
const PAGE = {
  email: 'ana@example.com',
  app: 'Sharetribe (QA)',
  newMethod: 'google',
  methods: [{ connection: 'Username-Password-Authentication', kind: 'password' }],
};

const sign = (claims = CLAIMS) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(SECRET));

let res;
let token;
beforeAll(async () => {
  process.env.AUTH0_LINKING_TOKEN_SECRET = SECRET;
  process.env.REACT_APP_MARKETPLACE_ROOT_URL = 'https://market.example';
  process.env.AUTH0_MARKETPLACE_CLIENT_ID = 'marketplace-client';
  token = await sign();
});
beforeEach(() => {
  res = {};
  ['status', 'json'].forEach(method => {
    res[method] = jest.fn(() => res);
  });
  // `resetMocks` wipes implementations before each test, so they're set here
  getAuth0User.mockImplementation(
    async id => ({ [ORIGINAL.user_id]: ORIGINAL, [PENDING.user_id]: PENDING }[id] || null)
  );
  deleteAuth0User.mockResolvedValue(undefined);
});

const answered = () => [res.status.mock.calls[0][0], res.json.mock.calls[0][0]];
// What every log line carries: the Auth0 ids, never the email or the token (§5.6)
const expectPrivateLogs = () => {
  const lines = JSON.stringify([
    log.info.mock.calls,
    log.error.mock.calls.map(([, code, data]) => [code, data]),
  ]);
  expect(lines).not.toMatch(/ana@example\.com/);
  expect(lines).not.toContain(token);
};

describe('POST /api/account-linking/session', () => {
  it('shows the offer: the email, the app and the original’s methods, and logs it', async () => {
    await session({ body: { token } }, res);

    expect(answered()).toEqual([200, PAGE]);
    expect(log.info).toHaveBeenCalledWith('account-linking offered', {
      source: 'account-linking',
      step: 'offered',
      newAccount: PENDING.user_id,
      original: ORIGINAL.user_id,
      app: 'Sharetribe (QA)',
    });
    expectPrivateLogs();
  });

  it('with wrong-account and the token: the message, then the same offer again', async () => {
    await session({ body: { token, error: 'wrong-account' } }, res);
    expect(answered()).toEqual([200, { error: 'wrong-account', ...PAGE }]);
  });

  it.each(['blocked', 'expired'])('with %s (no token): just that state', async error => {
    await session({ body: { error } }, res);
    expect(answered()).toEqual([200, { error }]);
    expect(log.info).toHaveBeenCalledWith(
      `account-linking ${error}`,
      expect.objectContaining({ step: error })
    );
  });

  it('with unavailable: that state, logged as an error, since every login is stopped (D29)', async () => {
    await session({ body: { error: 'unavailable' } }, res);
    expect(answered()).toEqual([200, { error: 'unavailable' }]);
    expect(log.error).toHaveBeenCalledWith(expect.any(Error), 'account-linking-unavailable');
  });

  it.each([['an invalid token', 'garbage'], ['no token', undefined]])(
    'with %s: the expired state',
    async (_, bad) => {
      await session({ body: { token: bad } }, res);
      expect(answered()).toEqual([200, { error: 'expired' }]);
    }
  );
});

describe('POST /api/account-linking/continue', () => {
  it("answers the login address for one of the original's methods, and logs it", async () => {
    await continueLogin({ body: { token, connection: 'Username-Password-Authentication' } }, res);

    const [status, { url }] = answered();
    expect(status).toBe(200);
    const address = new URL(url);
    expect(`${address.origin}${address.pathname}`).toBe('https://login.example.com/authorize');
    expect(address.searchParams.get('link_token')).toBe(token);
    expect(address.searchParams.get('connection')).toBe('Username-Password-Authentication');
    expect(log.info).toHaveBeenCalledWith(
      'account-linking continue',
      expect.objectContaining({ connection: 'Username-Password-Authentication' })
    );
    expectPrivateLogs();
  });

  // Auth0 refuses the whole login when an `ext-` parameter breaks its rules (D30): a value must match
  // /^[-\w.*~@+ /:]{1,255}$/, a name /^ext-[\w-]{1,28}$/, and there are at most 10. The fake Auth0 in these tests
  // can't refuse anything, so the rules are checked here, on a token shaped like a real one: the app's own ext-mp-*
  // parameters are replayed with the rest of its request.
  it("keeps every ext- parameter within Auth0's rules; the token travels in link_token", async () => {
    const realistic = await sign({
      ...CLAIMS,
      request: {
        ...CLAIMS.request,
        'ext-mp-default-confirm': '/confirm',
        'ext-mp-default-return': '/',
      },
    });
    await continueLogin(
      { body: { token: realistic, connection: 'Username-Password-Authentication' } },
      res
    );

    const params = new URL(answered()[1].url).searchParams;
    const ext = [...params].filter(([name]) => name.startsWith('ext-'));
    expect(ext.length).toBeLessThanOrEqual(10);
    ext.forEach(([name, value]) => {
      expect(name).toMatch(/^ext-[\w-]{1,28}$/);
      expect(value).toMatch(/^[-\w.*~@+ /:]{1,255}$/);
    });
    expect(params.get('link_token')).toBe(realistic);
  });

  it("refuses a method the original doesn't have (D2)", async () => {
    await continueLogin({ body: { token, connection: 'google-oauth2' } }, res);
    expect(answered()).toEqual([400, { error: 'unknownMethod' }]);
  });

  it('refuses an invalid token', async () => {
    await continueLogin(
      { body: { token: 'garbage', connection: 'Username-Password-Authentication' } },
      res
    );
    expect(answered()).toEqual([401, { error: 'expired' }]);
  });
});

describe('POST /api/account-linking/cancel', () => {
  it("deletes the pending new account, then sends the browser through Auth0's logout", async () => {
    await cancel({ body: { token } }, res);

    expect(getAuth0User.mock.calls).toEqual([[PENDING.user_id], [ORIGINAL.user_id]]);
    expect(deleteAuth0User).toHaveBeenCalledWith(PENDING.user_id);
    const [status, { logoutUrl }] = answered();
    expect(status).toBe(200);
    expect(logoutUrl).toBe(
      'https://login.example.com/v2/logout?client_id=marketplace-client&returnTo=https%3A%2F%2Fmarket.example%2Faccount-linking%3Fstate%3Dcancelled'
    );
    expect(log.info).toHaveBeenCalledWith('account-linking cancelled', {
      source: 'account-linking',
      step: 'cancelled',
      newAccount: PENDING.user_id,
      original: ORIGINAL.user_id,
    });
    expectPrivateLogs();
  });

  it('refuses when the new account is already gone (a second click, linked in another tab): a normal step, not an error', async () => {
    getAuth0User.mockImplementation(async id => (id === ORIGINAL.user_id ? ORIGINAL : null));

    await cancel({ body: { token } }, res);

    expect(deleteAuth0User).not.toHaveBeenCalled();
    expect(answered()).toEqual([409, { error: 'notPending' }]);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith('account-linking cancel-gone', {
      source: 'account-linking',
      step: 'cancel-gone',
      newAccount: PENDING.user_id,
      original: ORIGINAL.user_id,
    });
  });

  it.each([
    [
      'is already linked (two login methods)',
      { ...PENDING, identities: [...PENDING.identities, { provider: 'auth0' }] },
    ],
    ['has another email', { ...PENDING, email: 'someone@else.com' }],
    ['is older than the original', { ...PENDING, created_at: '2024-01-01T00:00:00.000Z' }],
  ])('refuses to delete an account that %s (§5.4)', async (_, pending) => {
    getAuth0User.mockImplementation(async id => (id === ORIGINAL.user_id ? ORIGINAL : pending));

    await cancel({ body: { token } }, res);

    expect(deleteAuth0User).not.toHaveBeenCalled();
    expect(answered()).toEqual([409, { error: 'notPending' }]);
    expect(log.error).toHaveBeenCalledWith(expect.any(Error), 'account-linking-cancel-refused', {
      newAccount: PENDING.user_id,
      original: ORIGINAL.user_id,
    });
    expectPrivateLogs();
  });

  it('answers 502 when Auth0 fails, and deletes nothing', async () => {
    const failure = new Error('Auth0 down');
    getAuth0User.mockRejectedValue(failure);

    await cancel({ body: { token } }, res);

    expect(deleteAuth0User).not.toHaveBeenCalled();
    expect(answered()).toEqual([502, { error: 'auth0Failed' }]);
    expect(log.error).toHaveBeenCalledWith(
      failure,
      'account-linking-cancel-failed',
      expect.any(Object)
    );
  });

  it('refuses an invalid token without asking Auth0', async () => {
    await cancel({ body: { token: 'garbage' } }, res);
    expect(getAuth0User).not.toHaveBeenCalled();
    expect(answered()).toEqual([401, { error: 'expired' }]);
  });
});
