const { VoucherifyServerSide } = require('@voucherify/sdk')

let client;

function getClient() {
  if (!client) {
    const opts = {
      apiUrl: process.env.VOUCHERIFY_API_URL,
      applicationId: process.env.VOUCHERIFY_APPLICATION_ID,
      secretKey: process.env.VOUCHERIFY_SECRET_KEY,
    };
    client = VoucherifyServerSide(opts);
  }
  return client;
}

/**
 * Get or create a Voucherify customer for a marketplace user
 * @param {Object} user - User object with id and email
 * @returns {Object} Voucherify customer
 */
async function getCustomer(user) {
  const voucherifyClient = getClient();
  const customerId = user.id;
  try {
    return await voucherifyClient.customers.get(customerId);
  } catch (error) {
    if (error.key === 'not_found' && error.resource_id === customerId) {
      return await voucherifyClient.customers.create({
        source_id: customerId,
        email: user.email,
        name: user.name,
        metadata: {
          marketplace_user_id: user.id,
          source: 'marketplace'
        }
      });
    } else {
      throw error;
    }
  }
};

/**
 * Validate if a user can redeem a voucher code
 * @param {Object} user - User object with id and email
 * @param {string} voucherCode - The voucher code to validate
 * @returns {Object} Validation result with voucher details
 */
exports.validateVoucherForUser = async (user, voucherCode) => {
  try {
    const voucherifyClient = getClient();
    const customerId = user.id;
    const customer = await getCustomer(user);
    const validationResult = await voucherifyClient.validations.validateVoucher(voucherCode, {
      customer: {
        source_id: customerId,
      },
    });
    const { effect, type } = validationResult?.discount || {};
    const isTypeValid = type === 'PERCENT';
    const isEffectValid = effect === 'APPLY_TO_ORDER';
    if (!isTypeValid || !isEffectValid) {
      return {
        isValid: false,
        error: 'Invalid voucher type or effect',
      };
    }
    return {
      isValid: validationResult.valid,
      customer: customer,
      discount: validationResult.discount,
    };
  } catch (error) {
    console.error('Voucherify validation error:', error.message);
    return {
      isValid: false,
      error: error.message,
    };
  }
};

/**
 * Redeem a voucher code for a user with listing metadata
 * @param {Object} user - User object with id and email
 * @param {string} voucherCode - The voucher code to redeem
 * @param {string} listingId - The listing ID to add to metadata
 * @returns {Object} Redemption result
 */
exports.redeemVoucherForUser = async (user, voucherCode, listingId) => {
  const customerId = user.id;
  if (!listingId || !voucherCode || !customerId) {
    return;
  }
  try {
    const voucherifyClient = getClient();







    console.warn('\n\n\n*******************************');
    console.warn('\n[redemption] - user:', user);
    console.warn('\n[redemption] - voucherCode:', voucherCode);
    console.warn('\n[redemption] - listingId:', listingId);









    const customer = await getCustomer(user);
    console.warn('\n----------');
    console.warn('\n[redemption] - customer:', customer);
    console.warn('\n[redemption] - customerId:', customerId);











    const redemptionResult = await voucherifyClient.redemptions.redeem(
      voucherCode,
      {
        customer: {
          source_id: customerId,
        },
        metadata: {
          marketplace_listing_id: listingId,
        },
      }
    );
    const redemption = {
      id: redemptionResult.id,
      date: redemptionResult.date,
      result: redemptionResult.result,
      status: redemptionResult.status,
      voucher: {
        id: redemptionResult.voucher.id,
        code: redemptionResult.voucher.code,
        campaign: redemptionResult.voucher.campaign,
        campaign_id: redemptionResult.voucher.campaign_id,
        type: redemptionResult.voucher.type,
        discount: redemptionResult.voucher.discount,
      }
    }








    console.warn('\n[redemption] - redemptionResult:', redemptionResult);
    console.warn('\n----------');
    console.warn('\n[redemption] - redemption:', redemption);
    console.warn('\n*******************************\n\n\n');














    return {
      redemption,
      customer,
    };
  } catch (error) {







    console.warn('\n[redemption] - error:', error);
    console.warn('\n*******************************\n\n\n');








    return;
  }
};
