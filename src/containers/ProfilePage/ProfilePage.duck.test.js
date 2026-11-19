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

const queriedParams = search => {
  const sdk = {
    users: { show: jest.fn(() => Promise.resolve({ data: { data: { attributes: {} } } })) },
    listings: { query: jest.fn(() => Promise.resolve({ data: { data: [], meta: {} } })) },
    reviews: { query: jest.fn(() => Promise.resolve({ data: { data: [], included: [] } })) },
  };
  const getState = () => ({ user: { currentUser: null } });
  const dispatch = createFakeDispatch(getState, sdk);
  return loadData({ id: 'author-id' }, search, config)(dispatch, getState, sdk).then(() => {
    expect(sdk.listings.query).toHaveBeenCalledTimes(1);
    return sdk.listings.query.mock.calls[0][0];
  });
};

const queriedListingType = search => queriedParams(search).then(params => params.pub_listingType);

const portfolioUrl = '?pub_listingType=portfolio-showcase&pub_listingId=listing-id';
const shopUrl = '?pub_listingType=product-listing&pub_categoryLevel1=photos';

describe('ProfilePage loadData', () => {
  it('Portfolio switched off: a Portfolio URL and an empty URL query Shop', async () => {
    mockPortfolioEnabled = false;
    expect(await queriedListingType(portfolioUrl)).toBe('product-listing');
    expect(await queriedListingType('')).toBe('product-listing');
    expect(await queriedListingType(shopUrl)).toBe('product-listing');
  });

  it('Portfolio switched on: a Portfolio query asks for the 400 px grid image and the 750 px preview', async () => {
    mockPortfolioEnabled = true;
    const portfolio = await queriedParams(portfolioUrl);
    expect(portfolio['fields.image']).toEqual(
      expect.arrayContaining(['variants.portfolio-grid', 'variants.scaled-medium'])
    );
    expect(portfolio['imageVariant.portfolio-grid']).toBe('w:400;h:1200;fit:scale');
    const shop = await queriedParams(shopUrl);
    expect(shop['fields.image']).not.toContain('variants.portfolio-grid');
    expect(shop['imageVariant.portfolio-grid']).toBeUndefined();
  });

  it('Portfolio switched on: a Portfolio URL queries Portfolio; an empty URL queries Shop, the default', async () => {
    mockPortfolioEnabled = true;
    expect(await queriedListingType(portfolioUrl)).toBe('portfolio-showcase');
    expect(await queriedListingType('')).toBe('product-listing');
    expect(await queriedListingType(shopUrl)).toBe('product-listing');
  });
});
