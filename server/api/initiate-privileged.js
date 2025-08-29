const { transactionLineItems } = require('../api-util/lineItems');
const { hasLicenseDeal } = require('../api-util/lineItemHelpers');
const { redeemVoucherForUser } = require('../api-util/voucherifyHelper');
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');

module.exports = async (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body;

  const sdk = getSdk(req, res);
  let lineItems = null;

  const listingPromise = () => sdk.listings.show({ id: bodyParams?.params?.listingId });
  const currentUserPromise = async () => {
    try {
      const currentUserResponse = await sdk.currentUser.show();
      const currentUser = currentUserResponse?.data?.data;
      const currentUserId = currentUser?.id?.uuid;
      return {
        id: currentUserId,
        email: currentUser.attributes.email,
        name: currentUser.attributes.profile.displayName || currentUser.attributes.email,
      };
    } catch (error) {
      return undefined;
    }
  };
  const currentUser = await currentUserPromise();
  const currentUserId = currentUser?.id;

  Promise.all([listingPromise(), fetchCommission(sdk)])
    .then(([showListingResponse, fetchAssetsResponse]) => {
      const listing = showListingResponse.data.data;
      const commissionAsset = fetchAssetsResponse.data.data[0];
      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};
      return {
        listing,
        commissionAsset: { providerCommission, customerCommission },
        orderData: { ...orderData, ...bodyParams.params },
      };
    })
    .then(async ({ listing, commissionAsset, orderData }) => {
      const { providerCommission, customerCommission } = commissionAsset;
      lineItems = await transactionLineItems(
        listing,
        orderData,
        providerCommission,
        customerCommission,
        currentUserId
      );
      return { listing, orderData };
    })
    .then(async ({ listing, orderData }) => {
      const listingId = listing.id.uuid;
      const licenseDealId = orderData?.licenseDealId;
      const voucherCode = orderData?.voucherCode;
      const licenseDeal =
        !isSpeculative && (await hasLicenseDeal(listingId, licenseDealId, currentUserId));
      const voucherRedemption =
        !isSpeculative && (await redeemVoucherForUser(currentUser, voucherCode, listingId));
      const licenseDealMaybe = licenseDeal ? { licenseDeal } : {};
      const voucherRedemptionMaybe = voucherRedemption
        ? { voucherRedemption: voucherRedemption.redemption }
        : {};
      const additionalProtectedData = {
        ...licenseDealMaybe,
        ...voucherRedemptionMaybe,
      };
      const trustedSdk = await getTrustedSdk(req);
      return { trustedSdk, additionalProtectedData };
    })
    .then(({ trustedSdk, additionalProtectedData }) => {
      const { params } = bodyParams;
      const protectedData = {
        ...(params?.protectedData || {}),
        ...additionalProtectedData,
      };
      // Add lineItems and additional protected data to the body params
      const body = {
        ...bodyParams,
        params: {
          ...params,
          lineItems,
          protectedData,
        },
      };
      if (isSpeculative) {
        return trustedSdk.transactions.initiateSpeculative(body, queryParams);
      }
      return trustedSdk.transactions.initiate(body, queryParams);
    })
    .then(apiResponse => {
      const { status, statusText, data } = apiResponse;
      res
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
