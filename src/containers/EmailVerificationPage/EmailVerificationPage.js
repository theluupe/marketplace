import React from 'react';
import { bool, func, shape, string } from 'prop-types';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { withRouter } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage, injectIntl, intlShape } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import { parse } from '../../util/urlHelpers';
import { ensureCurrentUser } from '../../util/data';
import { verify } from '../../ducks/emailVerification.duck';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import {
  Page,
  ResponsiveBackgroundImageContainer,
  NamedRedirect,
  LayoutSingleColumn,
} from '../../components';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import EmailVerificationForm from './EmailVerificationForm/EmailVerificationForm';

import css from './EmailVerificationPage.module.css';

/**
  Parse verification token from URL

  Returns stringified token, if the token is provided.

  Returns `null` if verification token is not provided.

  Please note that we need to explicitely stringify the token, because
  the unwanted result of the `parse` method is that it automatically
  parses the token to number.
*/
const parseVerificationToken = search => {
  const urlParams = parse(search);
  const verificationToken = urlParams.t;

  if (verificationToken) {
    return `${verificationToken}`;
  }

  return null;
};

export const EmailVerificationPageComponent = props => {
  const config = useConfiguration();
  const {
    currentUser,
    intl,
    scrollingDisabled,
    submitVerification,
    isVerified,
    emailVerificationInProgress,
    verificationError,
    location,
  } = props;

  const initialValues = {
    verificationToken: parseVerificationToken(location ? location.search : null),
  };
  const user = ensureCurrentUser(currentUser);

  // The first attempt to verify email is done when the page is loaded
  // If the verify API call is successfull and the user has verified email
  // We can redirect user forward from email verification page.
  if (isVerified && user.attributes.emailVerified && user.attributes.pendingEmail == null) {
    return <NamedRedirect name="LandingPage" />;
  }

  return (
    <Page
      title={intl.formatMessage({
        id: 'EmailVerificationPage.title',
      })}
      scrollingDisabled={scrollingDisabled}
      referrer="origin"
    >
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        topbar={<TopbarContainer />}
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
          <div className={css.content}>
            {user.id ? (
              <EmailVerificationForm
                initialValues={initialValues}
                onSubmit={submitVerification}
                currentUser={user}
                inProgress={emailVerificationInProgress}
                verificationError={verificationError}
              />
            ) : (
              <FormattedMessage id="EmailVerificationPage.loadingUserInformation" />
            )}
          </div>
        </ResponsiveBackgroundImageContainer>
      </LayoutSingleColumn>
    </Page>
  );
};

EmailVerificationPageComponent.defaultProps = {
  currentUser: null,
  verificationError: null,
};

EmailVerificationPageComponent.propTypes = {
  currentUser: propTypes.currentUser,
  scrollingDisabled: bool.isRequired,
  submitVerification: func.isRequired,
  isVerified: bool,
  emailVerificationInProgress: bool.isRequired,
  verificationError: propTypes.error,

  // from withRouter
  location: shape({
    search: string,
  }).isRequired,

  // from injectIntl
  intl: intlShape.isRequired,
};

const mapStateToProps = state => {
  const { currentUser } = state.user;
  const { isVerified, verificationError, verificationInProgress } = state.emailVerification;
  return {
    isVerified,
    verificationError,
    emailVerificationInProgress: verificationInProgress,
    currentUser,
    scrollingDisabled: isScrollingDisabled(state),
  };
};

const mapDispatchToProps = dispatch => ({
  submitVerification: ({ verificationToken }) => {
    return dispatch(verify(verificationToken));
  },
});

// Note: it is important that the withRouter HOC is **outside** the
// connect HOC, otherwise React Router won't rerender any Route
// components since connect implements a shouldComponentUpdate
// lifecycle hook.
//
// See: https://github.com/ReactTraining/react-router/issues/4671
const EmailVerificationPage = compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
  injectIntl
)(EmailVerificationPageComponent);

export default EmailVerificationPage;
