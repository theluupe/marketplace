import React, { useEffect, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

import { useConfiguration } from '../../../context/configurationContext';
import { useRouteConfiguration } from '../../../context/routeConfigurationContext';
import { handleToggleFavorites } from '../../../util/favorites';
import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { createResourceLocatorString } from '../../../util/routes';
import {
  GRID_STYLE_SQUARE,
  REVIEW_TYPE_OF_PROVIDER,
  REVIEW_TYPE_OF_CUSTOMER,
  LISTING_GRID_DEFAULTS,
  LISTING_GRID_ROLE,
  LISTING_TAB_TYPES,
  LISTING_TYPES,
} from '../../../util/types';

import {
  ListingCard,
  Reviews,
  LayoutSingleColumn,
  ListingTabs,
  PortfolioListingCard,
} from '../../../components';

import TopbarContainer from '../../TopbarContainer/TopbarContainer';
import FooterContainer from '../../FooterContainer/FooterContainer';

import {
  getLinks,
  getItems,
  getCurrentCategory,
  getMessageIds,
  getQueryStatus,
  routeHandler,
} from '../utils';

import ProfileInfo, { CreativeProfileInfo, UserProfileInfo } from './ProfileInfo';

import css from '../ProfilePage.module.css';

function SellerProfilePage({
  isCurrentUser,
  profileUser,
  userShowError,
  creativeProfile,
  queryCreativeProfileInProgress,
  queryCreativeProfileError,
  pagination = null,
  queryParams,
  queryInProgress,
  queryListingsError,
  queryReviewsInProgress,
  queryReviewsError,
  hideReviews,
  onToggleFavorites,
  isFavorite = false,
  listings = [],
  reviews = [],
  pathParams = {},
  currentUserFavorites,
  onUpdateFavorites,
  onFetchCurrentUser,
}) {
  const routeConfiguration = useRouteConfiguration();
  const config = useConfiguration();
  const location = useLocation();
  const history = useHistory();
  const intl = useIntl();

  const enableListingTabs = !userShowError && !queryCreativeProfileError;
  const defaultListingType = LISTING_GRID_DEFAULTS.TYPE(LISTING_GRID_ROLE.PROFILE);
  const currentListingType = queryParams.pub_listingType || defaultListingType;
  const userId = profileUser?.id?.uuid;
  const reviewsOfProvider = reviews.filter(r => r.attributes.type === REVIEW_TYPE_OF_PROVIDER);
  const reviewsOfCustomer = reviews.filter(r => r.attributes.type === REVIEW_TYPE_OF_CUSTOMER);
  const reviewTabsLabels = {
    ofProvider: (
      <FormattedMessage
        id="ProfilePage.reviewsFromMyCustomersTitle"
        values={{ count: reviewsOfProvider.length }}
      />
    ),
    ofCustomer: (
      <FormattedMessage
        id="ProfilePage.reviewsAsACustomerTitle"
        values={{ count: reviewsOfCustomer.length }}
      />
    ),
  };
  const creativeProfileQueryStatus = {
    queryInProgress: queryCreativeProfileInProgress,
    queryListingsError: queryCreativeProfileError,
  };
  const listingQueryStatus = { queryInProgress, queryListingsError };
  const reviewsQueryStatus = {
    queryInProgress: queryReviewsInProgress,
    queryListingsError: queryReviewsError,
  };
  const queryStatus = useMemo(
    () =>
      getQueryStatus(
        currentListingType,
        creativeProfileQueryStatus,
        listingQueryStatus,
        reviewsQueryStatus
      ),
    [currentListingType, creativeProfileQueryStatus, listingQueryStatus, reviewsQueryStatus]
  );
  const messageIds = useMemo(() => getMessageIds(currentListingType), [currentListingType]);
  const currentCategory = useMemo(
    () => getCurrentCategory(listings, currentListingType, queryParams),
    [listings, currentListingType, queryParams]
  );
  const links = useMemo(() => getLinks(userId, listings, currentListingType, reviewTabsLabels), [
    userId,
    listings,
    currentListingType,
    reviewTabsLabels,
  ]);
  const items = useMemo(
    () => getItems(listings, currentListingType, currentCategory, creativeProfile, reviews),
    [listings, currentListingType, currentCategory, creativeProfile, reviews]
  );

  function createManageLocatorString(queryParams) {
    const newPathParams = { id: userId };
    const destination = createResourceLocatorString(
      'ProfilePage',
      routeConfiguration,
      newPathParams,
      queryParams
    );
    history.replace(destination);
  }
  const {
    updateProductRoute,
    updatePortfolioRoute,
    updateReviewsRoute,
    updateProfileRoute,
  } = routeHandler(createManageLocatorString);

  useEffect(() => {
    const listingTypeParamValue = queryParams.pub_listingType;
    switch (listingTypeParamValue) {
      case LISTING_TAB_TYPES.REVIEWS: {
        const reviewsTab = queryParams.reviewsTab;
        const invalidCategoryType =
          !reviewsTab || ![REVIEW_TYPE_OF_PROVIDER, REVIEW_TYPE_OF_CUSTOMER].includes(reviewsTab);
        const shouldUpdate = invalidCategoryType;
        if (shouldUpdate) {
          updateReviewsRoute(currentCategory);
        }
        break;
      }
      case LISTING_TAB_TYPES.PROFILE: {
        break;
      }
      case LISTING_TAB_TYPES.PRODUCT: {
        const invalidCategoryType = !queryParams.pub_categoryLevel1;
        const shouldUpdateRoute = invalidCategoryType;
        if (shouldUpdateRoute) {
          updateProductRoute();
        }
        break;
      }
      default: {
        const invalidListingType = !(
          listingTypeParamValue && Object.values(LISTING_TAB_TYPES).includes(listingTypeParamValue)
        );
        const invalidCategoryType =
          listingTypeParamValue === LISTING_TAB_TYPES.PORTFOLIO && !queryParams.pub_listingId;
        const listingsAvailable = !queryInProgress && !!currentCategory;
        const shouldUpdateRoute = invalidListingType || (invalidCategoryType && listingsAvailable);
        if (shouldUpdateRoute) {
          updatePortfolioRoute(currentCategory);
        }
        break;
      }
    }
  }, [queryInProgress]);

  const listingRenderer = (item, className, _, index, gridLayout = GRID_STYLE_SQUARE) => {
    switch (currentListingType) {
      case LISTING_TAB_TYPES.REVIEWS: {
        const parsedReviews = reviews.filter(r => r.attributes.type === currentCategory);
        return (
          <div key={`${currentCategory}-${index}`} className={css.singleTabLayout}>
            <Reviews reviews={parsedReviews} />
          </div>
        );
      }
      case LISTING_TAB_TYPES.PROFILE: {
        return (
          <div key={`${currentCategory}-${index}`} className={css.singleTabLayout}>
            <UserProfileInfo user={profileUser} config={config} intl={intl} />
            <CreativeProfileInfo listing={creativeProfile} config={config} intl={intl} />
          </div>
        );
      }
      case LISTING_TAB_TYPES.PORTFOLIO: {
        return (
          <PortfolioListingCard
            key={`${currentCategory}-${index}`}
            className={className}
            item={item}
            gridLayout={gridLayout}
          />
        );
      }
      case LISTING_TAB_TYPES.PRODUCT:
      default: {
        const listingId = item.id.uuid;
        const listingType = LISTING_TYPES.PRODUCT;
        const isFavorite = currentUserFavorites?.[listingType]?.includes(listingId);
        const routingParams = { params: {}, history, routes: routeConfiguration };
        const onToggleFavorites = handleToggleFavorites({
          ...routingParams,
          listingId,
          listingType,
          onUpdateFavorites,
          onFetchCurrentUser,
          location,
        });
        return (
          <ListingCard
            key={listingId}
            className={className}
            listing={item}
            isFavorite={isFavorite}
            onToggleFavorites={onToggleFavorites}
            gridLayout={gridLayout}
          />
        );
      }
    }
  };

  const onTabChange = key => {
    switch (key) {
      case LISTING_TAB_TYPES.REVIEWS:
        updateReviewsRoute();
        break;
      case LISTING_TAB_TYPES.PROFILE:
        updateProfileRoute();
        break;
      case LISTING_TAB_TYPES.PORTFOLIO:
        updatePortfolioRoute();
        break;
      case LISTING_TAB_TYPES.PRODUCT:
      default:
        updateProductRoute();
        break;
    }
  };

  const titleRenderer = (
    <ProfileInfo
      user={profileUser}
      creativeProfile={creativeProfile}
      queryInProgress={queryCreativeProfileInProgress}
      showLinkToProfileSettingsPage={isCurrentUser}
      onToggleFavorites={onToggleFavorites}
      isFavorite={isFavorite}
      config={config}
    />
  );

  return (
    <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
      {enableListingTabs ? (
        <ListingTabs
          items={items}
          pathParams={pathParams}
          pagination={pagination}
          queryInProgress={queryStatus.queryInProgress}
          queryListingsError={queryStatus.queryListingsError}
          queryParams={queryParams}
          onTabChange={onTabChange}
          categories={links}
          currentCategory={currentCategory}
          listingRenderer={listingRenderer}
          role={LISTING_GRID_ROLE.PROFILE}
          hideReviews={hideReviews}
          title={titleRenderer}
          noResultsMessageId={messageIds.noResultsMessageId}
          loadingMessageId={messageIds.loadingMessageId}
          errorMessageId="ProfilePage.loadingDataFailed"
        />
      ) : (
        <p className={css.error}>
          <FormattedMessage id="ProfilePage.loadingDataFailed" />
        </p>
      )}
    </LayoutSingleColumn>
  );
}

export default SellerProfilePage;
