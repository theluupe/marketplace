const { trackManagementAPIEvent } = require('../api-util/analytics');
const { ReferralAPIManagerClient: RAMClient } = require('../api-util/referralManager');
const { integrationSdkInit } = require('../api-util/scriptManager');
const { getSdk } = require('../api-util/sdk');

async function referralProgramOptIn(req, res) {
  try {
    const sdk = getSdk(req, res);
    const currentUserResponse = await sdk.currentUser.show();
    const currentUser = currentUserResponse.data.data;
    const currentUserId = currentUser?.id?.uuid;

    if (!currentUserId) {
      return res.status(401).json({
        error: 'unauthenticatedUser',
      });
    }

    const userAttributes = currentUser?.attributes || {};
    const { email, profile } = userAttributes;
    const { firstName, lastName, privateData } = profile || {};
    const { referralCode } = privateData || {};
    const withReferralCode = !!referralCode;

    if (withReferralCode) {
      return res.status(200).send({ code: referralCode });
    }

    const referralManagerClient = new RAMClient();
    const rfUser = await referralManagerClient.optIn(email, firstName, lastName);
    const { code } = rfUser || {};

    const integrationSdk = integrationSdkInit();
    await integrationSdk.users.updateProfile({
      id: currentUserId,
      privateData: {
        referralCode: code,
      },
    });
    const eventUser = { id: currentUserId, email };
    trackManagementAPIEvent('REFERRAL_PROGRAM | Auto opt-in', eventUser);
    return res.status(200).send({ code });
  } catch (error) {
    return res.status(400).send('Referral program opt-in error');
  }
}

module.exports = {
  referralProgramOptIn,
};
