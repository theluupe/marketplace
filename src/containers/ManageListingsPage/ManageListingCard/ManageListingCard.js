import React from 'react';
import { useHistory } from 'react-router-dom';
import classNames from 'classnames';

import { useConfiguration } from '../../../context/configurationContext';
import { useRouteConfiguration } from '../../../context/routeConfigurationContext';
import { useIntl, FormattedMessage } from '../../../util/reactIntl';
import {
  GRID_STYLE_SQUARE,
  LISTING_STATE_DRAFT,
  LISTING_STATE_PENDING_APPROVAL,
  STOCK_MULTIPLE_ITEMS,
  propTypes,
} from '../../../util/types';
import { ensureOwnListing } from '../../../util/data';
import {
  LISTING_PAGE_DRAFT_VARIANT,
  LISTING_PAGE_PENDING_APPROVAL_VARIANT,
  LISTING_PAGE_PARAM_TYPE_DRAFT,
  LISTING_PAGE_PARAM_TYPE_EDIT,
  createSlug,
} from '../../../util/urlHelpers';
import { createResourceLocatorString, findRouteByRouteName } from '../../../util/routes';
import { isBookingProcessAlias, isPurchaseProcessAlias } from '../../../transactions/transaction';

import { NamedLink, IconSpinner } from '../../../components';

import CardMenu from './CardMenu';
import CardThumbnail from './CardThumbnail';
import Overlay from './Overlay';
import css from './ManageListingCard.module.css';

// TheLuupe: build the listing-page URL for the body-click handler. Drafts route to the draft
// preview variant; pending-approval listings to the pending-approval preview; everything else
// to the public listing page.
const createListingURL = (routes, listing) => {
  const id = listing.id.uuid;
  const slug = createSlug(listing.attributes.title);
  const isPendingApproval = listing.attributes.state === LISTING_STATE_PENDING_APPROVAL;
  const isDraft = listing.attributes.state === LISTING_STATE_DRAFT;
  const variant = isDraft
    ? LISTING_PAGE_DRAFT_VARIANT
    : isPendingApproval
    ? LISTING_PAGE_PENDING_APPROVAL_VARIANT
    : null;

  const linkProps =
    isPendingApproval || isDraft
      ? {
          name: 'ListingPageVariant',
          params: { id, slug, variant },
        }
      : {
          name: 'ListingPage',
          params: { id, slug },
        };

  return createResourceLocatorString(linkProps.name, routes, linkProps.params, {});
};

const LinkToStockOrAvailabilityTab = props => {
  const intl = useIntl();
  const { listing, listingTypeConfig } = props;

  const id = listing.id.uuid;
  const { title = '', state, publicData } = listing.attributes || {};
  const slug = createSlug(title);

  const { listingType, transactionProcessAlias } = publicData || {};
  const isDraft = state === LISTING_STATE_DRAFT;
  const isBookable = isBookingProcessAlias(transactionProcessAlias);
  const isProductOrder = isPurchaseProcessAlias(transactionProcessAlias);
  const hasListingType = !!listingType;
  const hasStockManagementInUse =
    isProductOrder && listingTypeConfig?.stockType === STOCK_MULTIPLE_ITEMS;
  const currentStock = listing?.currentStock?.attributes?.quantity;

  const editListingLinkType = isDraft
    ? LISTING_PAGE_PARAM_TYPE_DRAFT
    : LISTING_PAGE_PARAM_TYPE_EDIT;

  if (!hasListingType || !(isBookable || hasStockManagementInUse)) {
    return null;
  }

  return (
    <>
      <span className={css.manageLinksSeparator}>{' • '}</span>

      {isBookable ? (
        <NamedLink
          className={css.manageLink}
          name="EditListingPage"
          params={{ id, slug, type: editListingLinkType, tab: 'availability' }}
          ariaLabel={intl.formatMessage(
            { id: 'ManageListingCard.screenreader.manageAvailability' },
            { title }
          )}
        >
          <FormattedMessage id="ManageListingCard.manageAvailability" />
        </NamedLink>
      ) : (
        <NamedLink
          className={css.manageLink}
          name="EditListingPage"
          params={{ id, slug, type: editListingLinkType, tab: 'pricing-and-stock' }}
          ariaLabel={
            currentStock != null
              ? intl.formatMessage(
                  { id: 'ManageListingCard.screenreader.manageStock' },
                  { title, currentStock }
                )
              : intl.formatMessage(
                  { id: 'ManageListingCard.screenreader.setPriceAndStock' },
                  { title }
                )
          }
        >
          {currentStock != null ? (
            <FormattedMessage id="ManageListingCard.manageStock" values={{ currentStock }} />
          ) : (
            <FormattedMessage id="ManageListingCard.setPriceAndStock" />
          )}
        </NamedLink>
      )}
    </>
  );
};

/**
 * Manage listing card
 *
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {boolean} props.hasClosingError - Whether the closing error is present
 * @param {boolean} props.hasDiscardingError - Whether the discarding error is present
 * @param {boolean} props.hasOpeningError - Whether the opening error is present
 * @param {boolean} props.isMenuOpen - Whether the menu is open
 * @param {Object} [props.actionsInProgressListingId] - The actions in progress for the specific listing
 * @param {propTypes.uuid} [props.actionsInProgressListingId.uuid] - The uuid of the listing
 * @param {propTypes.ownListing} props.listing - The listing
 * @param {string} [props.renderSizes] - The render sizes for the ResponsiveImage component
 * @param {string} [props.gridLayout] - TheLuupe: SQUARE or MASONRY (default SQUARE). MASONRY uses
 *   the 'scaled-medium' image variant prefix and hides the info section below the thumbnail.
 * @param {function} props.onCloseListing - The function to close the listing
 * @param {function} props.onOpenListing - The function to open the listing
 * @param {function} props.onDiscardDraft - The function to discard the draft
 * @param {function} props.onToggleMenu - The function to toggle the menu
 * @returns {JSX.Element} Manage listing card component
 */
export const ManageListingCard = props => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = props.intl || useIntl();
  const history = useHistory();
  const {
    className,
    rootClassName,
    hasClosingError,
    hasDiscardingError,
    hasOpeningError,
    isMenuOpen,
    actionsInProgressListingId,
    listing,
    renderSizes,
    gridLayout = GRID_STYLE_SQUARE,
    onCloseListing,
    onOpenListing,
    onDiscardDraft,
    onToggleMenu,
  } = props;
  const classes = classNames(rootClassName || css.root, className);
  const currentListing = ensureOwnListing(listing);
  const id = currentListing.id.uuid;
  const { title = '', publicData } = currentListing.attributes;

  const { listingType } = publicData || {};

  const validListingTypes = config.listing.listingTypes;
  const listingTypeConfig = validListingTypes.find(conf => conf.listingType === listingType);
  const listingTypeLabel = listingTypeConfig?.label;

  const hasError = hasOpeningError || hasClosingError || hasDiscardingError;
  const thisListingInProgress =
    actionsInProgressListingId && actionsInProgressListingId.uuid === id;

  // TheLuupe: SQUARE grid uses the default 'listing-card' image variants; MASONRY uses
  // 'scaled-medium' to support variable-height layout. Pass the override down to CardThumbnail.
  const isSquareLayout = gridLayout === GRID_STYLE_SQUARE;
  const variantPrefix = isSquareLayout ? undefined : 'scaled-medium';

  // TheLuupe: hover/touch preload of the ListingPage chunk for snappier nav.
  const onOverListingLink = () => {
    const { component: Page } = findRouteByRouteName('ListingPage', routeConfiguration);
    if (Page?.preload) {
      Page.preload();
    }
  };

  // TheLuupe: body-click navigation. Routes drafts/pending-approval to their preview variants.
  const onBodyClick = event => {
    event.preventDefault();
    event.stopPropagation();
    history.push(createListingURL(routeConfiguration, currentListing));
  };

  return (
    <div className={classes}>
      <div className={classNames(css.thumbnailContainer)}>
        <CardThumbnail
          listing={currentListing}
          renderSizes={renderSizes}
          isBlended={isMenuOpen}
          inProgressListingId={actionsInProgressListingId}
          onCloseListing={onCloseListing}
          onOpenListing={onOpenListing}
          onDiscardDraft={onDiscardDraft}
          onClick={onBodyClick}
          onMouseOver={onOverListingLink}
          onTouchStart={onOverListingLink}
          variantPrefix={variantPrefix}
          isSquareLayout={isSquareLayout}
        />

        <CardMenu
          isMenuOpen={isMenuOpen}
          listing={currentListing}
          inProgressListingId={actionsInProgressListingId}
          onToggleMenu={onToggleMenu}
          onCloseListing={onCloseListing}
        />

        {thisListingInProgress ? (
          <Overlay>
            <IconSpinner />
          </Overlay>
        ) : hasError ? (
          <Overlay errorMessage={intl.formatMessage({ id: 'ManageListingCard.actionFailed' })} />
        ) : null}
      </div>

      {isSquareLayout && (
        <div className={css.info}>
          <div className={css.mainInfo}>
            <div className={css.titleWrapper}>{listingTypeLabel}</div>
          </div>

          <div className={css.manageLinks}>
            <LinkToStockOrAvailabilityTab
              listing={currentListing}
              listingTypeConfig={listingTypeConfig}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageListingCard;
