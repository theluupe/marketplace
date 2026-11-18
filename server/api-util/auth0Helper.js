const { ManagementClient } = require('auth0');

let client;

function getClient() {
  if (!client) {
    const opts = {
      // We need to use the Auth0 Domain, not the custom one.. More info:
      // https://github.com/auth0/node-auth0/issues/292
      domain: process.env.AUTH0_API_DOMAIN,
      clientId: process.env.AUTH0_MARKETPLACE_CLIENT_ID,
      clientSecret: process.env.AUTH0_MARKETPLACE_CLIENT_SECRET,
      // No `scope`: node-auth0 v4 ignores it and asks Auth0 for the audience only, so the token carries every scope
      // this app is granted in Auth0's dashboard: read:users, update:users and delete:users
      // (spec/v0/account-linking.md §7.2). The grant there is the only limit.
    };
    client = new ManagementClient(opts);
  }
  return client;
}

async function updateAuth0User({
  auth0UserId,
  marketId,
  studioId,
  communityId,
  firstName,
  lastName,
  displayName,
  sellerStatus,
  communityStatus,
  userType,
}) {
  try {
    const auth0 = getClient();
    const params = { id: auth0UserId };
    const appMetadata = {
      marketId,
      ...(studioId ? { studioId } : {}),
      ...(communityId ? { communityId } : {}),
      ...(sellerStatus ? { sellerStatus } : {}),
      ...(communityStatus ? { communityStatus } : {}),
      userType,
    };
    const userMetadata = {
      given_name: firstName,
      family_name: lastName,
    };
    return await auth0.users.update(params, {
      name: displayName,
      nickname: displayName,
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
  } catch (error) {
    console.error(
      `[updateAuth0User] NOT BLOCKING ERROR updating Auth0 user | userId: ${marketId} | Error:`,
      error
    );
  }
}

/** An Auth0 user by id, or null if Auth0 has none (404). Other failures throw. */
async function getAuth0User(id) {
  try {
    const { data } = await getClient().users.get({ id });
    return data;
  } catch (error) {
    if (error && error.statusCode === 404) return null;
    throw error;
  }
}

/** Deletes an Auth0 user. Account linking's Cancel only, after its checks (spec/v0/account-linking.md §5.4). */
async function deleteAuth0User(id) {
  await getClient().users.delete({ id });
}

module.exports = {
  updateAuth0User,
  getAuth0User,
  deleteAuth0User,
};
