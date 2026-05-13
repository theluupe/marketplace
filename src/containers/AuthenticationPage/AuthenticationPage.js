import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { Redirect } from 'react-router-dom';
import Cookies from 'js-cookie';
import classNames from 'classnames';
import isEmpty from 'lodash/isEmpty';

import { useConfiguration } from '../../context/configurationContext';
import { camelize } from '../../util/string';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import { ensureCurrentUser, getFeaturedListingsProps } from '../../util/data';
import { isTooManyEmailVerificationRequestsError } from '../../util/errors';
import { isStudioBrand, isCreativeSeller } from '../../util/userHelpers';
import { authenticationInProgress, signupWithIdp } from '../../ducks/auth.duck';
import { isScrollingDisabled, manageDisableScrolling } from '../../ducks/ui.duck';
import { sendVerificationEmail } from '../../ducks/user.duck';
import { fetchFeaturedListings } from '../../ducks/featuredListings.duck';
import { makeGetListingsByIdSelector } from '../../ducks/marketplaceData.duck';

import {
  Heading,
  Page,
  IconSpinner,
  NamedRedirect,
  ResponsiveBackgroundImageContainer,
  Marquee,
  Modal,
  LayoutSingleColumn,
} from '../../components';
import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';
// We need to get ToS asset and get it rendered for the modal on this page.
import { TermsOfServiceContent } from '../../containers/TermsOfServicePage/TermsOfServicePage';
// We need to get PrivacyPolicy asset and get it rendered for the modal on this page.
import { PrivacyPolicyContent } from '../../containers/PrivacyPolicyPage/PrivacyPolicyPage';
import NotFoundPage from '../../containers/NotFoundPage/NotFoundPage';

import { getAuthInfoFromCookies, getAuthErrorFromCookies } from './AuthenticationPage.helpers';

import EmailVerificationInfo from './EmailVerificationInfo';
import { SSOButton } from './SSOButton/SSOButton';
import TermsAndConditions from './TermsAndConditions/TermsAndConditions';
import ConfirmSignupForm from './ConfirmSignupForm/ConfirmSignupForm';
import BaseSignup from './Signup/BaseSignup';
import BrandSignup from './Signup/BrandSignup';
import { getHandleSubmitConfirm } from './AuthenticationPage.helpers';

import { TOS_ASSET_NAME, PRIVACY_POLICY_ASSET_NAME } from './AuthenticationPage.duck';
import css from './AuthenticationPage.module.css';

const BlankPage = props => {
  const { schemaTitle, schemaDescription, scrollingDisabled, topbarClasses } = props;
  return (
    <Page
      title={schemaTitle}
      scrollingDisabled={scrollingDisabled}
      schema={{
        '@context': 'http://schema.org',
        '@type': 'WebPage',
        name: schemaTitle,
        description: schemaDescription,
      }}
    >
      <LayoutSingleColumn
        topbar={<TopbarContainer className={topbarClasses} />}
        footer={<FooterContainer />}
      >
        <div className={css.spinnerContainer}>
          <IconSpinner />
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

/**
 * TheLuupe SignupBody — replaces upstream's deleted `<AuthenticationOrConfirmInfoForm>`
 * routing layer for the non-confirm signup case. Routes between Brand and Base signup
 * based on the preselected user type. Inlined here per spec §3.3 Option 2C.
 */
const SignupBody = props => {
  const { userType, from, brandStudioId, idpAuthError } = props;
  const isBrand = isStudioBrand(userType);
  return (
    <div className={css.signupForm}>
      {!!idpAuthError && (
        <div className={css.error}>
          <FormattedMessage id="AuthenticationPage.idpAuthFailed" />
        </div>
      )}
      {isBrand ? (
        <BrandSignup from={from} brandStudioId={brandStudioId} />
      ) : (
        <BaseSignup from={from} />
      )}
    </div>
  );
};

/**
 * TheLuupe ConfirmIdProviderInfoForm — replaces upstream's deleted
 * `<AuthenticationOrConfirmInfoForm>` confirm-step layer. Renders the
 * brand/seller info section (when applicable) plus the `<ConfirmSignupForm>`,
 * wired to TheLuupe's `getHandleSubmitConfirm` (defined in
 * `AuthenticationPage.helpers.js`) which handles `brandStudioId`, `location`,
 * and `newsletterOptIn` injection into privateData.
 */
const ConfirmIdProviderInfoForm = props => {
  const {
    userType,
    authInfo,
    authInProgress,
    confirmError,
    submitSingupWithIdp,
    termsAndConditions,
  } = props;
  const config = useConfiguration();
  const { userFields, userTypes } = config.user;
  const preselectedUserType = userTypes.find(conf => conf.userType === userType)?.userType || null;
  const idp = authInfo ? authInfo.idpId.replace(/^./, str => str.toUpperCase()) : null;

  const showBrandExperience = isStudioBrand(preselectedUserType);
  const showSellerExperience = isCreativeSeller(preselectedUserType);
  const showInfoSection = showBrandExperience || showSellerExperience;

  const rootStyles = classNames(css.confirmFormRoot, {
    [css.forBrand]: showBrandExperience,
    [css.forSeller]: showSellerExperience,
  });

  const onSubmit = getHandleSubmitConfirm({ authInfo, submitSingupWithIdp, userFields });

  const confirmErrorMessage = confirmError ? (
    <div className={css.error}>
      <FormattedMessage id="AuthenticationPage.signupFailed" />
    </div>
  ) : null;

  const infoSection = showInfoSection ? (
    <div className={css.infoSection}>
      <Heading as="h1" rootClassName={css.infoTitle}>
        <FormattedMessage
          id={`ConfirmSignupForm.${showBrandExperience ? 'brandInfoTitle' : 'sellerInfoTitle'}`}
        />
      </Heading>
      <Heading as="h3" rootClassName={css.infoSubtitle}>
        <FormattedMessage
          id={`ConfirmSignupForm.${
            showBrandExperience ? 'brandInfoDescription' : 'sellerInfoDescription'
          }`}
          values={{
            lineBreak: (
              <>
                <br /> <br />
              </>
            ),
          }}
        />
      </Heading>
    </div>
  ) : null;

  return (
    <section className={rootStyles}>
      {infoSection}
      <div className={css.confirmForm}>
        <Heading as="h1" rootClassName={css.signupWithIdpTitle}>
          <FormattedMessage id="AuthenticationPage.confirmSignupWithIdpTitle" values={{ idp }} />
        </Heading>
        <p className={css.confirmInfoText}>
          <FormattedMessage id="AuthenticationPage.confirmSignupInfoText" />
        </p>
        {confirmErrorMessage}
        <ConfirmSignupForm
          className={css.form}
          onSubmit={onSubmit}
          inProgress={authInProgress}
          termsAndConditions={termsAndConditions}
          authInfo={authInfo}
          idp={idp}
          preselectedUserType={preselectedUserType}
          userTypes={userTypes}
          userFields={userFields}
        />
      </div>
    </section>
  );
};

/**
 * The AuthenticationPage component.
 *
 * SSO-only: TheLuupe never renders email/password login or signup forms. The
 * page either redirects to Auth0 (via `<SSOButton forceRedirect>`), shows the
 * post-SSO confirm form (via `<ConfirmIdProviderInfoForm>`), or shows the
 * brand-studio-aware signup body (`<SignupBody>` → `<BrandSignup>` /
 * `<BaseSignup>`).
 *
 * @component
 */
export const AuthenticationPageComponent = props => {
  const [tosModalOpen, setTosModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [authInfo] = useState(getAuthInfoFromCookies());
  const [authError] = useState(getAuthErrorFromCookies());
  const [mounted, setMounted] = useState(false);
  const config = useConfiguration();
  const intl = useIntl();

  useEffect(() => {
    // Remove the autherror cookie once the content is saved to state
    // because we don't want to show the error message e.g. after page refresh
    if (authError) {
      Cookies.remove('st-autherror');
    }
    setMounted(true);
  }, []);

  // On mobile, it's better to scroll to top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tosModalOpen, privacyModalOpen]);

  const {
    authInProgress,
    currentUser,
    isAuthenticated,
    location,
    params: pathParams,
    scrollingDisabled,
    confirmError,
    submitSingupWithIdp,
    tab = 'signup',
    sendVerificationEmailInProgress,
    sendVerificationEmailError,
    onResendVerificationEmail,
    onManageDisableScrolling,
    pageAssetsData,
    pageAssetsFetchInProgress,
    pageAssetsFetchError,
    staticContext,
  } = props;

  // History API has potentially state tied to this route
  // We have used that state to store previous URL ("from"),
  // so that the user can be redirected back to that page after authentication.
  const locationFrom = location.state?.from || null;
  const authinfoFrom = authInfo?.from || null;
  const from = locationFrom || authinfoFrom || null;

  const isLogin = tab === 'login';
  const isSignup = tab === 'signup';
  const isConfirm = tab === 'confirm';
  const userTypeInPushState = location.state?.userType || null;
  const userTypeInAuthInfo = isConfirm && authInfo?.userType ? authInfo?.userType : null;
  const userType = pathParams?.userType || userTypeInPushState || userTypeInAuthInfo || null;
  const { userTypes = [] } = config.user;
  const preselectedUserType = userTypes.find(conf => conf.userType === userType)?.userType || null;
  const show404 = userType && !preselectedUserType;
  const user = ensureCurrentUser(currentUser);
  const currentUserLoaded = !!user.id;
  const isBrand = isStudioBrand(preselectedUserType);
  const { brandStudioId } = pathParams;

  // We only want to show the email verification dialog in the signup
  // tab if the user isn't being redirected somewhere else
  // (i.e. `from` is present). We must also check the `emailVerified`
  // flag only when the current user is fully loaded.
  const showEmailVerification = !isLogin && currentUserLoaded && !user.attributes.emailVerified;

  const marketplaceName = config.marketplaceName;
  const schemaTitle = isLogin
    ? intl.formatMessage({ id: 'AuthenticationPage.schemaTitleLogin' }, { marketplaceName })
    : intl.formatMessage({ id: 'AuthenticationPage.schemaTitleSignup' }, { marketplaceName });
  const schemaDescription = isLogin
    ? intl.formatMessage({ id: 'AuthenticationPage.schemaDescriptionLogin' }, { marketplaceName })
    : intl.formatMessage({ id: 'AuthenticationPage.schemaDescriptionSignup' }, { marketplaceName });
  const topbarClasses = classNames({
    [css.hideOnMobile]: showEmailVerification,
  });

  const shouldRedirectToFrom = isAuthenticated && from;
  const shouldRedirectToLandingPage =
    isAuthenticated && currentUserLoaded && !showEmailVerification;
  if (!mounted && shouldRedirectToLandingPage) {
    // Show a blank page for already authenticated users,
    // when the first rendering on client side is not yet done
    // This is done to avoid hydration issues when full page load is happening.
    return (
      <BlankPage
        schemaTitle={schemaTitle}
        scrollingDisabled={scrollingDisabled}
        schemaDescription={schemaDescription}
        topbarClasses={topbarClasses}
      />
    );
  }

  if (shouldRedirectToFrom) {
    // Already authenticated, redirect back to the page the user tried to access
    return <Redirect to={from} />;
  } else if (shouldRedirectToLandingPage) {
    // Already authenticated, redirect to the landing page (this was direct access to /login or /signup)
    return <NamedRedirect name="LandingPage" />;
  } else if (show404) {
    // User type not found, show 404
    return <NotFoundPage staticContext={staticContext} />;
  }

  // SSO-only: there is no in-app LoginPage. Redirect straight to Auth0.
  if (isLogin) {
    return (
      <SSOButton
        isLogin
        forceRedirect
        from={from}
        userType={preselectedUserType}
        brandStudioId={brandStudioId}
      />
    );
  }

  // SSO-only: for users other than Brands, signup also redirects straight to Auth0.
  if (isSignup && preselectedUserType && !isBrand) {
    return <SSOButton isLogin={false} forceRedirect from={from} userType={preselectedUserType} />;
  }

  const resendErrorTranslationId = isTooManyEmailVerificationRequestsError(
    sendVerificationEmailError
  )
    ? 'AuthenticationPage.resendFailedTooManyRequests'
    : 'AuthenticationPage.resendFailed';
  const resendErrorMessage = sendVerificationEmailError ? (
    <p className={css.error}>
      <FormattedMessage id={resendErrorTranslationId} />
    </p>
  ) : null;

  const termsAndConditions = (
    <TermsAndConditions
      onOpenTermsOfService={() => setTosModalOpen(true)}
      onOpenPrivacyPolicy={() => setPrivacyModalOpen(true)}
      intl={intl}
    />
  );

  return (
    <Page
      title={schemaTitle}
      scrollingDisabled={scrollingDisabled}
      schema={{
        '@context': 'http://schema.org',
        '@type': 'WebPage',
        name: schemaTitle,
        description: schemaDescription,
      }}
    >
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        topbar={<TopbarContainer className={topbarClasses} />}
        footer={<FooterContainer />}
      >
        <ResponsiveBackgroundImageContainer
          className={css.root}
          childrenWrapperClassName={css.contentContainer}
          as="section"
          image={config.branding.brandImage}
          sizes="100%"
          useOverlay
        >
          {showEmailVerification ? (
            <EmailVerificationInfo
              name={user.attributes.profile.firstName}
              email={<span className={css.email}>{user.attributes.email}</span>}
              onResendVerificationEmail={onResendVerificationEmail}
              resendErrorMessage={resendErrorMessage}
              sendVerificationEmailInProgress={sendVerificationEmailInProgress}
            />
          ) : isConfirm ? (
            <ConfirmIdProviderInfoForm
              userType={userType}
              authInfo={authInfo}
              submitSingupWithIdp={submitSingupWithIdp}
              authInProgress={authInProgress}
              confirmError={confirmError}
              termsAndConditions={termsAndConditions}
            />
          ) : (
            <SignupBody
              userType={userType}
              from={from}
              brandStudioId={brandStudioId}
              idpAuthError={authError}
            />
          )}
        </ResponsiveBackgroundImageContainer>
        <Marquee />
      </LayoutSingleColumn>
      <Modal
        id="AuthenticationPage.tos"
        isOpen={tosModalOpen}
        onClose={() => setTosModalOpen(false)}
        usePortal
        onManageDisableScrolling={onManageDisableScrolling}
        focusElementId={'terms-accepted.tos-and-privacy'}
      >
        <div className={css.termsWrapper} role="complementary">
          <TermsOfServiceContent
            inProgress={pageAssetsFetchInProgress}
            error={pageAssetsFetchError}
            data={pageAssetsData?.[camelize(TOS_ASSET_NAME)]?.data}
            featuredListings={getFeaturedListingsProps(camelize(PRIVACY_POLICY_ASSET_NAME), props)}
            isOpen={tosModalOpen}
          />
        </div>
      </Modal>
      <Modal
        id="AuthenticationPage.privacyPolicy"
        isOpen={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
        usePortal
        onManageDisableScrolling={onManageDisableScrolling}
        focusElementId={'terms-accepted.tos-and-privacy'}
      >
        <div className={css.privacyWrapper} role="complementary">
          <PrivacyPolicyContent
            inProgress={pageAssetsFetchInProgress}
            error={pageAssetsFetchError}
            data={pageAssetsData?.[camelize(PRIVACY_POLICY_ASSET_NAME)]?.data}
            featuredListings={getFeaturedListingsProps(camelize(PRIVACY_POLICY_ASSET_NAME), props)}
            isOpen={privacyModalOpen}
          />
        </div>
      </Modal>
    </Page>
  );
};

/**
 * AuthenticationPage hooks-based wrapper. Replaces the deprecated
 * `compose(connect(...), withRouter)` HOC chain that HEAD used.
 */
const AuthenticationPage = props => {
  const dispatch = useDispatch();
  const store = useStore();
  const selectListingsById = useMemo(makeGetListingsByIdSelector, []);

  const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
  const confirmError = useSelector(state => state.auth.confirmError);
  const authInProgress = useSelector(state => authenticationInProgress(state));
  const currentUser = useSelector(state => state.user?.currentUser);
  const sendVerificationEmailInProgress = useSelector(
    state => state.user?.sendVerificationEmailInProgress
  );
  const sendVerificationEmailError = useSelector(state => state.user?.sendVerificationEmailError);
  const scrollingDisabled = useSelector(state => isScrollingDisabled(state));

  const pageAssetsData = useSelector(state => state.hostedAssets?.pageAssetsData);
  const pageAssetsFetchInProgress = useSelector(state => state.hostedAssets?.inProgress);
  const pageAssetsFetchError = useSelector(state => state.hostedAssets?.error);
  const featuredListingData = useSelector(state => state.featuredListings || {});

  // TheLuupe: memoised getListingsById per Stage B step 8 / spec §4.2.
  // Closure pattern via useStore so the helper signature `(listingIds) => listings`
  // is preserved — getFeaturedListingsProps consumes this shape.
  const getListingEntitiesById = useCallback(
    listingIds => selectListingsById(store.getState(), listingIds),
    [selectListingsById, store]
  );

  const submitSingupWithIdp = useCallback(params => dispatch(signupWithIdp(params)), [dispatch]);
  const onResendVerificationEmail = useCallback(() => dispatch(sendVerificationEmail()), [
    dispatch,
  ]);
  const onManageDisableScrolling = useCallback(
    (componentId, disableScrolling) =>
      dispatch(manageDisableScrolling(componentId, disableScrolling)),
    [dispatch]
  );
  const onFetchFeaturedListings = useCallback(
    (sectionId, parentPage, listingImageConfig, allSections) =>
      dispatch(fetchFeaturedListings({ sectionId, parentPage, listingImageConfig, allSections })),
    [dispatch]
  );

  return (
    <AuthenticationPageComponent
      {...props}
      authInProgress={authInProgress}
      currentUser={currentUser}
      isAuthenticated={isAuthenticated}
      scrollingDisabled={scrollingDisabled}
      confirmError={confirmError}
      sendVerificationEmailInProgress={sendVerificationEmailInProgress}
      sendVerificationEmailError={sendVerificationEmailError}
      pageAssetsData={pageAssetsData}
      pageAssetsFetchInProgress={pageAssetsFetchInProgress}
      pageAssetsFetchError={pageAssetsFetchError}
      featuredListingData={featuredListingData}
      getListingEntitiesById={getListingEntitiesById}
      submitSingupWithIdp={submitSingupWithIdp}
      onResendVerificationEmail={onResendVerificationEmail}
      onManageDisableScrolling={onManageDisableScrolling}
      onFetchFeaturedListings={onFetchFeaturedListings}
    />
  );
};

export default AuthenticationPage;
