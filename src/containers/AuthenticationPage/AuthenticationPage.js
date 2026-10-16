import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { Redirect } from 'react-router-dom';
import Cookies from 'js-cookie';
import classNames from 'classnames';
import isEmpty from 'lodash/isEmpty';

import { useConfiguration } from '../../context/configurationContext';
import { camelize } from '../../util/string';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { propTypes, USER_TYPES } from '../../util/types';
import { ensureCurrentUser, getFeaturedListingsProps } from '../../util/data';
import { isTooManyEmailVerificationRequestsError } from '../../util/errors';
import {
  isStudioBrand,
  isCreativeSeller,
  isBuyer,
  isBrandProfileIncomplete,
} from '../../util/userHelpers';
import { authenticationInProgress, logout, signupWithIdp } from '../../ducks/auth.duck';
import { isScrollingDisabled, manageDisableScrolling } from '../../ducks/ui.duck';
import { sendVerificationEmail } from '../../ducks/user.duck';
import { fetchFeaturedListings } from '../../ducks/featuredListings.duck';
import { makeGetListingsByIdSelector } from '../../ducks/marketplaceData.duck';

import {
  Heading,
  InlineTextButton,
  Page,
  IconSpinner,
  NamedRedirect,
  ResponsiveBackgroundImageContainer,
  SocialLoginButton,
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
  const { userType, from, brandStudioId, invitationBrand, idpAuthError } = props;
  const isBrand = isStudioBrand(userType);
  return (
    <div className={css.signupForm}>
      {!!idpAuthError && (
        <div className={css.error}>
          <FormattedMessage id="AuthenticationPage.idpAuthFailed" />
        </div>
      )}
      {isBrand ? (
        <BrandSignup from={from} brandStudioId={brandStudioId} invitationBrand={invitationBrand} />
      ) : (
        <BaseSignup from={from} />
      )}
    </div>
  );
};

// The confirm page's switch: each type and the one it switches to.
const SWITCHABLE_USER_TYPES = {
  [USER_TYPES.BUYER]: USER_TYPES.SELLER,
  [USER_TYPES.SELLER]: USER_TYPES.BUYER,
};

// The sign-up's page-level messages share this layout (spec/v0/login-and-registration.md §8.5).
const AuthNotice = ({ titleId, textId, children }) => (
  <div className={css.signupForm}>
    <Heading as="h1" rootClassName={css.signupWithIdpTitle}>
      <FormattedMessage id={titleId} />
    </Heading>
    {textId ? (
      <p className={css.noticeText}>
        <FormattedMessage id={textId} />
      </p>
    ) : null}
    {children}
  </div>
);

// `/confirm` once its cookie is gone (it lasts 15 minutes), or opened directly: a way back in rather
// than an empty page (spec/v0/login-and-registration.md §2.6.3). Most people are still logged in
// at Auth0, so Continue brings them straight back to the form.
const ConfirmSessionExpired = ({ from }) => (
  <AuthNotice titleId="AuthenticationPage.confirmExpiredTitle">
    <SSOButton isLogin from={from}>
      <FormattedMessage id="AuthenticationPage.confirmExpiredContinue" />
    </SSOButton>
  </AuthNotice>
);

// Set by loginWithIdp.js in `st-autherror` for a second login method whose email already has an
// account (spec/v0/login-and-registration.md §8.3, BR22), or a login the webapp says isn't the
// person's (§6.4.1). The server's codes are in server/api/auth/webappSignup.js.
const SECOND_LOGIN_ERROR_CODE = 'second-login';
// A sign-up the server refused (createUserWithIdp.js): the error's `message` is the page's code.
const SIGNUP_REFUSED = 'SignupRefused';
const SESSION_EXPIRED_CODE = 'session-expired';

// A brand user's join failed, at sign-up or at a later login: the server logged them out again
// (server/api/auth/finishSignup.js). Try again is a login, which runs the join again
// (spec/v0/login-and-registration.md §4.5.1); they're still logged in at Auth0, so it's quick.
const UNFINISHED_SIGNUP_CODE = 'unfinished-signup';
const UnfinishedSignup = ({ from }) => (
  <AuthNotice
    titleId="AuthenticationPage.unfinishedSignupTitle"
    textId="AuthenticationPage.unfinishedSignupText"
  >
    <div className={css.noticeAction}>
      <SSOButton isLogin from={from}>
        <FormattedMessage id="AuthenticationPage.unfinishedSignupTryAgain" />
      </SSOButton>
    </div>
  </AuthNotice>
);

// A brand link this person can't use (spec/v0/login-and-registration.md §4.5.6): another brand's
// invitation, or the new-brand link for a member of a webapp brand. It doesn't say why.
const INVITATION_ERROR_CODE = 'invitation';
// An invitation whose brand the webapp doesn't know, refused at /confirm (§4.5.2, BR8): the
// invitation page shows the same message.
const INVALID_INVITATION_CODE = 'invalid-invitation';

// The person is still logged in at Auth0 with the second account, so "Log in" would land here
// again: Log out ends that session (and Auth0's), and the next login asks which account to use.
const SecondLoginError = ({ onLogout }) => (
  <AuthNotice
    titleId="AuthenticationPage.secondLoginTitle"
    textId="AuthenticationPage.secondLoginText"
  >
    <div className={css.noticeAction}>
      <SocialLoginButton onClick={onLogout}>
        <FormattedMessage id="AuthenticationPage.secondLoginLogout" />
      </SocialLoginButton>
    </div>
  </AuthNotice>
);

/**
 * TheLuupe ConfirmIdProviderInfoForm — replaces upstream's deleted
 * `<AuthenticationOrConfirmInfoForm>` confirm-step layer. Renders the
 * brand/seller info section (when applicable) plus the `<ConfirmSignupForm>`,
 * wired to TheLuupe's `getHandleSubmitConfirm` (defined in
 * `AuthenticationPage.helpers.js`) which handles `brandStudioId`, `location`,
 * and `newsletterOptIn` injection into privateData.
 */
export const ConfirmIdProviderInfoForm = props => {
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

  // Buyer ⇄ creator in place (spec/v0/login-and-registration.md §2.6.1): "Log in" with no account
  // comes back as a buyer, and a tile can be the wrong one. Not for brands, nor when the webapp
  // chose the type. The form is remounted with the other type, so the first type's fields never
  // reach the account; the type is only sent on submit.
  const [chosenUserType, setChosenUserType] = useState(preselectedUserType);
  const switchUserType = SWITCHABLE_USER_TYPES[chosenUserType];
  const showUserTypeSwitch =
    !!switchUserType &&
    !authInfo?.userTypeFromWebapp &&
    userTypes.some(conf => conf.userType === switchUserType);

  const showBrandExperience = isStudioBrand(chosenUserType);
  const showSellerExperience = isCreativeSeller(chosenUserType);
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
        {authInfo?.userTypeNotice && !showBrandExperience ? (
          // The webapp chose the type (spec/v0/login-and-registration.md §6.4.2, §6.4.3).
          <p className={css.userTypeNotice}>
            <FormattedMessage
              id={
                showSellerExperience
                  ? 'AuthenticationPage.setUpAsCreator'
                  : 'AuthenticationPage.setUpAsBuyer'
              }
            />
          </p>
        ) : null}
        <ConfirmSignupForm
          key={chosenUserType}
          className={css.form}
          onSubmit={onSubmit}
          inProgress={authInProgress}
          termsAndConditions={termsAndConditions}
          authInfo={authInfo}
          idp={idp}
          preselectedUserType={chosenUserType}
          userTypes={userTypes}
          userFields={userFields}
        />
        {showUserTypeSwitch ? (
          <p className={css.userTypeSwitch}>
            <FormattedMessage
              id={`AuthenticationPage.switchTo${
                isBuyer(switchUserType) ? 'Buyer' : 'Seller'
              }Prompt`}
            />{' '}
            <InlineTextButton type="button" onClick={() => setChosenUserType(switchUserType)}>
              <FormattedMessage
                id={`AuthenticationPage.switchTo${
                  isBuyer(switchUserType) ? 'Buyer' : 'Seller'
                }Link`}
              />
            </InlineTextButton>
          </p>
        ) : null}
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
    onLogout,
    invitationBrand,
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
  const refusalCode = confirmError?.name === SIGNUP_REFUSED ? confirmError.message : null;
  // Only after mounting, like the expired page: the cookie is read in the browser.
  const isSecondLogin =
    (mounted && authError?.code === SECOND_LOGIN_ERROR_CODE) ||
    refusalCode === SECOND_LOGIN_ERROR_CODE;
  const isSessionExpired = (mounted && !authInfo) || refusalCode === SESSION_EXPIRED_CODE;
  const isUnfinishedSignup =
    (mounted && authError?.code === UNFINISHED_SIGNUP_CODE) ||
    refusalCode === UNFINISHED_SIGNUP_CODE;
  const isInvitationError =
    (mounted && authError?.code === INVITATION_ERROR_CODE) || refusalCode === INVITATION_ERROR_CODE;
  const isInvalidInvitation = refusalCode === INVALID_INVITATION_CODE;

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

  // Right after a sign-up that made them a brand's admin with only its name, they complete its
  // profile first (spec/v0/login-and-registration.md §4.5.4). With an unverified email they see the
  // verification page instead, whose "Later" leads there too.
  if (isConfirm && shouldRedirectToLandingPage && isBrandProfileIncomplete(currentUser)) {
    return <NamedRedirect name="ProfileSettingsPage" />;
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
          {isSecondLogin ? (
            <SecondLoginError onLogout={onLogout} />
          ) : isUnfinishedSignup ? (
            <UnfinishedSignup from={from} />
          ) : isInvitationError ? (
            <AuthNotice
              titleId="AuthenticationPage.invitationErrorTitle"
              textId="AuthenticationPage.invitationErrorText"
            />
          ) : isInvalidInvitation ? (
            <AuthNotice
              titleId="AuthenticationPage.invalidInvitationTitle"
              textId="AuthenticationPage.invalidInvitationText"
            />
          ) : showEmailVerification ? (
            <EmailVerificationInfo
              name={user.attributes.profile.firstName}
              email={<span className={css.email}>{user.attributes.email}</span>}
              onResendVerificationEmail={onResendVerificationEmail}
              resendErrorMessage={resendErrorMessage}
              sendVerificationEmailInProgress={sendVerificationEmailInProgress}
            />
          ) : isConfirm && isSessionExpired ? (
            // Only after mounting: the cookie is read in the browser, so the server never has it.
            <ConfirmSessionExpired from={from} />
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
              invitationBrand={invitationBrand}
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
  const invitationBrand = useSelector(state => state.AuthenticationPage?.invitationBrand);
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
  const onLogout = useCallback(() => dispatch(logout()), [dispatch]);
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
      invitationBrand={invitationBrand}
      featuredListingData={featuredListingData}
      getListingEntitiesById={getListingEntitiesById}
      submitSingupWithIdp={submitSingupWithIdp}
      onResendVerificationEmail={onResendVerificationEmail}
      onManageDisableScrolling={onManageDisableScrolling}
      onLogout={onLogout}
      onFetchFeaturedListings={onFetchFeaturedListings}
    />
  );
};

export default AuthenticationPage;
