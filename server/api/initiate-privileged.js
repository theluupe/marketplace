const sharetribeSdk = require('sharetribe-flex-sdk');
const { transactionLineItems } = require('../api-util/lineItems');
const { isIntentionToMakeOffer } = require('../api-util/negotiation');
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

const { Money } = sharetribeSdk.types;

const listingPromise = (sdk, id) => sdk.listings.show({ id });
const currentUserPromise = async sdk => {
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

const getFullOrderData = (orderData, bodyParams, currency) => {
  const { offerInSubunits } = orderData || {};
  const transitionName = bodyParams.transition;
  return isIntentionToMakeOffer(offerInSubunits, transitionName)
    ? {
        ...orderData,
        ...bodyParams.params,
        currency,
        offer: new Money(offerInSubunits, currency),
      }
    : { ...orderData, ...bodyParams.params };
};

const getMetadata = (orderData, transition) => {
  const { actor, offerInSubunits } = orderData || {};
  // NOTE: for now, the actor is always "provider".
  const hasActor = ['provider', 'customer'].includes(actor);
  const by = hasActor ? actor : null;
  return isIntentionToMakeOffer(offerInSubunits, transition)
    ? {
        metadata: {
          offers: [
            {
              offerInSubunits,
              by,
              transition,
            },
          ],
        },
      }
    : {};
};
module.exports = async (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body || {};
  const transitionName = bodyParams.transition;
  const sdk = getSdk(req, res);
  let lineItems = null;
  let listing = null;
  let currentUser = null;
  let currentUserId = null;
  let metadataMaybe = {};

  Promise.all([
    currentUserPromise(sdk),
    listingPromise(sdk, bodyParams?.params?.listingId),
    fetchCommission(sdk),
  ])
    .then(([currentUserResponse, showListingResponse, fetchAssetsResponse]) => {
      listing = showListingResponse.data.data;
      currentUser = currentUserResponse;
      currentUserId = currentUser?.id;
      const commissionAsset = fetchAssetsResponse.data.data[0];
      const currency = listing.attributes.price?.currency || orderData.currency;
      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};
      return {
        commissionAsset: { providerCommission, customerCommission },
        orderData: getFullOrderData(orderData, bodyParams, currency),
      };
    })
    .then(async ({ commissionAsset, orderData }) => {
      const { providerCommission, customerCommission } = commissionAsset;
      metadataMaybe = getMetadata(orderData, transitionName);
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
          ...metadataMaybe,
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
