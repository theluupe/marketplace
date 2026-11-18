/**
 * The linking page's three endpoints (spec/v0/account-linking.md §5.1). Public: the page has no Marketplace login, and
 * every call needs the token the Auth0 Action signed (server/api-util/accountLinking.js).
 *
 * Each step is logged as one line (§5.6), carrying the Auth0 ids, never the email or the token.
 */
const log = require('../log');
const { getAuth0User, deleteAuth0User } = require('../api-util/auth0Helper');
const {
  verifyLinkToken,
  continueUrl,
  cancelledLogoutUrl,
  pageData,
} = require('../api-util/accountLinking');

// The errors the Action can send the person to the page with (§4.2, §4.3, §4.7)
const PAGE_ERRORS = ['expired', 'wrong-account', 'blocked', 'unavailable'];

const ids = claims => ({ newAccount: claims.newAccount.id, original: claims.original.id });
const logStep = (step, data = {}) =>
  log.info(`account-linking ${step}`, { source: 'account-linking', step, ...data });

/** POST /api/account-linking/session: what the page shows, or the state it's in (§5.2). */
async function session(req, res) {
  const { token, error } = req.body || {};
  const pageError = PAGE_ERRORS.includes(error) ? error : null;

  if (pageError === 'unavailable') {
    // The Action stopped a login because its own setup is broken: every login is stopped until it's fixed (D29, §12)
    log.error(
      new Error("A login was stopped: the account-linking Action's setup is broken (D29)"),
      'account-linking-unavailable'
    );
    return res.status(200).json({ error: 'unavailable' });
  }
  if (pageError === 'blocked' || pageError === 'expired') {
    logStep(pageError);
    return res.status(200).json({ error: pageError });
  }

  try {
    const claims = await verifyLinkToken(token);
    if (!claims) {
      logStep('expired', { reason: 'invalid or expired token' });
      return res.status(200).json({ error: 'expired' });
    }
    // With wrong-account the token came back too: the message, then the same buttons again (§5.2)
    logStep(pageError || 'offered', { ...ids(claims), app: claims.app || null });
    return res
      .status(200)
      .json({ ...(pageError ? { error: pageError } : {}), ...pageData(claims) });
  } catch (e) {
    log.error(e, 'account-linking-session-failed');
    return res.status(500).json({ error: 'failed' });
  }
}

/** POST /api/account-linking/continue: the "log in again" address for one of the original's methods (§5.3). */
async function continueLogin(req, res) {
  const { token, connection } = req.body || {};
  try {
    const claims = await verifyLinkToken(token);
    if (!claims) {
      logStep('expired', { reason: 'invalid or expired token' });
      return res.status(401).json({ error: 'expired' });
    }
    // Only the original's own methods: the page can't send the person to any other login (D2)
    if (!claims.original.methods.some(method => method.connection === connection)) {
      return res.status(400).json({ error: 'unknownMethod' });
    }
    logStep('continue', { ...ids(claims), connection });
    return res.status(200).json({ url: continueUrl(claims, token, connection) });
  } catch (e) {
    log.error(e, 'account-linking-continue-failed');
    return res.status(500).json({ error: 'failed' });
  }
}

/** POST /api/account-linking/cancel: deletes the pending new account, then Auth0's logout (§5.4). */
async function cancel(req, res) {
  const { token } = req.body || {};
  let claims;
  try {
    claims = await verifyLinkToken(token);
  } catch (e) {
    log.error(e, 'account-linking-cancel-failed');
    return res.status(500).json({ error: 'failed' });
  }
  if (!claims) {
    logStep('expired', { reason: 'invalid or expired token' });
    return res.status(401).json({ error: 'expired' });
  }

  try {
    const [pending, original] = await Promise.all([
      getAuth0User(claims.newAccount.id),
      getAuth0User(claims.original.id),
    ]);
    const refusal = cancelRefusal(pending, original, claims);
    if (refusal) {
      if (!pending) {
        // Already gone is harmless (a second click, or linked from another tab): a normal step, not a Sentry error
        logStep('cancel-gone', ids(claims));
      } else {
        log.error(
          new Error(`Cancel refused: ${refusal}`),
          'account-linking-cancel-refused',
          ids(claims)
        );
      }
      return res.status(409).json({ error: 'notPending' });
    }
    await deleteAuth0User(claims.newAccount.id);
    logStep('cancelled', ids(claims));
    return res.status(200).json({ logoutUrl: cancelledLogoutUrl(claims) });
  } catch (e) {
    log.error(e, 'account-linking-cancel-failed', ids(claims));
    return res.status(502).json({ error: 'auth0Failed' });
  }
}

// Only a pending new account is ever deleted (§5.4): it exists, has one login method (not linked), the token's email,
// and is newer than the original. The token alone isn't enough: it's 15 minutes old at most, and things change.
function cancelRefusal(pending, original, claims) {
  if (!pending) return 'the new account no longer exists';
  if (!original) return 'the original no longer exists';
  if ((pending.identities || []).length !== 1) return 'the new account is linked';
  if (pending.email !== claims.email) return 'the new account has another email';
  if (!(new Date(pending.created_at) > new Date(original.created_at))) {
    return 'the new account is not newer than the original';
  }
  return null;
}

module.exports = { session, continueLogin, cancel };
