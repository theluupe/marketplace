import React, { useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { isScrollingDisabled, manageDisableScrolling } from '../../ducks/ui.duck';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { createResourceLocatorString, pathByRouteName } from '../../util/routes';
import { PORTFOLIO_ENABLED } from '../../util/featureFlags';
import {
  GRID_STYLE_SQUARE,
  LISTING_GRID_ROLE,
  LISTING_TAB_TYPES,
  isListingTabPaused,
  isListingTabShown,
  resolveListingTabType,
} from '../../util/types';
import { hasPermissionToPostListings } from '../../util/userHelpers';
import { NO_ACCESS_PAGE_POST_LISTINGS } from '../../util/urlHelpers';

import {
  H3,
  LayoutSingleColumn,
  ListingTabs,
  NamedRedirect,
  Page,
  PortfolioListingCard,
  UserNav,
} from '../../components';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import DiscardDraftModal from './DiscardDraftModal/DiscardDraftModal';
import {
  closeListing,
  discardDraft,
  getOwnListingsById,
  openListing,
} from './ManageListingsPage.duck';
import { getCurrentCategory, getItems, getLinks, routeHandler } from './utils';

import css from './ManageListingsPage.module.css';
import ManageListingCard from './ManageListingCard/ManageListingCard';

/**
 * The ManageListingsPage component.
 *
 * @component
 * @param {Object} props
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {propTypes.uuid} props.closingListing - The closing listing
 * @param {Object} props.closingListingError - The closing listing error
 * @param {propTypes.error} props.closingListingError.listingId - The closing listing id
 * @param {propTypes.error} props.closingListingError.error - The closing listing error
 * @param {propTypes.ownListing[]} props.listings - The listings
 * @param {function} props.onCloseListing - The onCloseListing function
 * @param {function} props.onDiscardDraft - The onDiscardDraft function
 * @param {function} props.onOpenListing - The onOpenListing function
 * @param {Object} props.openingListing - The opening listing
 * @param {propTypes.uuid} props.openingListing.uuid - The opening listing uuid
 * @param {Object} props.openingListingError - The opening listing error
 * @param {propTypes.uuid} props.openingListingError.listingId - The opening listing id
 * @param {propTypes.error} props.openingListingError.error - The opening listing error
 * @param {propTypes.pagination} props.pagination - The pagination
 * @param {boolean} props.queryInProgress - Whether the query is in progress
 * @param {propTypes.error} props.queryListingsError - The query listings error
 * @param {Object} props.queryParams - The query params
 * @param {boolean} props.scrollingDisabled - Whether the scrolling is disabled
 * @param {function} props.onManageDisableScrolling - The onManageDisableScrolling function
 * @returns {JSX.Element} manage listings page component
 */
export const ManageListingsPageComponent = props => {
  const [listingMenuOpen, setListingMenuOpen] = useState(null);
  const [discardDraftModalOpen, setDiscardDraftModalOpen] = useState(null);
  const [discardDraftModalId, setDiscardDraftModalId] = useState(null);
  const routeConfiguration = useRouteConfiguration();
  const history = useHistory();
  const intl = useIntl();

  const {
    currentUser = null,
    closingListing = null,
    closingListingError = null,
    discardingDraft,
    discardingDraftError,
    listings = [],
    onCloseListing,
    onDiscardDraft,
    onOpenListing,
    openingListing = null,
    openingListingError = null,
    pagination = null,
    queryInProgress,
    queryListingsError,
    queryParams,
    scrollingDisabled,
    onManageDisableScrolling,
  } = props;
  // queryParams is the last listings query (ManageListingsPage.duck.js), not the URL.
  const currentListingType = resolveListingTabType(
    queryParams.pub_listingType,
    LISTING_GRID_ROLE.MANAGE
  );
  const isPausedTab = isListingTabPaused(currentListingType);

  const currentCategory = useMemo(
    () => getCurrentCategory(listings, currentListingType, queryParams),
    [listings, currentListingType, queryParams]
  );
  const links = useMemo(() => getLinks(listings, currentListingType), [
    listings,
    currentListingType,
  ]);
  const items = useMemo(() => getItems(listings, currentListingType, currentCategory), [
    listings,
    currentListingType,
    currentCategory,
  ]);

  function createManageLocatorString(queryParams) {
    const pathParams = {};
    const destination = createResourceLocatorString(
      'ManageListingsPage',
      routeConfiguration,
      pathParams,
      queryParams
    );
    history.replace(destination);
  }

  const { updateProductRoute, updatePortfolioRoute } = routeHandler(createManageLocatorString);

  useEffect(() => {
    const listingTypeParamValue = queryParams.pub_listingType;
    switch (listingTypeParamValue) {
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
        if (!PORTFOLIO_ENABLED) {
          // Shop is the default tab — see util/featureFlags.js. A Portfolio URL stays: its tab is
          // shown here, paused.
          if (
            invalidListingType ||
            !isListingTabShown(listingTypeParamValue, LISTING_GRID_ROLE.MANAGE)
          ) {
            updateProductRoute();
          }
          break;
        }
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

  const openDiscardDraftModal = listingId => {
    setDiscardDraftModalId(listingId);
    setDiscardDraftModalOpen(true);
  };

  const handleDiscardDraft = () => {
    onDiscardDraft(discardDraftModalId);
    setDiscardDraftModalOpen(false);
    setDiscardDraftModalId(null);
  };

  const hasPostingRights = hasPermissionToPostListings(currentUser);
  if (!hasPostingRights) {
    return (
      <NamedRedirect
        name="NoAccessPage"
        params={{ missingAccessRight: NO_ACCESS_PAGE_POST_LISTINGS }}
      />
    );
  }

  const listingRenderer = (item, className, renderSizes, index, gridLayout = GRID_STYLE_SQUARE) => {
    switch (currentListingType) {
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
        const onToggleMenu = listing => {
          setListingMenuOpen(listing);
        };
        const handleOpenListing = listingId => {
          if (!hasPostingRights) {
            const noAccessPagePath = pathByRouteName('NoAccessPage', routeConfiguration, {
              missingAccessRight: NO_ACCESS_PAGE_POST_LISTINGS,
            });
            history.push(noAccessPagePath);
          } else {
            onOpenListing(listingId);
          }
        };
        const closingErrorListingId = !!closingListingError && closingListingError.listingId;
        const openingErrorListingId = !!openingListingError && openingListingError.listingId;
        const discardingErrorListingId = !!discardingDraftError && discardingDraft.listingId;
        const listingId = item.id.uuid;
        return (
          <ManageListingCard
            key={listingId}
            className={className}
            listing={item}
            renderSizes={renderSizes}
            isMenuOpen={!!listingMenuOpen && listingMenuOpen.id.uuid === listingId}
            actionsInProgressListingId={openingListing || closingListing || discardingDraft}
            onToggleMenu={onToggleMenu}
            onCloseListing={onCloseListing}
            onOpenListing={handleOpenListing}
            onDiscardDraft={openDiscardDraftModal}
            hasOpeningError={openingErrorListingId.uuid === listingId}
            hasClosingError={closingErrorListingId.uuid === listingId}
            hasDiscardingError={discardingErrorListingId.uuid === listingId}
            gridLayout={gridLayout}
          />
        );
      }
    }
  };

  const titleRenderer = (
    <H3 as="h1" className={css.heading}>
      <FormattedMessage id="ManageListingsPage.title" />
    </H3>
  );

  // The paused tab shows only a message (see util/featureFlags.js). The loader queried only its
  // count; "your collections are saved" is said only when that count loaded and is above 0.
  const hasPausedCollections =
    isPausedTab && !queryInProgress && !queryListingsError && pagination?.totalItems > 0;
  const noResultsMessageId = !isPausedTab
    ? 'ManageListingsPage.noResults'
    : hasPausedCollections
    ? 'ManageListingsPage.portfolioPausedCollectionsSaved'
    : 'ManageListingsPage.portfolioPaused';

  const onTabChange = key => {
    switch (key) {
      case LISTING_TAB_TYPES.PORTFOLIO:
        updatePortfolioRoute();
        break;
      case LISTING_TAB_TYPES.PRODUCT:
      default:
        updateProductRoute();
        break;
    }
  };

  return (
    <Page
      title={intl.formatMessage({ id: 'ManageListingsPage.title' })}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn
        topbar={
          <>
            <TopbarContainer />
            <UserNav currentPage="ManageListingsPage" />
          </>
        }
        footer={<FooterContainer />}
      >
        {/* The paused tab never renders listings: the counted one stays in the store, and at one
            per page its pagination would show a page link per collection. */}
        <ListingTabs
          items={isPausedTab ? [] : items}
          pagination={isPausedTab ? null : pagination}
          queryInProgress={queryInProgress}
          queryListingsError={isPausedTab ? null : queryListingsError}
          queryParams={queryParams}
          onTabChange={onTabChange}
          categories={isPausedTab ? [] : links}
          currentCategory={currentCategory}
          listingRenderer={listingRenderer}
          role={LISTING_GRID_ROLE.MANAGE}
          title={titleRenderer}
          noResultsMessageId={noResultsMessageId}
          loadingMessageId="ManageListingsPage.loadingOwnListings"
          errorMessageId="ManageListingsPage.queryError"
        />

        {onManageDisableScrolling && discardDraftModalOpen ? (
          <DiscardDraftModal
            id="ManageListingsPage"
            isOpen={discardDraftModalOpen}
            onManageDisableScrolling={onManageDisableScrolling}
            onCloseModal={() => setDiscardDraftModalOpen(false)}
            onDiscardDraft={handleDiscardDraft}
            focusElementId={
              discardDraftModalId ? `discardButton_${discardDraftModalId.uuid}` : null
            }
          />
        ) : null}
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  const { currentUser } = state.user;
  const {
    pagination,
    queryParams,
    currentPageResultIds,
    queryInProgress,
    queryListingsError,
    openingListing,
    openingListingError,
    closingListing,
    closingListingError,
    discardingDraft,
    discardingDraftError,
  } = state.ManageListingsPage;
  const listings = getOwnListingsById(state, currentPageResultIds);
  return {
    currentUser,
    currentPageResultIds,
    listings,
    pagination,
    queryInProgress,
    queryListingsError,
    queryParams,
    scrollingDisabled: isScrollingDisabled(state),
    openingListing,
    openingListingError,
    closingListing,
    closingListingError,
    discardingDraft,
    discardingDraftError,
  };
};

const mapDispatchToProps = dispatch => ({
  onCloseListing: listingId => dispatch(closeListing(listingId)),
  onOpenListing: listingId => dispatch(openListing(listingId)),
  onDiscardDraft: listingId => dispatch(discardDraft(listingId)),
  onManageDisableScrolling: (componentId, disableScrolling) =>
    dispatch(manageDisableScrolling(componentId, disableScrolling)),
});

const ManageListingsPage = compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(ManageListingsPageComponent);

export default ManageListingsPage;
