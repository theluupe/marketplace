import { LISTING_GRID_ROLE } from '../../util/types';
import { getTabsFeaturesForRole } from './GridHelpers';

// The flag is mocked, never edited, so both values are tested (spec/v0/hide-portfolio.md §5).
let mockPortfolioEnabled = false;
jest.mock('../../util/featureFlags', () => ({
  get PORTFOLIO_ENABLED() {
    return mockPortfolioEnabled;
  },
}));

const tabKeys = (role, hideReviews = false) =>
  getTabsFeaturesForRole(role, hideReviews).tabs.map(tab => tab.key);

describe('getTabsFeaturesForRole', () => {
  it('Portfolio switched off: the profile has no Portfolio tab; Manage listings keeps it', () => {
    mockPortfolioEnabled = false;
    expect(tabKeys(LISTING_GRID_ROLE.PROFILE)).toEqual([
      'product-listing',
      'profile-listing',
      'reviews',
    ]);
    expect(tabKeys(LISTING_GRID_ROLE.PROFILE, true)).toEqual([
      'product-listing',
      'profile-listing',
    ]);
    expect(tabKeys(LISTING_GRID_ROLE.MANAGE)).toEqual(['product-listing', 'portfolio-showcase']);
    expect(tabKeys(LISTING_GRID_ROLE.FAVORITE)).toEqual(['product-listing', 'profile-listing']);
  });

  it('Portfolio switched on: every role has its tabs as before', () => {
    mockPortfolioEnabled = true;
    expect(tabKeys(LISTING_GRID_ROLE.PROFILE)).toEqual([
      'product-listing',
      'portfolio-showcase',
      'profile-listing',
      'reviews',
    ]);
    expect(tabKeys(LISTING_GRID_ROLE.MANAGE)).toEqual(['product-listing', 'portfolio-showcase']);
    expect(tabKeys(LISTING_GRID_ROLE.FAVORITE)).toEqual(['product-listing', 'profile-listing']);
  });
});
