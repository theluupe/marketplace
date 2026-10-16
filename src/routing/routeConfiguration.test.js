import getPageDataLoadingAPI from '../containers/pageDataLoadingAPI';
import NotFoundPage from '../containers/NotFoundPage/NotFoundPage';
import { NamedRedirect } from '../components';

import routeConfiguration from './routeConfiguration';

// The flag is mocked, never edited, so both values are tested (spec/v0/hide-portfolio.md §5).
let mockPortfolioEnabled = false;
jest.mock('../util/featureFlags', () => ({
  get PORTFOLIO_ENABLED() {
    return mockPortfolioEnabled;
  },
}));

const findRoute = name => routeConfiguration({}, {}).find(route => route.name === name);

describe('Portfolio wizard routes', () => {
  it('Portfolio switched off: both stay registered and render Not Found, with no auth or loadData', () => {
    mockPortfolioEnabled = false;
    const newRoute = findRoute('NewPortfolioListingPage');
    const editRoute = findRoute('EditPortfolioListingPage');

    expect(newRoute.path).toBe('/l/portfolio/new');
    expect(newRoute.component({}).type).toBe(NotFoundPage);
    expect(newRoute.auth).toBeUndefined();

    expect(editRoute.path).toBe('/l/portfolio/:id/:mode/:tab');
    expect(editRoute.component({}).type).toBe(NotFoundPage);
    expect(editRoute.loadData).toBeUndefined();
  });

  it('Portfolio switched on: the wizard as before', () => {
    mockPortfolioEnabled = true;
    const newRoute = findRoute('NewPortfolioListingPage');
    const editRoute = findRoute('EditPortfolioListingPage');

    expect(newRoute.auth).toBe(true);
    expect(newRoute.component({}).type).toBe(NamedRedirect);
    expect(newRoute.component({}).props.name).toBe('EditPortfolioListingPage');

    expect(editRoute.loadData).toBe(getPageDataLoadingAPI().EditPortfolioListingPage.loadData);
    expect(editRoute.component).not.toBe(findRoute('NotFoundPage').component);
  });
});
