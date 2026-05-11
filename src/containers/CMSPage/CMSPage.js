import React from 'react';
import loadable from '@loadable/component';

import { bool, object } from 'prop-types';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { withRouter } from 'react-router-dom';

import { fetchFeaturedListings } from '../../ducks/featuredListings.duck';
import { makeGetListingsByIdSelector } from '../../ducks/marketplaceData.duck';
import { getFeaturedListingsProps } from '../../util/data';

import NotFoundPage from '../../containers/NotFoundPage/NotFoundPage';
const PageBuilder = loadable(() =>
  import(/* webpackChunkName: "PageBuilder" */ '../PageBuilder/PageBuilder')
);

export const CMSPageComponent = props => {
  const { params, pageAssetsData, inProgress, error } = props;
  const pageId = params.pageId || props.pageId;

  if (!inProgress && error?.status === 404) {
    return <NotFoundPage staticContext={props.staticContext} />;
  }

  return (
    <PageBuilder
      pageAssetsData={pageAssetsData?.[pageId]?.data}
      inProgress={inProgress}
      schemaType="Article"
      featuredListings={getFeaturedListingsProps(pageId, props)}
    />
  );
};

CMSPageComponent.propTypes = {
  pageAssetsData: object,
  inProgress: bool,
};

// Factory mapStateToProps: instantiate one memoised selector per component instance
// so that getListingsById doesn't allocate a new array on every store update (PR #829).
const makeMapStateToProps = () => {
  const getListingsByIdSelector = makeGetListingsByIdSelector();
  return state => {
    const { pageAssetsData, inProgress, error } = state.hostedAssets || {};
    const featuredListingData = state.featuredListings || {};

    const getListingEntitiesById = listingIds => getListingsByIdSelector(state, listingIds);

    return { pageAssetsData, featuredListingData, getListingEntitiesById, inProgress, error };
  };
};

const mapDispatchToProps = dispatch => ({
  onFetchFeaturedListings: (sectionId, parentPage, listingImageConfig, allSections) =>
    dispatch(fetchFeaturedListings({ sectionId, parentPage, listingImageConfig, allSections })),
});

// Note: it is important that the withRouter HOC is **outside** the
// connect HOC, otherwise React Router won't rerender any Route
// components since connect implements a shouldComponentUpdate
// lifecycle hook.
//
// See: https://github.com/ReactTraining/react-router/issues/4671
const CMSPage = compose(
  withRouter,
  connect(
    makeMapStateToProps,
    mapDispatchToProps
  )
)(CMSPageComponent);

export default CMSPage;
