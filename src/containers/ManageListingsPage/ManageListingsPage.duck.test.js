import { createFakeDispatch } from '../../util/testHelpers';

import { loadData, RESULT_PAGE_SIZE } from './ManageListingsPage.duck';

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

const config = { layout: { listingImage: {} } };

// The SDK calls loadData makes for a URL. A URL with no tab skips the query, which rejects
// loadData (the thunk's `condition`, unwrapped): that's today's behaviour, so it's caught here.
const ownListingsQueries = search => {
  const sdk = {
    ownListings: { query: jest.fn(() => Promise.resolve({ data: { data: [], meta: {} } })) },
  };
  const getState = () => ({ ManageListingsPage: {} });
  const dispatch = createFakeDispatch(getState, sdk);
  return loadData({}, search, config)(dispatch, getState, sdk)
    .catch(() => null)
    .then(() => sdk.ownListings.query.mock.calls.map(([params]) => params));
};

const portfolioUrl = '?pub_listingType=portfolio-showcase&pub_listingId=listing-id&page=1';
const shopUrl = '?pub_listingType=product-listing&pub_categoryLevel1=photos&page=1';

describe('ManageListingsPage loadData', () => {
  it('Portfolio switched off: a Portfolio URL queries only the count, with no images', async () => {
    mockPortfolioEnabled = false;
    expect(await ownListingsQueries(portfolioUrl)).toEqual([
      { pub_listingType: 'portfolio-showcase', page: 1, perPage: 1 },
    ]);
  });

  it('Portfolio switched off: an empty URL queries nothing; a Shop URL queries Shop', async () => {
    mockPortfolioEnabled = false;
    expect(await ownListingsQueries('')).toEqual([]);
    const [shopQuery] = await ownListingsQueries(shopUrl);
    expect(shopQuery).toMatchObject({
      pub_listingType: 'product-listing',
      perPage: RESULT_PAGE_SIZE,
      include: ['images', 'currentStock'],
    });
  });

  it('Portfolio switched on: a Portfolio URL queries the collections with their images', async () => {
    mockPortfolioEnabled = true;
    const queries = await ownListingsQueries(portfolioUrl);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      pub_listingType: 'portfolio-showcase',
      perPage: RESULT_PAGE_SIZE,
      include: ['images', 'currentStock'],
    });
    expect(await ownListingsQueries('')).toEqual([]);
  });
});
