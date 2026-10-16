const http = require('http');
const https = require('https');
const sharetribeSdk = require('sharetribe-flex-sdk');
const { handleError, serialize, typeHandlers } = require('../../api-util/sdk');
const { USER_TYPES } = require('../../api-util/metadataHelper');
const { UNFINISHED_SIGNUP_CODE, finishSignup } = require('./finishSignup');
const {
  INVALID_INVITATION_CODE,
  isUnknownBrand,
  lookUpWebappUser,
  signupFromWebapp,
} = require('./webappSignup');

const CLIENT_ID = process.env.REACT_APP_SHARETRIBE_SDK_CLIENT_ID;
const CLIENT_SECRET = process.env.SHARETRIBE_SDK_CLIENT_SECRET;
const TRANSIT_VERBOSE = process.env.REACT_APP_SHARETRIBE_SDK_TRANSIT_VERBOSE === 'true';
const USING_SSL = process.env.REACT_APP_SHARETRIBE_USING_SSL === 'true';
const BASE_URL = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;
const AUTH0_CLIENT_ID = process.env.AUTH0_MARKETPLACE_CLIENT_ID;
const AUTH0_IDP_ID = process.env.AUTH0_IDP_ID;

// Instantiate HTTP(S) Agents with keepAlive set to true.
// This will reduce the request time for consecutive requests by
// reusing the existing TCP connection, thus eliminating the time used
// for setting up new TCP connections.
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const baseUrl = BASE_URL ? { baseUrl: BASE_URL } : {};

// A refused sign-up: the confirm page shows the page for `message`, its code
// (AuthenticationPage.js).
const SIGNUP_REFUSED = 'SignupRefused';
const SESSION_EXPIRED_CODE = 'session-expired';
const refuse = (res, status, code) =>
  res
    .status(status)
    .json({ name: SIGNUP_REFUSED, message: code, status })
    .end();

// The server decides the account's type and brand, never the browser: the body and the
// `st-authinfo` cookie are both the browser's (spec/v0/login-and-registration.md §10.2.3). What the
// webapp knows wins; the person's own choice (`link`, the type and invitation the form sent)
// counts only where the webapp leaves it to them. The rest of the body is the form's fields.
const withServerSignup = (body, link, webappSignup) => {
  const linkUserType = Object.values(USER_TYPES).includes(link.userType)
    ? link.userType
    : USER_TYPES.BUYER;
  const userType = webappSignup.userType || linkUserType;
  const brandStudioId =
    'brandStudioId' in webappSignup ? webappSignup.brandStudioId : link.brandStudioId;
  const privateData = { ...body.privateData };
  delete privateData.brandStudioId;
  return {
    ...body,
    publicData: {
      ...body.publicData,
      userType,
      // A webapp brand's admin registers it with its webapp name (§4.5.3).
      ...(webappSignup.isBrandAdmin && webappSignup.companyName
        ? { brandName: webappSignup.companyName }
        : {}),
    },
    privateData: {
      ...privateData,
      ...(userType === USER_TYPES.BRAND && brandStudioId ? { brandStudioId } : {}),
    },
  };
};

module.exports = async (req, res) => {
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
    typeHandlers,
    ...baseUrl,
  });

  const { idpToken, idpId, ...rest } = req.body || {};
  // The form's `email` is dropped: without one, Sharetribe uses the login's email from Auth0, so
  // the account can't get an address Auth0 doesn't have (spec/v0/login-and-registration.md
  // §2.6.4).
  delete rest.email;

  // Who is signing up comes from the Auth0 session (set at login, encrypted), not the browser.
  // Without one, the sign-up has expired (§2.6.3).
  const { email, sub: auth0UserId } = req.oidc?.user || {};
  if (!email) {
    return refuse(res, 401, SESSION_EXPIRED_CODE);
  }
  const link = {
    userType: rest.publicData?.userType,
    brandStudioId: rest.privateData?.brandStudioId,
  };
  const webappUser = await lookUpWebappUser(email, auth0UserId);
  const { errorCode, ...webappSignup } = signupFromWebapp(link, webappUser);
  if (errorCode) {
    return refuse(res, 403, errorCode);
  }
  // An invitation the webapp didn't decide (someone it doesn't know) is checked again: its page
  // checks it first, but a sign-up can skip that page, and an unknown brand would leave an account
  // whose join can never succeed (§4.5.2, BR8).
  const isLinkInvitation =
    !('brandStudioId' in webappSignup) &&
    link.userType === USER_TYPES.BRAND &&
    !!link.brandStudioId;
  if (isLinkInvitation && (await isUnknownBrand(link.brandStudioId))) {
    return refuse(res, 404, INVALID_INVITATION_CODE);
  }

  // Choose the idpClientId based on which authentication method is used.
  const idpClientId = idpId === AUTH0_IDP_ID ? AUTH0_CLIENT_ID : null;

  return sdk.currentUser
    .createWithIdp({ idpId, idpClientId, idpToken, ...withServerSignup(rest, link, webappSignup) })
    .then(() =>
      // After the user is created, we need to call loginWithIdp endpoint
      // so that the user will be logged in.
      sdk.loginWithIdp({
        idpId,
        idpClientId: `${idpClientId}`,
        idpToken: `${idpToken}`,
      })
    )
    .then(async apiResponse => {
      // A brand user's join (spec/v0/login-and-registration.md §4.5.1). On a failure they're
      // logged out again, and the page offers Try again.
      const { finished } = await finishSignup(sdk, tokenStore);
      if (!finished) {
        return refuse(res, 502, UNFINISHED_SIGNUP_CODE);
      }
      const { status, statusText, data } = apiResponse;
      res
        .clearCookie('st-authinfo')
        .status(status)
        .set('Content-Type', 'application/transit+json')
        .send(
          serialize({
            status,
            statusText,
            data,
          })
        )
        .end();
    })
    .catch(e => {
      handleError(res, e);
    });
};
