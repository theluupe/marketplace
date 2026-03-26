import React, { useState } from 'react';
import { bool, func, object, string } from 'prop-types';
import { Form as FinalForm } from 'react-final-form';

// Import contexts and util modules
import { FormattedMessage, intlShape } from '../../util/reactIntl';
import { pathByRouteName } from '../../util/routes';
import { pickTransactionFieldsData } from '../../util/fieldHelpers.js';
import { propTypes } from '../../util/types';
import { ensureTransaction } from '../../util/data';
import { createSlug, parse } from '../../util/urlHelpers';
import { isTransactionInitiateListingNotFoundError } from '../../util/errors';
import { getProcess, getTransactionProcessAlias } from '../../transactions/transaction';

// Import shared components
import { Form, H3, H4, NamedLink, Page, PrimaryButton, TopbarSimplified } from '../../components';

import {
  bookingDatesMaybe,
  getShippingDetailsMaybe,
  getTransactionTypeData,
  hasTransactionPassedPendingPayment,
  processCheckoutWithoutPayment,
  setOrderPageInitialValues,
} from './CheckoutPageTransactionHelpers.js';
import { getErrorMessages } from './ErrorMessages';

import DetailsSideCard from './DetailsSideCard';
import MobileListingImage from './MobileListingImage';
import LicenseDealValidator from '../../components/LicenseDealValidator/LicenseDealValidator';

import css from './CheckoutPage.module.css';

/**
 * Prefix the properties of the chosen price variant as first level properties for the protected data of the transaction
 *
 * Since the data for the checkout is not passed in the URL (there
 * might be lots of options in the future), we must pass in the data
 * some other way. Currently the ListingPage sets the initial data
 * for the CheckoutPage's Redux store.
 *
 * For some cases (e.g. a refresh in the CheckoutPage), the Redux
 * store is empty. To handle that case, we store the received data
 * to window.sessionStorage and read it from there if no props from
 * the store exist.
 *
 * This function also sets of fetching the speculative transaction
 * based on this initial data.
 */
export const loadInitialData = ({
  pageData,
  fetchSpeculatedTransaction,
  config,
  location,
  currentUser,
}) => {
  // Fetch speculated transaction for showing price in order breakdown
  // NOTE: if unit type is line-item/item, quantity needs to be added.
  // The way to pass it to checkout page is through pageData.orderData
  const shippingDetails = {};
  const optionalPaymentParams = {};
  const orderParams = getOrderParams(
    pageData,
    shippingDetails,
    optionalPaymentParams,
    config,
    location
  );

  const tx = pageData ? pageData.transaction : null;
  const pageDataListing = pageData.listing;
  const listingProcessAlias = pageDataListing?.attributes?.publicData?.transactionProcessAlias;
  const processAlias = getTransactionProcessAlias(listingProcessAlias, currentUser);
  const processName = processAlias ? processAlias.split('/')[0] : null;
  const process = processName ? getProcess(processName) : null;

  // If transaction has passed initial state, speculated tx is not needed.
  const shouldFetchSpeculatedTransaction =
    !!pageData?.listing?.id &&
    !!pageData.orderData &&
    !!process &&
    !hasTransactionPassedPendingPayment(tx, process);

  if (shouldFetchSpeculatedTransaction) {
    const transactionId = tx ? tx.id : null;
    const requestTransition = process.transitions.REQUEST_PAYMENT;
    const isPrivileged = process.isPrivileged(requestTransition);

    fetchSpeculatedTransaction(
      orderParams,
      processAlias,
      transactionId,
      requestTransition,
      isPrivileged
    );
  }
};

/**
 * Construct orderParams object using pageData from session storage, shipping details, and optional payment params.
 * Note: This is used for both speculate transition and real transition
 *       - Speculate transition is called, when the the component is mounted. It's used to test if the data can go through the API validation
 *       - Real transition is made, when the user submits the form.
 *
 * @param {Object} pageData data that's saved to session storage.
 * @param {Object} shippingDetails shipping address if applicable.
 * @param {Object} config app-wide configs. This contains hosted configs too.
 * @returns orderParams.
 */
const getOrderParams = (
  pageData,
  shippingDetails,
  config,
  location,
  transactionFieldProtectedData,
  customerDefaultMessage
) => {
  const quantity = pageData.orderData?.quantity;
  const quantityMaybe = quantity ? { quantity } : {};
  const seats = pageData.orderData?.seats;
  const seatsMaybe = seats ? { seats } : {};
  const deliveryMethod = pageData.orderData?.deliveryMethod;
  const deliveryMethodMaybe = deliveryMethod ? { deliveryMethod } : {};
  const voucherCode = pageData.orderData?.voucherCode;
  const voucherCodeMaybe = voucherCode ? { voucherCode } : {};
  const { listingType, unitType, priceVariants } = pageData?.listing?.attributes?.publicData || {};

  // price variant data for fixed duration bookings
  const priceVariantName = pageData.orderData?.priceVariantName;
  const priceVariantNameMaybe = priceVariantName ? { priceVariantName } : {};

  // Parse licenseDeal from query parameters if location is available
  const queryParams = location ? parse(location.search) : {};
  const licenseDealId = queryParams.licenseDeal;
  const licenseDealIdMaybe = licenseDealId ? { licenseDealId } : {};
  const customerDefaultMessageMaybe = customerDefaultMessage ? { customerDefaultMessage } : {};

  const protectedDataMaybe = {
    protectedData: {
      ...getTransactionTypeData(listingType, unitType, config),
      ...deliveryMethodMaybe,
      ...shippingDetails,
      ...transactionFieldProtectedData,
      ...customerDefaultMessageMaybe,
    },
  };

  // These are the order parameters for the first transition
  const orderParams = {
    listingId: pageData?.listing?.id,
    ...deliveryMethodMaybe,
    ...quantityMaybe,
    ...seatsMaybe,
    ...bookingDatesMaybe(pageData.orderData?.bookingDates),
    ...priceVariantNameMaybe,
    ...protectedDataMaybe,
    ...licenseDealIdMaybe,
    ...voucherCodeMaybe,
  };
  return orderParams;
};

const handleSubmit = (values, process, props, submitting, setSubmitting) => {
  if (submitting) {
    return;
  }
  setSubmitting(true);

  const {
    history,
    config,
    location,
    routeConfiguration,
    currentUser,
    dispatch,
    onInitiateOrder,
    onSubmitCallback,
    pageData,
    setPageData,
    sessionStorageKey,
    transactionFieldConfigs = [],
  } = props;
  const { message, formValues } = values;
  const transactionFieldsProtectedData = {
    ...pickTransactionFieldsData(formValues, 'protected', true, transactionFieldConfigs),
  };

  const requestParams = {
    pageData,
    process,
    onInitiateOrder,
    sessionStorageKey,
    setPageData,
    currentUser,
  };
  const shippingDetails = getShippingDetailsMaybe(formValues || {});
  // These are the order parameters for the first transition
  const orderParams = getOrderParams(
    pageData,
    shippingDetails,
    config,
    location,
    transactionFieldsProtectedData,
    message
  );

  // There are multiple XHR calls that need to be made against Sharetribe Marketplace API on checkout without payments
  processCheckoutWithoutPayment(orderParams, requestParams)
    .then(response => {
      const { orderId } = response;
      setSubmitting(false);

      const orderDetailsPath = pathByRouteName('OrderDetailsPage', routeConfiguration, {
        id: orderId.uuid,
      });
      const initialValues = {};

      setOrderPageInitialValues(initialValues, routeConfiguration, dispatch);
      onSubmitCallback();
      history.push(orderDetailsPath);
    })
    .catch(err => {
      console.error(err);
      setSubmitting(false);
    });
};

/**
 * A component that renders the checkout page without payment.
 *
 * @component
 * @param {Object} props
 * @param {boolean} props.scrollingDisabled - Whether the page should scroll
 * @param {string} props.speculateTransactionError - The error message for the speculate transaction
 * @param {propTypes.transaction} props.speculatedTransaction - The speculated transaction
 * @param {string} props.initiateOrderError - The error message for the initiate order
 * @param {intlShape} props.intl - The intl object
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {Object} props.pageData - The page data
 * @param {propTypes.listing} props.pageData.listing - The listing entity
 * @param {propTypes.transaction} props.pageData.transaction - The transaction entity
 * @param {Object} props.pageData.orderData - The order data
 * @param {string} props.processName - The process name
 * @param {string} props.listingTitle - The listing title
 * @param {string} props.title - The title
 * @param {Function} props.onInitiateOrder - The function to initiate the order
 * @param {Function} props.onSubmitCallback - The function to submit the callback
 * @param {propTypes.error} props.initiateOrderError - The error message for the initiate order
 * @param {Object} props.config - The config
 * @param {Object} props.routeConfiguration - The route configuration
 * @param {Object} props.history - The history object
 * @param {Object} props.history.push - The push state function of the history object
 * @returns {JSX.Element}
 */
export const CheckoutPageWithoutPayment = props => {
  const [submitting, setSubmitting] = useState(false);

  const {
    scrollingDisabled,
    speculateTransactionError,
    speculatedTransaction: speculatedTransactionMaybe,
    initiateOrderError,
    intl,
    currentUser,
    showListingImage,
    pageData,
    processName,
    listingTitle,
    title,
    config,
  } = props;

  // Since the listing data is already given from the ListingPage
  // and stored to handle refreshes, it might not have the possible
  // deleted or closed information in it. If the transaction
  // initiate or the speculative initiate fail due to the listing
  // being deleted or closed, we should dig the information from the
  // errors and not the listing data.
  const listingNotFound =
    isTransactionInitiateListingNotFoundError(speculateTransactionError) ||
    isTransactionInitiateListingNotFoundError(initiateOrderError);

  const { listing, transaction } = pageData;
  const existingTransaction = ensureTransaction(transaction);
  const speculatedTransaction = ensureTransaction(speculatedTransactionMaybe, {}, null);

  // If existing transaction has line-items, it has gone through one of the request-payment transitions.
  // Otherwise, we try to rely on speculatedTransaction for order breakdown data.
  const tx =
    existingTransaction?.attributes?.lineItems?.length > 0
      ? existingTransaction
      : speculatedTransaction;
  const priceVariantName = tx.attributes.protectedData?.priceVariantName;

  // Hide order breakdown for no-stripe purchase process
  const breakdown = null;
  const process = processName ? getProcess(processName) : null;

  // Allow showing page when currentUser is still being downloaded,
  // but show form only when user info is loaded.
  const showForm = !!(
    currentUser &&
    !listingNotFound &&
    !initiateOrderError &&
    !speculateTransactionError
  );

  const firstImage = listing?.images?.length > 0 ? listing.images[0] : null;

  const listingLink = (
    <NamedLink
      name="ListingPage"
      params={{ id: listing?.id?.uuid, slug: createSlug(listingTitle) }}
    >
      <FormattedMessage id="CheckoutPage.errorlistingLinkText" />
    </NamedLink>
  );

  const errorMessages = getErrorMessages(
    listingNotFound,
    initiateOrderError,
    false, // isPaymentExpired - not applicable for no-payment process
    null, // retrievePaymentIntentError - not applicable
    speculateTransactionError,
    listingLink
  );

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <TopbarSimplified />
      <div className={css.contentContainer}>
        <MobileListingImage
          listingTitle={listingTitle}
          author={listing?.author}
          firstImage={firstImage}
          layoutListingImageConfig={config.layout.listingImage}
          showListingImage={showListingImage}
        />
        <main className={css.orderFormContainer}>
          <div className={css.headingContainer}>
            <H3 as="h1" className={css.heading}>
              {title}
            </H3>
            <H4 as="h2" className={css.detailsHeadingMobile}>
              <FormattedMessage id="CheckoutPage.listingTitle" values={{ listingTitle }} />
            </H4>
          </div>

          <LicenseDealValidator listingId={listing.id.uuid} currency={config.currency} />

          <section className={css.paymentContainer}>
            {errorMessages.initiateOrderErrorMessage}
            {errorMessages.listingNotFoundErrorMessage}
            {errorMessages.speculateErrorMessage}

            {showForm ? (
              <FinalForm
                onSubmit={values => handleSubmit(values, process, props, submitting, setSubmitting)}
                initialValues={{}}
                render={formRenderProps => {
                  const { handleSubmit: handleFormSubmit } = formRenderProps;
                  const submitInProgress = submitting;
                  const submitDisabled = submitInProgress || listingNotFound;

                  return (
                    <Form onSubmit={handleFormSubmit}>
                      <PrimaryButton
                        type="submit"
                        inProgress={submitInProgress}
                        disabled={submitDisabled}
                        className={css.submitButton}
                      >
                        <FormattedMessage id="CheckoutPageWithoutPayment.submitButton" />
                      </PrimaryButton>
                    </Form>
                  );
                }}
              />
            ) : null}
          </section>
        </main>

        <DetailsSideCard
          listing={listing}
          listingTitle={listingTitle}
          priceVariantName={priceVariantName}
          author={listing?.author}
          firstImage={firstImage}
          layoutListingImageConfig={config.layout.listingImage}
          speculateTransactionErrorMessage={errorMessages.speculateTransactionErrorMessage}
          isInquiryProcess={false}
          processName={processName}
          breakdown={breakdown}
          showListingImage={showListingImage}
          intl={intl}
        />
      </div>
    </Page>
  );
};

CheckoutPageWithoutPayment.defaultProps = {
  initiateOrderError: null,
};

CheckoutPageWithoutPayment.propTypes = {
  scrollingDisabled: bool.isRequired,
  initiateOrderError: propTypes.error,
  intl: intlShape.isRequired,
  listingTitle: string.isRequired,
  pageData: object.isRequired,
  processName: string.isRequired,
  title: string.isRequired,
  config: object.isRequired,
  currentUser: propTypes.currentUser,
  onInitiateOrder: func.isRequired,
  onSubmitCallback: func.isRequired,
  history: object.isRequired,
  routeConfiguration: object.isRequired,
  dispatch: func.isRequired,
  setPageData: func.isRequired,
  sessionStorageKey: string.isRequired,
  location: object,
  speculateTransactionError: propTypes.error,
  speculatedTransaction: propTypes.transaction,
};

export default CheckoutPageWithoutPayment;
