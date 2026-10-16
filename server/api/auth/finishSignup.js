const log = require('../../log.js');
const { isBrandJoinUnfinished, joinBrand } = require('../../api-util/brandJoin');

// The page's code (`st-autherror` at login, or the sign-up's refusal): "We couldn't finish creating
// your account", with Try again (spec/v0/login-and-registration.md §4.5.1).
const UNFINISHED_SIGNUP_CODE = 'unfinished-signup';

// Run once the person is logged in, at sign-up and at every login: a brand user whose join hasn't
// completed is joined now. If it fails, they're logged out, so nobody lands half set up; Try again
// is another login, which runs this again (§4.5.1). Answers whether they can carry on (`finished`),
// and their account as it was read (`user`). An account that can't be read lets them in, with no
// `user`: Sharetribe failing never blocks a login.
const finishSignup = async (sdk, tokenStore) => {
  let user;
  try {
    const response = await sdk.currentUser.show();
    user = response.data.data;
  } catch (e) {
    log.error(e, 'current-user-read-failed');
    return { finished: true, user: null };
  }
  if (!isBrandJoinUnfinished(user) || (await joinBrand(user.id.uuid))) {
    return { finished: true, user };
  }
  await sdk.logout().catch(e => log.error(e, 'logout-failed'));
  // The SDK keeps the token when the revoke fails for another reason than a 401.
  tokenStore.removeToken();
  return { finished: false, user };
};

module.exports = { UNFINISHED_SIGNUP_CODE, finishSignup };
