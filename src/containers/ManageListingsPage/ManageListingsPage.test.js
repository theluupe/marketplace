import React, { act } from 'react';
import { useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';

import { createCurrentUser, createOwnListing } from '../../util/testData';
import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { ManageListingsPageComponent } from './ManageListingsPage';

const { screen } = testingLibrary;

// The flag is mocked, never edited, so both values are tested (spec/v0/hide-portfolio.md §5).
let mockPortfolioEnabled = false;
jest.mock('../../util/featureFlags', () => ({
  get PORTFOLIO_ENABLED() {
    return mockPortfolioEnabled;
  },
}));

jest.mock('../TopbarContainer/TopbarContainer', () => () => null);
jest.mock('../FooterContainer/FooterContainer', () => () => null);

const portfolioQuery = { pub_listingType: 'portfolio-showcase', page: 1, perPage: 1 };
const collection = createOwnListing('collection-1', {
  title: 'Summer collection',
  publicData: { listingType: 'portfolio-showcase' },
});

let location;
const LocationSpy = () => {
  location = useLocation();
  return null;
};

const renderPage = async props => {
  await act(async () => {
    render(
      <>
        <ManageListingsPageComponent
          currentUser={createCurrentUser('creative')}
          listings={[]}
          pagination={null}
          queryInProgress={false}
          queryListingsError={null}
          queryParams={{}}
          scrollingDisabled={false}
          onManageDisableScrolling={() => {}}
          {...props}
        />
        <LocationSpy />
      </>
    );
  });
};

const selectedTab = () => screen.getByRole('tab', { selected: true });

describe('ManageListingsPage, Portfolio switched off', () => {
  beforeEach(() => {
    mockPortfolioEnabled = false;
  });

  it('opens on Shop: a URL with no tab is rewritten to Shop', async () => {
    await renderPage({ queryParams: {} });
    expect(selectedTab()).toHaveTextContent('Shop');
    expect(screen.getByRole('tab', { name: 'Portfolio' })).toBeInTheDocument();
    expect(location.search).toContain('pub_listingType=product-listing');
  });

  it('keeps a Portfolio URL on the paused tab, with only the "collections saved" message', async () => {
    await renderPage({
      queryParams: portfolioQuery,
      listings: [collection],
      pagination: { totalItems: 3, totalPages: 3, page: 1, perPage: 1 },
    });
    expect(selectedTab()).toHaveTextContent('Portfolio');
    expect(
      screen.getByText('ManageListingsPage.portfolioPausedCollectionsSaved')
    ).toBeInTheDocument();
    // The counted collection is never rendered: no pill, no card, no page links.
    expect(screen.queryByText('Summer collection')).toBeNull();
    expect(screen.queryAllByTitle('PaginationLinks.toPage')).toHaveLength(0);
    expect(screen.queryByText('ListingTabs.addButton')).toBeNull();
    expect(screen.queryByText('ListingTabs.manageButton')).toBeNull();
    expect(location.pathname).toBe('/');
  });

  it('says nothing about saved collections when the count is 0', async () => {
    await renderPage({
      queryParams: portfolioQuery,
      pagination: { totalItems: 0, totalPages: 0, page: 1, perPage: 1 },
    });
    expect(screen.getByText('ManageListingsPage.portfolioPaused')).toBeInTheDocument();
    expect(screen.queryByText('ManageListingsPage.portfolioPausedCollectionsSaved')).toBeNull();
  });

  it('says nothing about saved collections when the count failed, even with a stale count', async () => {
    await renderPage({
      queryParams: portfolioQuery,
      queryListingsError: { status: 500 },
      pagination: { totalItems: 10, totalPages: 1, page: 1, perPage: 42 },
    });
    expect(screen.getByText('ManageListingsPage.portfolioPaused')).toBeInTheDocument();
    expect(screen.queryByText('ManageListingsPage.queryError')).toBeNull();
  });

  it('shows the loading message while the count loads', async () => {
    await renderPage({ queryParams: portfolioQuery, queryInProgress: true });
    expect(screen.getByText('ManageListingsPage.loadingOwnListings')).toBeInTheDocument();
    expect(screen.queryByText('ManageListingsPage.portfolioPaused')).toBeNull();
    expect(screen.queryByText('ManageListingsPage.portfolioPausedCollectionsSaved')).toBeNull();
  });

  it("keeps Shop's buttons", async () => {
    await renderPage({
      queryParams: { pub_listingType: 'product-listing', pub_categoryLevel1: 'photos' },
    });
    expect(screen.getByText('ListingTabs.addButton')).toBeInTheDocument();
    expect(screen.getByText('ListingTabs.manageButton')).toBeInTheDocument();
  });
});

describe('ManageListingsPage, Portfolio switched on', () => {
  beforeEach(() => {
    mockPortfolioEnabled = true;
  });

  it('shows the collections and both buttons on the Portfolio tab', async () => {
    await renderPage({
      queryParams: { pub_listingType: 'portfolio-showcase', pub_listingId: 'collection-1' },
      listings: [collection],
      pagination: { totalItems: 1, totalPages: 1, page: 1, perPage: 42 },
    });
    expect(selectedTab()).toHaveTextContent('Portfolio');
    expect(screen.getByText('Summer collection')).toBeInTheDocument();
    expect(screen.getByText('ListingTabs.addButton')).toBeInTheDocument();
    expect(screen.getByText('ListingTabs.manageButton')).toBeInTheDocument();
    expect(screen.queryByText('ManageListingsPage.portfolioPaused')).toBeNull();
  });
});
