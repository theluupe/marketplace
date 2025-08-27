const { transactionLineItems } = require('../api-util/lineItems');
const { getSdk, handleError, serialize, fetchCommission } = require('../api-util/sdk');
const { constructValidLineItems } = require('../api-util/lineItemHelpers');

module.exports = async (req, res) => {
  const { isOwnListing, listingId, orderData } = req.body;

  const sdk = getSdk(req, res);

  const listingPromise = () =>
    isOwnListing ? sdk.ownListings.show({ id: listingId }) : sdk.listings.show({ id: listingId });
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
    .then(async ([showListingResponse, fetchAssetsResponse]) => {
      const listing = showListingResponse.data.data;
      const commissionAsset = fetchAssetsResponse.data.data[0];

      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      const lineItems = await transactionLineItems(
        listing,
        orderData,
        providerCommission,
        customerCommission,
        currentUserId
      );

      // Because we are using returned lineItems directly in this template we need to use the helper function
      // to add some attributes like lineTotal and reversal that Marketplace API also adds to the response.
      const validLineItems = constructValidLineItems(lineItems);

      res
        .status(200)
        .set('Content-Type', 'application/transit+json')
        .send(serialize({ data: validLineItems }))
        .end();
    })
    .catch(e => {
      handleError(res, e);
    });
};
