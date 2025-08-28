const Transloadit = require('transloadit');
const moment = require('moment');

const { getSdk, handleError } = require('../api-util/sdk');

module.exports = async (req, res) => {
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

    const authKey = process.env.TRANSLOADIT_AUTH_KEY;
    const transloadit = new Transloadit({
      authKey,
      authSecret: process.env.TRANSLOADIT_AUTH_SECRET,
    });

    const expires = moment
      .utc()
      .add(1, 'hour')
      .format('YYYY/MM/DD HH:mm:ss Z');

    const params = {
      auth: {
        key: authKey,
        expires,
      },
      template_id: process.env.TRANSLOADIT_UPLOAD_LISTING_ASSETS_TEMPLATE_ID,
      fields: {
        userId: currentUserId,
      },
    };

    const signature = transloadit.calcSignature(params);
    res
      .status(200)
      .send(signature)
      .end();
  } catch (e) {
    handleError(res, e);
  }
};
