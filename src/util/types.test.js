import {
  LISTING_GRID_DEFAULTS,
  LISTING_GRID_ROLE,
  LISTING_TAB_TYPES,
  isListingTabPaused,
  isListingTabShown,
  resolveListingTabType,
} from './types';

// The flag is mocked, never edited, so both values are tested (spec/v0/hide-portfolio.md §5).
let mockPortfolioEnabled = false;
jest.mock('./featureFlags', () => ({
  get PORTFOLIO_ENABLED() {
    return mockPortfolioEnabled;
  },
}));

const { FAVORITE, MANAGE, PROFILE } = LISTING_GRID_ROLE;
const { PORTFOLIO, PRODUCT, REVIEWS } = LISTING_TAB_TYPES;
const ABOUT = LISTING_TAB_TYPES.PROFILE;

describe('Portfolio switched off', () => {
  beforeEach(() => {
    mockPortfolioEnabled = false;
  });

  it('LISTING_GRID_DEFAULTS.TYPE is Shop for every role', () => {
    expect(LISTING_GRID_DEFAULTS.TYPE(PROFILE)).toBe(PRODUCT);
    expect(LISTING_GRID_DEFAULTS.TYPE(MANAGE)).toBe(PRODUCT);
    expect(LISTING_GRID_DEFAULTS.TYPE(FAVORITE)).toBe(PRODUCT);
  });

  it('isListingTabShown hides Portfolio except on Manage listings', () => {
    expect(isListingTabShown(PORTFOLIO, PROFILE)).toBe(false);
    expect(isListingTabShown(PORTFOLIO, FAVORITE)).toBe(false);
    expect(isListingTabShown(PORTFOLIO, MANAGE)).toBe(true);
    [PRODUCT, ABOUT, REVIEWS].forEach(tab => {
      expect(isListingTabShown(tab, PROFILE)).toBe(true);
    });
  });

  it('isListingTabPaused pauses Portfolio only', () => {
    expect(isListingTabPaused(PORTFOLIO)).toBe(true);
    [PRODUCT, ABOUT, REVIEWS].forEach(tab => {
      expect(isListingTabPaused(tab)).toBe(false);
    });
  });

  it('resolveListingTabType swaps a hidden or missing tab for Shop', () => {
    expect(resolveListingTabType(PORTFOLIO, PROFILE)).toBe(PRODUCT);
    expect(resolveListingTabType(PORTFOLIO, MANAGE)).toBe(PORTFOLIO);
    expect(resolveListingTabType(PRODUCT, PROFILE)).toBe(PRODUCT);
    expect(resolveListingTabType(undefined, PROFILE)).toBe(PRODUCT);
    expect(resolveListingTabType(undefined, MANAGE)).toBe(PRODUCT);
    expect(resolveListingTabType('foo', PROFILE)).toBe('foo');
  });
});

describe('Portfolio switched on', () => {
  beforeEach(() => {
    mockPortfolioEnabled = true;
  });

  it('LISTING_GRID_DEFAULTS.TYPE is Portfolio, except on favourites', () => {
    expect(LISTING_GRID_DEFAULTS.TYPE(PROFILE)).toBe(PORTFOLIO);
    expect(LISTING_GRID_DEFAULTS.TYPE(MANAGE)).toBe(PORTFOLIO);
    expect(LISTING_GRID_DEFAULTS.TYPE(FAVORITE)).toBe(PRODUCT);
  });

  it('isListingTabShown shows every tab', () => {
    [PROFILE, MANAGE, FAVORITE].forEach(role => {
      expect(isListingTabShown(PORTFOLIO, role)).toBe(true);
    });
  });

  it('isListingTabPaused pauses nothing', () => {
    expect(isListingTabPaused(PORTFOLIO)).toBe(false);
  });

  it('resolveListingTabType keeps Portfolio and defaults to it', () => {
    expect(resolveListingTabType(PORTFOLIO, PROFILE)).toBe(PORTFOLIO);
    expect(resolveListingTabType(undefined, PROFILE)).toBe(PORTFOLIO);
    expect(resolveListingTabType(undefined, MANAGE)).toBe(PORTFOLIO);
  });
});
