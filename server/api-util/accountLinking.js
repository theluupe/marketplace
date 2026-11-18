/**
 * Account linking, the Marketplace's side: the token the Auth0 Action signs, the "log in again" address Continue sends
 * the browser to, and Cancel's Auth0 logout. Spec: spec/v0/account-linking.md §4.4, §5.
 *
 * The Action that signs the token lives in the webapp and Studio repos (etc/auth0/actions/account-linking.js); its
 * tests hold the token this file's tests check (the fixture in server/api-util/accountLinking.test.js).
 */
const { jwtVerify, errors } = require('jose');

// The token's parameter. Not an `ext-` one: Auth0 refuses the whole login when an `ext-` value is longer than 255
// characters or holds anything but letters, digits and -_.*~@+ /:, and the token is about 1,300 (D30, found in
// phase 4.2 when it was still `ext-link-token`). The Action reads the same name (etc/auth0/actions/account-linking.js).
const LINK_TOKEN_PARAM = 'link_token';
// Continue sets these itself and drops whatever the app sent for them (§5.3, D22)
const SET_BY_CONTINUE = ['connection', 'prompt', 'login_hint', LINK_TOKEN_PARAM, 'screen_hint'];
const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function secretKey() {
  const secret = process.env.AUTH0_LINKING_TOKEN_SECRET;
  if (!secret) throw new Error('AUTH0_LINKING_TOKEN_SECRET is not set');
  // Used as UTF-8 text, not decoded, exactly as the Action's HMAC uses it (§4.4)
  return new TextEncoder().encode(secret);
}

/**
 * The token's claims if the Action signed it, it hasn't expired, and it has the shape the page needs; null otherwise.
 * A missing secret throws: that's the server's setup, not a bad token.
 */
async function verifyLinkToken(token) {
  if (typeof token !== 'string' || !token) return null;
  const key = secretKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      requiredClaims: ['exp'],
    });
    return isWellFormed(payload) ? payload : null;
  } catch (e) {
    if (e instanceof errors.JOSEError) return null; // malformed, wrong signature, wrong algorithm, expired
    throw e;
  }
}

function isWellFormed(claims) {
  const isText = value => typeof value === 'string' && value.length > 0;
  return (
    isText(claims.email) &&
    isText(claims.newAccount?.id) &&
    isText(claims.original?.id) &&
    Array.isArray(claims.original.methods) &&
    claims.original.methods.every(method => isText(method?.connection)) &&
    isText(claims.host) &&
    HOSTNAME.test(claims.host) &&
    !!claims.request &&
    typeof claims.request === 'object'
  );
}

/**
 * Where Continue sends the browser: Auth0's /authorize on the address the login came in on, with every parameter of
 * the app's original request but the five Continue sets (§5.3). Auth0 still checks the return address against the
 * app's own list.
 */
function continueUrl(claims, token, connection) {
  const params = new URLSearchParams();
  Object.entries(claims.request).forEach(([key, value]) => {
    if (SET_BY_CONTINUE.includes(key)) return;
    (Array.isArray(value) ? value : [value]).forEach(item => {
      if (item !== undefined && item !== null) params.append(key, String(item));
    });
  });
  params.set('connection', connection);
  params.set('prompt', 'login'); // the original's password even if Auth0 remembers someone (§3, step 3)
  params.set('login_hint', claims.email);
  params.set(LINK_TOKEN_PARAM, token);
  return `https://${claims.host}/authorize?${params}`;
}

/** Cancel's last step: Auth0's logout, then back to the page's "cancelled" state (§5.4, §7.1 step 4). */
function cancelledLogoutUrl(claims) {
  const root = (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/+$/, '');
  const params = new URLSearchParams({
    client_id: process.env.AUTH0_MARKETPLACE_CLIENT_ID || '',
    returnTo: `${root}/account-linking?state=cancelled`,
  });
  return `https://${claims.host}/v2/logout?${params}`;
}

/** How the page names a login method (§6): the password, Google, or "your other login method". */
function methodKind(provider) {
  if (provider === 'auth0') return 'password';
  if (provider === 'google-oauth2') return 'google';
  return 'other';
}

/** What the page shows: never the ids, which only the server needs (§5.2). */
function pageData(claims) {
  return {
    email: claims.email,
    app: claims.app || null,
    newMethod: methodKind(claims.newAccount.provider),
    methods: claims.original.methods.map(method => ({
      connection: method.connection,
      kind: methodKind(method.provider),
    })),
  };
}

module.exports = { verifyLinkToken, continueUrl, cancelledLogoutUrl, methodKind, pageData };
