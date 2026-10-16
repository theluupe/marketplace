import React, { act } from 'react';
import { useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';

import { createUser } from '../../../util/testData';
import { renderWithProviders as render, testingLibrary } from '../../../util/testHelpers';

import SellerProfilePage from './SellerProfilePage';
import ProfileInfo from './ProfileInfo';

const { screen } = testingLibrary;

// The flag is mocked, never edited, so both values are tested (spec/v0/hide-portfolio.md §5).
let mockPortfolioEnabled = false;
jest.mock('../../../util/featureFlags', () => ({
  get PORTFOLIO_ENABLED() {
    return mockPortfolioEnabled;
  },
}));

jest.mock('../../TopbarContainer/TopbarContainer', () => () => null);
jest.mock('../../FooterContainer/FooterContainer', () => () => null);

let location;
const LocationSpy = () => {
  location = useLocation();
  return null;
};

const renderProfile = async queryParams => {
  await act(async () => {
    render(
      <>
        <SellerProfilePage
          isCurrentUser={false}
          profileUser={createUser('creative')}
          queryParams={queryParams}
          queryInProgress={false}
          pathParams={{ id: 'creative' }}
        />
        <LocationSpy />
      </>
    );
  });
};

const tabNames = () => screen.getAllByRole('tab').map(tab => tab.textContent);
const selectedTab = () => screen.getByRole('tab', { selected: true });

// What the store holds after ProfilePage.duck.js's loadData for a Portfolio URL. With the flag off
// the loader swaps the type for Shop; this is the page's own guard, in case it ever receives one.
const portfolioQuery = { pub_listingType: 'portfolio-showcase', pub_listingId: 'collection-1' };

describe('SellerProfilePage tabs', () => {
  it('Portfolio switched off: no Portfolio tab; a Portfolio URL shows Shop and is rewritten to it', async () => {
    mockPortfolioEnabled = false;
    await renderProfile(portfolioQuery);
    expect(tabNames()).toEqual(['Shop', 'About', 'Reviews']);
    expect(selectedTab()).toHaveTextContent('Shop');
    expect(location.search).toContain('pub_listingType=product-listing');
    expect(location.search).not.toContain('portfolio-showcase');
  });

  it('Portfolio switched on: the Portfolio tab is there and active', async () => {
    mockPortfolioEnabled = true;
    await renderProfile(portfolioQuery);
    expect(tabNames()).toEqual(['Shop', 'Portfolio', 'About', 'Reviews']);
    expect(selectedTab()).toHaveTextContent('Portfolio');
  });
});

// §3.10: permanent, not behind the flag — the same with both values.
describe.each([false, true])('ProfileInfo website (PORTFOLIO_ENABLED = %s)', enabled => {
  beforeEach(() => {
    mockPortfolioEnabled = enabled;
  });

  const config = {
    user: {
      userFields: [
        { key: 'pronouns', schemaType: 'enum', enumOptions: [] },
        { key: 'portfolioURL', schemaType: 'text' },
      ],
    },
    listing: { listingFields: [{ key: 'creativeSpecialty', schemaType: 'text' }] },
  };
  const userWithWebsite = portfolioURL =>
    createUser('creative', {
      profile: {
        displayName: 'Jane',
        abbreviatedName: 'J',
        publicData: portfolioURL ? { portfolioURL } : {},
      },
    });

  const renderInfo = async (user, isOwnProfile = false) => {
    await act(async () => {
      render(
        <ProfileInfo
          user={user}
          queryInProgress={false}
          showLinkToProfileSettingsPage={isOwnProfile}
          onToggleFavorites={() => {}}
          config={config}
        />
      );
    });
  };

  const websiteLink = () => screen.queryByText('ProfilePage.portfolioWebsiteLabel')?.closest('a');

  it('shows the labelled link, opening the website in a new tab', async () => {
    await renderInfo(userWithWebsite('https://www.janedoe.com'));
    expect(websiteLink()).toHaveAttribute('href', 'https://www.janedoe.com');
    expect(websiteLink()).toHaveAttribute('target', '_blank');
    expect(websiteLink()).toHaveTextContent('ProfilePage.portfolioWebsiteLabel · janedoe.com');
  });

  it('shows nothing without a website', async () => {
    await renderInfo(userWithWebsite(null));
    expect(websiteLink()).toBeFalsy();
  });

  it("shows the link on the creative's own profile too", async () => {
    await renderInfo(userWithWebsite('janedoe.com'), true);
    expect(websiteLink()).toHaveAttribute('href', 'http://janedoe.com');
  });
});
