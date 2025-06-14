/**
 * Export loadData calls from ducks modules of different containers
 */
import { loadData as AuthenticationPageLoader } from './AuthenticationPage/AuthenticationPage.duck';
import { loadData as BatchEditListingPageLoader } from './BatchEditListingPage/BatchEditListingPage.duck';
import { loadData as LandingPageLoader } from './LandingPage/LandingPage.duck';
import { setInitialValues as CheckoutPageInitialValues } from './CheckoutPage/CheckoutPage.duck';
import { loadData as CMSPageLoader } from './CMSPage/CMSPage.duck';
import { loadData as ContactDetailsPageLoader } from './ContactDetailsPage/ContactDetailsPage.duck';
import { loadData as CreativeDetailsPageLoader } from './CreativeDetailsPage/CreativeDetailsPage.duck';
import { loadData as EditListingPageLoader } from './EditListingPage/EditListingPage.duck';
import { loadData as EditPortfolioListingPageLoader } from './EditPortfolioListingPage/EditPortfolioListingPage.duck';
import { loadData as EmailVerificationPageLoader } from './EmailVerificationPage/EmailVerificationPage.duck';
import { loadData as FavoriteListingsPageLoader } from './FavoriteListingsPage/FavoriteListingsPage.duck';
import { loadData as InboxPageLoader } from './InboxPage/InboxPage.duck';
import { loadData as ListingPageLoader } from './ListingPage/ListingPage.duck';
import { loadData as ManageListingsPageLoader } from './ManageListingsPage/ManageListingsPage.duck';
import { loadData as PaymentMethodsPageLoader } from './PaymentMethodsPage/PaymentMethodsPage.duck';
import { loadData as PrivacyPolicyPageLoader } from './PrivacyPolicyPage/PrivacyPolicyPage.duck';
import { loadData as ProfilePageLoader } from './ProfilePage/ProfilePage.duck';
import { loadData as ProfileSettingsPageLoader } from './ProfileSettingsPage/ProfileSettingsPage.duck';
import { loadData as ReferralProgramPageLoader } from './ReferralProgramPage/ReferralProgramPage.duck';
import { loadData as SearchPageLoader } from './SearchPage/SearchPage.duck';
import { loadData as StripePayoutPageLoader } from './StripePayoutPage/StripePayoutPage.duck';
import { loadData as TermsOfServicePageLoader } from './TermsOfServicePage/TermsOfServicePage.duck';
import {
  loadData as TransactionPageLoader,
  setInitialValues as TransactionPageInitialValues,
} from './TransactionPage/TransactionPage.duck';

const getPageDataLoadingAPI = () => {
  return {
    AuthenticationPage: {
      loadData: AuthenticationPageLoader,
    },
    BatchEditListingPage: {
      loadData: BatchEditListingPageLoader,
    },
    LandingPage: {
      loadData: LandingPageLoader,
    },
    CheckoutPage: {
      setInitialValues: CheckoutPageInitialValues,
    },
    CMSPage: {
      loadData: CMSPageLoader,
    },
    ContactDetailsPage: {
      loadData: ContactDetailsPageLoader,
    },
    CreativeDetailsPage: {
      loadData: CreativeDetailsPageLoader,
    },
    EditListingPage: {
      loadData: EditListingPageLoader,
    },
    EditPortfolioListingPage: {
      loadData: EditPortfolioListingPageLoader,
    },
    EmailVerificationPage: {
      loadData: EmailVerificationPageLoader,
    },
    FavoriteListingsPage: {
      loadData: FavoriteListingsPageLoader,
    },
    InboxPage: {
      loadData: InboxPageLoader,
    },
    ListingPage: {
      loadData: ListingPageLoader,
    },
    ManageListingsPage: {
      loadData: ManageListingsPageLoader,
    },
    PaymentMethodsPage: {
      loadData: PaymentMethodsPageLoader,
    },
    PrivacyPolicyPage: {
      loadData: PrivacyPolicyPageLoader,
    },
    ProfilePage: {
      loadData: ProfilePageLoader,
    },
    ProfileSettingsPage: {
      loadData: ProfileSettingsPageLoader,
    },
    ReferralProgramPage: {
      loadData: ReferralProgramPageLoader,
    },
    SearchPage: {
      loadData: SearchPageLoader,
    },
    StripePayoutPage: {
      loadData: StripePayoutPageLoader,
    },
    TermsOfServicePage: {
      loadData: TermsOfServicePageLoader,
    },
    TransactionPage: {
      loadData: TransactionPageLoader,
      setInitialValues: TransactionPageInitialValues,
    },
  };
};

export default getPageDataLoadingAPI;
