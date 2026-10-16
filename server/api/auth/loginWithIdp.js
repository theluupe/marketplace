const http = require('http');
const https = require('https');
const sharetribeSdk = require('sharetribe-flex-sdk');
const log = require('../../log.js');
const sdkUtils = require('../../api-util/sdk');
const { USER_TYPES } = require('../../api-util/metadataHelper');
const { integrationSdkInit } = require('../../api-util/scriptManager');
const { UNFINISHED_SIGNUP_CODE, finishSignup } = require('./finishSignup');
const { SECOND_LOGIN_ERROR_CODE, lookUpWebappUser, signupFromWebapp } = require('./webappSignup');

const CLIENT_ID = process.env.REACT_APP_SHARETRIBE_SDK_CLIENT_ID;
const CLIENT_SECRET = process.env.SHARETRIBE_SDK_CLIENT_SECRET;
const TRANSIT_VERBOSE = process.env.REACT_APP_SHARETRIBE_SDK_TRANSIT_VERBOSE === 'true';
const USING_SSL = process.env.REACT_APP_SHARETRIBE_USING_SSL === 'true';
const BASE_URL = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;
const rootUrl = process.env.REACT_APP_MARKETPLACE_ROOT_URL;

// Instantiate HTTP(S) Agents with keepAlive set to true.
// This will reduce the request time for consecutive requests by
// reusing the existing TCP connection, thus eliminating the time used
// for setting up new TCP connections.
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const baseUrl = BASE_URL ? { baseUrl: BASE_URL } : {};

// The login link's `from`, `defaultReturn` and `defaultConfirm` reach here unchecked (auth0.js and
// the Auth0 Action copy them), and every redirect below puts them right after the site's URL, so
// `.evil.com` would land on another host. Only a path on this site is used
// (spec/v0/login-and-registration.md §10.2.2). `//` and `/\` are refused too: harmless after the
// site's URL, but a browser reads them as another host wherever a value is used on its own.
const CONFIRM_PATH = '/confirm';
const sitePathOr = (value, fallback) =>
  typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : fallback;

// A second login method (Google after a password, say) is another Auth0 user, so it finds no
// Marketplace account while its email already has one. The form would only fail at the end with
// "email taken"; they get the error page instead (spec/v0/login-and-registration.md §8.3, BR22).
const isEmailTaken = async email => {
  try {
    const response = await integrationSdkInit().users.show({ email });
    return !!response?.data?.data;
  } catch (e) {
    // Nobody has it (404), or Sharetribe is failing: the sign-up carries on as before.
    if (e?.status !== 404) {
      log.error(e, 'email-lookup-failed');
    }
    return false;
  }
};

// A buyer or creator who logs in through a brand link: a one-time notice after login, which the
// Topbar shows from this cookie (spec/v0/login-and-registration.md §4.5.5, BR15).
const BRAND_LINK_NOTICES = {
  [USER_TYPES.BUYER]: 'registered-as-buyer',
  [USER_TYPES.SELLER]: 'registered-as-creator',
};

const sendToErrorPage = (res, code) => {
  res.cookie('st-autherror', { code }, { maxAge: 15 * 60 * 1000 }); // 15 minutes
  return res.redirect(`${rootUrl}/signup#`);
};

module.exports = (err, user, req, res, idpClientId, idpId) => {
  if (err) {
    log.error(err, 'fetching-user-data-from-idp-failed');

    // Save error details to cookie so that we can show
    // relevant information in the frontend
    return res
      .cookie(
        'st-autherror',
        {
          status: err.status,
          code: err.code,
          message: err.message,
        },
        {
          maxAge: 15 * 60 * 1000, // 15 minutes
        }
      )
      .redirect(`${rootUrl}/signup#`);
  }

  if (!user) {
    log.error(
      new Error('Failed to fetch user details from identity provider'),
      'fetching-user-data-from-idp-failed'
    );

    // Save error details to cookie so that we can show
    // relevant information in the frontend
    return res
      .cookie(
        'st-autherror',
        {
          status: 'Bad Request',
          code: 400,
          message: 'Failed to fetch user details from identity provider!',
        },
        {
          maxAge: 15 * 60 * 1000, // 15 minutes
        }
      )
      .redirect(`${rootUrl}/signup#`);
  }

  const { userType } = user;
  const from = sitePathOr(user.from, undefined);
  const defaultReturn = sitePathOr(user.defaultReturn, '/');
  const defaultConfirm = sitePathOr(user.defaultConfirm, CONFIRM_PATH);

  const tokenStore = sharetribeSdk.tokenStore.expressCookieStore({
    clientId: CLIENT_ID,
    req,
    res,
    secure: USING_SSL,
  });

  const sdk = sharetribeSdk.createInstance({
    transitVerbose: TRANSIT_VERBOSE,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    httpAgent,
    httpsAgent,
    tokenStore,
    typeHandlers: sdkUtils.typeHandlers,
    ...baseUrl,
  });

  return sdk
    .loginWithIdp({
      idpId,
      idpClientId,
      idpToken: user.idpToken,
    })
    .then(
      async response => {
        if (response.status === 200) {
          // A brand user whose join didn't complete at sign-up is joined now, or logged out
          // again and offered Try again (spec/v0/login-and-registration.md §4.5.1).
          const { finished, user: account } = await finishSignup(sdk, tokenStore);
          if (!finished) {
            return sendToErrorPage(res, UNFINISHED_SIGNUP_CODE);
          }
          const accountUserType = account?.attributes?.profile?.publicData?.userType;
          const notice = userType === USER_TYPES.BRAND && BRAND_LINK_NOTICES[accountUserType];
          if (notice) {
            res.cookie('st-authnotice', { code: notice }, { maxAge: 15 * 60 * 1000 }); // 15 minutes
          }

          // If the user was authenticated, redirect back to to LandingPage
          // We need to add # to the end of the URL because otherwise Facebook
          // login will add their defaul #_#_ which breaks the routing in frontend.

          if (from) {
            res.redirect(`${rootUrl}${from}#`);
          } else {
            res.redirect(`${rootUrl}${defaultReturn}#`);
          }
        }
      },
      // Only the login's own failure (no account) leads to the sign-up, not a failure above.
      async () => {
        // eslint-disable-next-line no-console
        console.log(
          'Authenticating with idp failed. User needs to confirm creating sign up in frontend.'
        );

        // If authentication fails, we want to create a new user with idp
        // For this we will need to pass some information to frontend so
        // that we can use that information in createUserWithIdp api call.
        // The createUserWithIdp api call is triggered from frontend
        // after showing a confirm page to user

        if (await isEmailTaken(user.email)) {
          return sendToErrorPage(res, SECOND_LOGIN_ERROR_CODE);
        }

        const webappUser = await lookUpWebappUser(user.email, user.auth0UserId);
        const { errorCode, ...webappSignup } = signupFromWebapp(
          { userType, brandStudioId: user.brandStudioId },
          webappUser
        );
        if (errorCode) {
          return sendToErrorPage(res, errorCode);
        }

        // The confirm page (/confirm) takes its user type from this cookie.

        res.cookie(
          'st-authinfo',
          {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            idpToken: user.idpToken,
            idpId,
            from,
            userType,
            brandStudioId: user.brandStudioId,
            ...webappSignup,
          },
          {
            maxAge: 15 * 60 * 1000, // 15 minutes
          }
        );

        res.redirect(`${rootUrl}${defaultConfirm}#`);
      }
    );
};
