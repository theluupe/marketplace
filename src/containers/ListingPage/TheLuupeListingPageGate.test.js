import React, { act } from 'react';
import { useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';

import { createListing, createUser } from '../../util/testData';
import { renderWithProviders as render } from '../../util/testHelpers';

import TheLuupeListingPageGate from './TheLuupeListingPageGate';

// The flag is mocked, never edited, so both values are tested (spec/v0/hide-portfolio.md §5).
let mockPortfolioEnabled = false;
jest.mock('../../util/featureFlags', () => ({
  get PORTFOLIO_ENABLED() {
    return mockPortfolioEnabled;
  },
}));

let location;
const LocationSpy = () => {
  location = useLocation();
  return null;
};

const renderPortfolioListing = async () => {
  const listing = {
    ...createListing('collection-1', { publicData: { listingType: 'portfolio-showcase' } }),
    author: createUser('author-1'),
  };
  await act(async () => {
    render(
      <>
        <TheLuupeListingPageGate
          currentListing={listing}
          isOwnListing={false}
          rawParams={{ id: 'collection-1' }}
        >
          <p>Listing page</p>
        </TheLuupeListingPageGate>
        <LocationSpy />
      </>
    );
  });
};

describe("TheLuupeListingPageGate, a portfolio listing's own URL", () => {
  it("Portfolio switched off: redirects to the author's profile with no search", async () => {
    mockPortfolioEnabled = false;
    await renderPortfolioListing();
    expect(location.pathname).toBe('/u/author-1');
    expect(location.search).toBe('');
  });

  it("Portfolio switched on: redirects to the author's profile, that collection open", async () => {
    mockPortfolioEnabled = true;
    await renderPortfolioListing();
    expect(location.pathname).toBe('/u/author-1');
    expect(location.search).toBe('?pub_listingType=portfolio-showcase&pub_listingId=collection-1');
  });
});
