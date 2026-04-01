const sharetribeSdk = require('sharetribe-flex-sdk');
const { transactionLineItems } = require('../api-util/lineItems');
const {
  addOfferToMetadata,
  getAmountFromPreviousOffer,
  isIntentionToMakeCounterOffer,
  isIntentionToMakeOffer,
  isIntentionToRevokeCounterOffer,
  isIntentionToUpdateOffer,
  throwErrorIfNegotiationOfferHasInvalidHistory,
} = require('../api-util/negotiation');
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');

const { Money } = sharetribeSdk.types;

const transactionPromise = (sdk, id) => sdk.transactions.show({ id });
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
    };
  } catch (error) {
    return undefined;
  }
};

// When a provider is making an offer, make sure that customer related
// protected data is not being saved
const getRoleBasedBodyParams = (orderData, bodyParams) => {
  const { offerInSubunits } = orderData || {};
  const transitionName = bodyParams?.transition;
  const isProviderOffer =
    isIntentionToMakeOffer(offerInSubunits, transitionName) ||
    isIntentionToUpdateOffer(offerInSubunits, transitionName);
  if (!isProviderOffer) {
    return bodyParams;
  } else {
    const protectedData = bodyParams?.params?.protectedData || {};
    const filteredProtectedData = Object.entries(protectedData).reduce(
      (validEntries, [key, value]) => {
        if (key === 'customerDefaultMessage' || key.startsWith('customer_')) {
          return validEntries;
        } else {
          return { ...validEntries, [key]: value };
        }
      },
      {}
    );
    return {
      ...bodyParams,
      params: {
        ...bodyParams.params,
        protectedData: filteredProtectedData,
      },
    };
  }
};

const getFullOrderData = (orderData, bodyParams, currency, offers) => {
  const { offerInSubunits } = orderData || {};
  const transitionName = bodyParams.transition;
  const roleBasedBodyParams = getRoleBasedBodyParams(orderData, bodyParams);
  const orderDataAndParams = { ...orderData, ...roleBasedBodyParams.params, currency };
  const isNewOffer =
    isIntentionToMakeOffer(offerInSubunits, transitionName) ||
    isIntentionToMakeCounterOffer(offerInSubunits, transitionName) ||
    isIntentionToUpdateOffer(offerInSubunits, transitionName);
  return isNewOffer
    ? {
        ...orderDataAndParams,
        offer: new Money(offerInSubunits, currency),
      }
    : isIntentionToRevokeCounterOffer(transitionName)
    ? {
        ...orderDataAndParams,
        offer: new Money(getAmountFromPreviousOffer(offers), currency),
      }
    : orderDataAndParams;
};

const getUpdatedMetadata = (orderData, transition, existingMetadata) => {
  const { actor, offerInSubunits } = orderData || {};
  // NOTE: for default-negotiation process, the actor is always "provider" when making an offer.
  const hasActor = ['provider', 'customer'].includes(actor);
  const by = hasActor ? actor : null;
  const isNewOffer =
    isIntentionToMakeOffer(offerInSubunits, transition) ||
    isIntentionToMakeCounterOffer(offerInSubunits, transition) ||
    isIntentionToUpdateOffer(offerInSubunits, transition);
  return isNewOffer
    ? addOfferToMetadata(existingMetadata, {
        offerInSubunits,
        by,
        transition,
      })
    : isIntentionToRevokeCounterOffer(transition)
    ? addOfferToMetadata(existingMetadata, {
        offerInSubunits: getAmountFromPreviousOffer(existingMetadata.offers),
        by,
        transition,
      })
    : addOfferToMetadata(existingMetadata, null);
};

module.exports = async (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body || {};
  const sdk = getSdk(req, res);
  const transitionName = bodyParams.transition;
  let lineItems = null;
  let currentUserId = null;
  let metadataMaybe = {};

  Promise.all([
    currentUserPromise(sdk),
    listingPromise(sdk, bodyParams?.params?.listingId),
    transactionPromise(sdk, bodyParams?.id),
    fetchCommission(sdk),
  ])
    .then(
      ([
        currentUserResponse,
        showListingResponse,
        showTransactionResponse,
        fetchAssetsResponse,
      ]) => {
        const transaction = showTransactionResponse.data.data;
        const listing = showListingResponse.data.data;
        const commissionAsset = fetchAssetsResponse.data.data[0];
        currentUserId = currentUserResponse?.id;
        const existingMetadata = transaction?.attributes?.metadata;
        const existingOffers = existingMetadata?.offers || [];
        const transitions = transaction.attributes.transitions;

        // Check if the transition is related to negotiation offers and if the offers are valid
        throwErrorIfNegotiationOfferHasInvalidHistory(transitionName, existingOffers, transitions);

        const currency =
          transaction.attributes.payinTotal?.currency ||
          listing.attributes.price?.currency ||
          orderData.currency;
        const { providerCommission, customerCommission } =
          commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};
        const fullOrderData = getFullOrderData(orderData, bodyParams, currency, existingOffers);
        metadataMaybe = getUpdatedMetadata(fullOrderData, transitionName, existingMetadata);
        return {
          listing,
          commissionAsset: { providerCommission, customerCommission },
          orderData: fullOrderData,
        };
      }
    )
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
    .then(async () => {
      const additionalProtectedData = {};
      const trustedSdk = await getTrustedSdk(req);
      return { trustedSdk, additionalProtectedData };
    })
    .then(({ trustedSdk, additionalProtectedData }) => {
      // Pass role based params to make sure that protectedData only contains protected data
      // for the correct role.
      // - For the default-negotiation process, this removes any customer
      //   related protected data fields if the transition is from a provider
      // - If you customize the transaction process to allow customers to update protected data
      //   after a provider's offer, you can add that logic in this same function.
      const roleBasedBodyParams = getRoleBasedBodyParams(orderData, bodyParams);
      // Omit listingId from params (transition/request-payment-after-inquiry does not need it)
      const { listingId, ...restParams } = roleBasedBodyParams?.params || {};
      const protectedData = {
        ...(restParams?.protectedData || {}),
        ...additionalProtectedData,
      };

      // Add lineItems and additional protected data to the body params
      const body = {
        ...bodyParams,
        params: {
          ...restParams,
          lineItems,
          ...metadataMaybe,
          protectedData,
        },
      };

      if (isSpeculative) {
        return trustedSdk.transactions.transitionSpeculative(body, queryParams);
      }
      return trustedSdk.transactions.transition(body, queryParams);
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
