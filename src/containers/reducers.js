/**
 * Export reducers from ducks modules of different containers (i.e. default export)
 * We are following Ducks module proposition:
 * https://github.com/erikras/ducks-modular-redux
 */
import BatchEditListingPage from './BatchEditListingPage/BatchEditListingPage.duck';
import CheckoutPage from './CheckoutPage/CheckoutPage.duck';
import ContactDetailsPage from './ContactDetailsPage/ContactDetailsPage.duck';
import CreativeDetailsPage from './CreativeDetailsPage/CreativeDetailsPage.duck';
import EditListingPage from './EditListingPage/EditListingPage.duck';
import EditPortfolioListingPage from './EditPortfolioListingPage/EditPortfolioListingPage.duck';
import FavoriteListingsPage from './FavoriteListingsPage/FavoriteListingsPage.duck';
import InboxPage from './InboxPage/InboxPage.duck';
import ListingPage from './ListingPage/ListingPage.duck';
import ManageListingsPage from './ManageListingsPage/ManageListingsPage.duck';
import PaymentMethodsPage from './PaymentMethodsPage/PaymentMethodsPage.duck';
import ProfilePage from './ProfilePage/ProfilePage.duck';
import ProfileSettingsPage from './ProfileSettingsPage/ProfileSettingsPage.duck';
import ReferralProgramPage from './ReferralProgramPage/ReferralProgramPage.duck';
import SearchPage from './SearchPage/SearchPage.duck';
import StripePayoutPage from './StripePayoutPage/StripePayoutPage.duck';
import TransactionPage from './TransactionPage/TransactionPage.duck';

export {
  BatchEditListingPage,
  CheckoutPage,
  ContactDetailsPage,
  CreativeDetailsPage,
  EditListingPage,
  EditPortfolioListingPage,
  FavoriteListingsPage,
  InboxPage,
  ListingPage,
  ManageListingsPage,
  PaymentMethodsPage,
  ProfilePage,
  ProfileSettingsPage,
  ReferralProgramPage,
  SearchPage,
  StripePayoutPage,
  TransactionPage,
};
