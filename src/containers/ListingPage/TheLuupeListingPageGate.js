import React from 'react';

import { LISTING_TYPES } from '../../util/types';
import { NO_ACCESS_PAGE_FORBIDDEN_LISTING_TYPE } from '../../util/urlHelpers';
import { NamedRedirect } from '../../components';

/**
 * TheLuupe-specific gating that runs *inside* the upstream `ListingPageAccessWrapper`.
 *
 * Order of checks (matters):
 *   1. PORTFOLIO listings — never render a ListingPage; redirect to the author's
 *      ProfilePage with `pub_listingType=portfolio-showcase&pub_listingId=<id>` so
 *      the profile page knows which portfolio item to highlight.
 *   2. PROFILE listings — auto-created when a seller is approved; redirect to the
 *      author's ProfilePage.
 *   3. HIDDEN_PRODUCT listings — operator-hidden products. Only the owner or a
 *      `isLuupeAdmin` user may view; everyone else is redirected to the
 *      `forbidden-listing-type` no-access page.
 *
 * Upstream access checks (private marketplace, pending-approval, no-viewing-rights)
 * have already run by the time this gate executes — see `ListingPageAccessWrapper`.
 *
 * @param {Object} props
 * @param {Object} props.currentListing - Listing entity already derived by the wrapper
 * @param {boolean} props.isOwnListing - Whether the current user is the listing author
 * @param {Object} props.currentUser - Current Sharetribe user
 * @param {Object} props.rawParams - Raw route params (uses `rawParams.id`)
 * @param {React.ReactNode} props.children - The inner PageComponent rendered by the wrapper
 * @returns {React.ReactNode}
 */
const TheLuupeListingPageGate = ({
  currentListing,
  isOwnListing,
  currentUser,
  rawParams,
  children,
}) => {
  const listingType = currentListing?.attributes?.publicData?.listingType;
  const authorId = currentListing?.author?.id?.uuid;

  if (listingType === LISTING_TYPES.PORTFOLIO) {
    return (
      <NamedRedirect
        name="ProfilePage"
        params={{ id: authorId }}
        search={`?pub_listingType=portfolio-showcase&pub_listingId=${rawParams.id}`}
      />
    );
  }

  if (listingType === LISTING_TYPES.PROFILE) {
    return <NamedRedirect name="ProfilePage" params={{ id: authorId }} />;
  }

  if (listingType === LISTING_TYPES.HIDDEN_PRODUCT) {
    const isLuupeAdmin = currentUser?.attributes?.profile?.metadata?.isLuupeAdmin === true;
    const hasAccess = isOwnListing || isLuupeAdmin;
    if (!hasAccess) {
      return (
        <NamedRedirect
          name="NoAccessPage"
          params={{ missingAccessRight: NO_ACCESS_PAGE_FORBIDDEN_LISTING_TYPE }}
        />
      );
    }
  }

  return children;
};

export default TheLuupeListingPageGate;
