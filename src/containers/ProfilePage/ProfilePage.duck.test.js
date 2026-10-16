import { createFakeDispatch } from '../../util/testHelpers';

import { loadData } from './ProfilePage.duck';

// The flag is mocked, never edited, so both values are tested (spec/v0/hide-portfolio.md §5).
let mockPortfolioEnabled = false;
jest.mock('../../util/featureFlags', () => ({
  get PORTFOLIO_ENABLED() {
    return mockPortfolioEnabled;
  },
}));

jest.mock('../../ducks/user.duck', () => ({
  ...jest.requireActual('../../ducks/user.duck'),
  fetchCurrentUser: () => () => Promise.resolve({}),
}));

// ProfilePage.test.js's own Duck tests fail at baseline (they use an older duck API), so these
// live in their own file.
const config = { accessControl: { marketplace: { private: false } } };

const queriedListingType = search => {
  const sdk = {
    users: { show: jest.fn(() => Promise.resolve({ data: { data: { attributes: {} } } })) },
    listings: { query: jest.fn(() => Promise.resolve({ data: { data: [], meta: {} } })) },
    reviews: { query: jest.fn(() => Promise.resolve({ data: { data: [], included: [] } })) },
  };
  const getState = () => ({ user: { currentUser: null } });
  const dispatch = createFakeDispatch(getState, sdk);
  return loadData({ id: 'author-id' }, search, config)(dispatch, getState, sdk).then(() => {
    expect(sdk.listings.query).toHaveBeenCalledTimes(1);
    return sdk.listings.query.mock.calls[0][0].pub_listingType;
  });
};

const portfolioUrl = '?pub_listingType=portfolio-showcase&pub_listingId=listing-id';
const shopUrl = '?pub_listingType=product-listing&pub_categoryLevel1=photos';

describe('ProfilePage loadData', () => {
  it('Portfolio switched off: a Portfolio URL and an empty URL query Shop', async () => {
    mockPortfolioEnabled = false;
    expect(await queriedListingType(portfolioUrl)).toBe('product-listing');
    expect(await queriedListingType('')).toBe('product-listing');
    expect(await queriedListingType(shopUrl)).toBe('product-listing');
  });

  it('Portfolio switched on: a Portfolio URL and an empty URL query Portfolio', async () => {
    mockPortfolioEnabled = true;
    expect(await queriedListingType(portfolioUrl)).toBe('portfolio-showcase');
    expect(await queriedListingType('')).toBe('portfolio-showcase');
    expect(await queriedListingType(shopUrl)).toBe('product-listing');
  });
});
