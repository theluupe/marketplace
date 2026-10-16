import React from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import { USER_TYPES } from '../../../util/types';
import { Heading, IconSpinner } from '../../../components';

import { SSOButton } from '../SSOButton/SSOButton';
import LoginPrompt from './LoginPrompt';

import css from './Signup.module.css';

// The new-brand link and an invitation link (spec/v0/login-and-registration.md §4.5.2). An invitation
// names its brand, which the page's loadData asks for (`invitationBrand`, AuthenticationPage.duck.js);
// a brand the webapp doesn't know gets no sign-up button. If the webapp can't be asked, the page
// keeps its generic invitation: a failure never reads as an invalid link.
const BrandTitle = ({ isInvitation, companyName }) => {
  if (!isInvitation) {
    return <FormattedMessage id="AuthenticationPage.signupNewBrandTitle" />;
  }
  return companyName ? (
    <FormattedMessage
      id="AuthenticationPage.signupBrandInvitationTitle"
      values={{ brandName: <strong>{companyName}</strong> }}
    />
  ) : (
    <FormattedMessage id="AuthenticationPage.signupBrandTile" />
  );
};

const BrandSignup = ({ from, brandStudioId, invitationBrand }) => {
  const IMG_URL = `https://storage.googleapis.com/${process.env.REACT_APP_MARKETPLACE_BRANDING_BUCKET}/assets/img/marketplace/6446ca8583d63a9bae7ecfc45b0eb4be.png`;
  const fromMaybe = from ? { from } : null;
  const isInvitation = !!brandStudioId;
  const { companyName, notFound, inProgress } = invitationBrand || {};
  const isBrandLoaded = invitationBrand?.brandStudioId === brandStudioId && !inProgress;

  if (isInvitation && !isBrandLoaded) {
    return (
      <div className={css.brandSignup}>
        <IconSpinner />
      </div>
    );
  }
  if (isInvitation && notFound) {
    return (
      <div className={css.brandSignup}>
        <div className={css.content}>
          <Heading as="h1" rootClassName={css.title}>
            <FormattedMessage id="AuthenticationPage.invalidInvitationTitle" />
          </Heading>
          <Heading as="h3" rootClassName={css.subtitle}>
            <FormattedMessage id="AuthenticationPage.invalidInvitationText" />
          </Heading>
        </div>
      </div>
    );
  }
  return (
    <div className={css.brandSignup}>
      <div className={css.root}>
        <div className={css.content}>
          <Heading as="h1" rootClassName={css.title}>
            <BrandTitle isInvitation={isInvitation} companyName={companyName} />
          </Heading>
          <Heading as="h3" rootClassName={css.subtitle}>
            <FormattedMessage id="AuthenticationPage.signupBrandDescription" />
          </Heading>
          <SSOButton
            isLogin={false}
            brandStudioId={brandStudioId}
            userType={USER_TYPES.BRAND}
            {...fromMaybe}
          />
          {/* Keeps the invitation: someone with no account who logs in still gets the brand's
              sign-up, not the buyer's. */}
          <LoginPrompt userType={USER_TYPES.BRAND} brandStudioId={brandStudioId} {...fromMaybe} />
        </div>

        <div className={classNames(css.content, css.imageContainer)}>
          <img alt="Brand experience" className={css.brandImg} src={IMG_URL} />
        </div>
      </div>
    </div>
  );
};

export default BrandSignup;
