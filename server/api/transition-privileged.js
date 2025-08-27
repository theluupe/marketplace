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
      return {
        id: currentUserId,
        email: currentUser.attributes.email,
        name: currentUser.attributes.profile.displayName || currentUser.attributes.email,
      };
    } catch (error) {
      return undefined;
    }
  };

  Promise.all([listingPromise(), fetchCommission(sdk), currentUserPromise()])
    .then(async ([showListingResponse, fetchAssetsResponse, currentUser]) => {
      const listing = showListingResponse.data.data;
      const commissionAsset = fetchAssetsResponse.data.data[0];
      const currentUserId = currentUser?.id;







      console.warn('\n\n\n.............................');
      console.warn('\n[transactionLineItems][1] - currentUser:', currentUser);
      console.warn('\n[transactionLineItems][1] - currentUserId:', currentUserId);
      console.warn('\n----------');








      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      lineItems = await transactionLineItems(
        listing,
        { ...orderData, ...bodyParams.params },
        providerCommission,
        customerCommission,
        currentUserId
      );

      return { listing, orderData: { ...orderData, ...bodyParams.params }, currentUser };
    })
    .then(async ({ listing, orderData, currentUser }) => {
      const listingId = listing.id.uuid;
      const licenseDealId = orderData?.licenseDealId;
      const voucherCode = orderData?.voucherCode;
      const currentUserId = currentUser?.id;









      console.warn('\n[transactionLineItems][2] - listingId:', listingId);
      console.warn('\n[transactionLineItems][2] - currentUser:', currentUser);
      console.warn('\n[transactionLineItems][2] - currentUserId:', currentUserId);
      console.warn('\n.............................\n\n\n');









  // WELCOME50


    /**
     * [TODO]
     * - Probar con comision tanto de comprador como de vendedor
     * - Quitar la comision al comprador cuando termine las pruebas
     * - Probar con una custom license (solo comision al vendedor)
     */




    /**
     * TODO:
     *  - Revisar flow de voucherify con el equipo y ver lo de los productos, etc..
     *  - Crear el ambiente de PROD
     *  - Actualizar el secret manager
     *  - Crear en PROD
     *      - Campaign
     *      - Metadata de marketplace_listing_id en el redeem
     *      - Crear rule de una vez por usuario (no se si es necesario)
     */




    // console.warn('\n\n\n.............................');
    // console.warn('\n[transactionLineItems] - providerCommissionMaybe:', providerCommissionMaybe);
    // console.warn('\n----------');
    // console.warn('\n[transactionLineItems] - customerCommissionMaybe:', customerCommissionMaybe);
    // console.warn('\n----------');
    // console.warn('\n[transactionLineItems] - lineItems:', lineItems);
    // console.warn('\n.............................\n\n\n');














      const licenseDeal = await hasLicenseDeal(listingId, licenseDealId, currentUserId);
      const voucherRedemption = await redeemVoucherForUser(currentUser, voucherCode, listingId);

      const licenseDealMaybe = licenseDeal ? { licenseDeal } : {};
      const voucherRedemptionMaybe = voucherRedemption ? { voucherRedemption } : {};
      const additionalProtectedData = {
        ...licenseDealMaybe,
        ...voucherRedemptionMaybe,
      };

      const trustedSdk = await getTrustedSdk(req);
      return { trustedSdk, additionalProtectedData };
    })
    .then(({ trustedSdk, additionalProtectedData }) => {
      // Omit listingId from params (transition/request-payment-after-inquiry does not need it)
      const { listingId, ...restParams } = bodyParams?.params || {};
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
