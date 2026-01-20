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
const { getTransactionProcessAlias } = require('../api-util/transactions/transaction');

module.exports = async (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body;

  const sdk = getSdk(req, res);
  let lineItems = null;
  let listing = null;
  let currentUser = null;
  let currentUserId = null;

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
        attributes: currentUser.attributes, // Include full attributes for metadata access
      };
    } catch (error) {
      return undefined;
    }
  };

  Promise.all([currentUserPromise(), listingPromise(), fetchCommission(sdk)])
    .then(([currentUserResponse, showListingResponse, fetchAssetsResponse]) => {
      listing = showListingResponse.data.data;
      currentUser = currentUserResponse;
      currentUserId = currentUser?.id;
      const commissionAsset = fetchAssetsResponse.data.data[0];
      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};
      return {
        commissionAsset: { providerCommission, customerCommission },
        orderData: { ...orderData, ...bodyParams.params },
      };
    })
    .then(async ({ commissionAsset, orderData }) => {
      const { providerCommission, customerCommission } = commissionAsset;
      lineItems = await transactionLineItems(
        listing,
        orderData,
        providerCommission,
        customerCommission,
        currentUserId
      );
      return { orderData };
    })
    .then(async ({ orderData }) => {
      const listingProcessAlias = listing?.attributes?.publicData?.transactionProcessAlias;
      const processAlias = getTransactionProcessAlias(listingProcessAlias, currentUser);
      return { processAlias, orderData };
    })
    .then(async ({ processAlias, orderData }) => {
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
      return { processAlias, trustedSdk, additionalProtectedData };
    })
    .then(async ({ processAlias, trustedSdk, additionalProtectedData }) => {
      const { params } = bodyParams;
      const protectedData = {
        ...(params?.protectedData || {}),
        ...additionalProtectedData,
      };
      // Add lineItems and additional protected data to the body params
      const body = {
        ...bodyParams,
        processAlias, // Override processAlias if needed
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
