const { integrationSdkInit } = require('./scriptManager');

// A brand's members on the Marketplace: the accounts with its brand id, the admin excepted. The
// admin's `brandUsers` is rebuilt from this rather than trusted (spec/v0/login-and-registration.md
// §9.4.4). A deleted account isn't a member (§4.5.7): Sharetribe keeps it, marked `deleted`, and
// updating it fails.
const getBrandMemberIds = async (adminId, brandStudioId) => {
  const integrationSdk = integrationSdkInit();
  const response = await integrationSdk.users.query({ priv_brandStudioId: brandStudioId });
  return response.data.data
    .filter(user => !user.attributes.deleted && user.id.uuid !== adminId)
    .map(user => user.id.uuid);
};

module.exports = { getBrandMemberIds };
