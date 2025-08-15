const { transactionLineItems } = require('../api-util/lineItems');
const { hasLicenseDeal } = require('../api-util/lineItemHelpers');
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');

module.exports = (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body;

  const sdk = getSdk(req, res);
  let lineItems = null;

  const listingPromise = () => sdk.listings.show({ id: bodyParams?.params?.listingId });
  const currentUserPromise = async () => {
    try {
      const currentUserResponse = await sdk.currentUser.show();
      const currentUser = currentUserResponse?.data?.data;
      const currentUserId = currentUser?.id?.uuid;
      return currentUserId;
    } catch (error) {
      return undefined;
    }
  };

  Promise.all([listingPromise(), fetchCommission(sdk), currentUserPromise()])
    .then(async ([showListingResponse, fetchAssetsResponse, currentUserId]) => {
      const listing = showListingResponse.data.data;
      const commissionAsset = fetchAssetsResponse.data.data[0];

      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      lineItems = await transactionLineItems(
        listing,
        { ...orderData, ...bodyParams.params },
        providerCommission,
        customerCommission,
        currentUserId
      );

      return { listing, orderData: { ...orderData, ...bodyParams.params }, currentUserId };
    })
    .then(async ({ listing, orderData, currentUserId }) => {
      const listingId = listing.id.uuid;
      const licenseDealId = orderData?.licenseDealId;
      const licenseDeal = await hasLicenseDeal(listingId, licenseDealId, currentUserId);
      const additionalProtectedData = licenseDeal ? { licenseDeal } : {};
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
