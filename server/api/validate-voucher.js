const { getSdk, handleError } = require('../api-util/sdk');
const { validateVoucherForUser } = require('../api-util/voucherifyHelper');

module.exports = async (req, res) => {
  const { voucherCode } = req.body;

  if (!voucherCode) {
    return res.status(400).json({
      error: 'missingRequiredParameters',
    });
  }

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

    const customer = {
      id: currentUserId,
      email: currentUser.attributes.email,
      name: currentUser.attributes.profile.displayName || currentUser.attributes.email,
    };

    const validationResult = await validateVoucherForUser(customer, voucherCode);
    if (!validationResult.isValid) {
      return res.status(400).json({
        error: 'invalidVoucherCode',
        message: validationResult.error || 'Invalid voucher code',
      });
    }
    res.status(200).json({ isValid: true });
  } catch (e) {
    handleError(res, e);
  }
};
