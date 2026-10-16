import React from 'react';

import { FormattedMessage } from '../../../util/reactIntl';

import { SSOButton } from '../SSOButton/SSOButton';

import css from './Signup.module.css';

// "Already have an account? Log in" on the sign-up pages (spec/v0/login-and-registration.md
// §2.6.2): Auth0's login screen, keeping `from`.
const LoginPrompt = props => (
  <p className={css.loginPrompt}>
    <FormattedMessage id="AuthenticationPage.loginLinkPrompt" />{' '}
    <SSOButton isLogin asLink {...props}>
      <FormattedMessage id="AuthenticationPage.loginLinkText" />
    </SSOButton>
  </p>
);

export default LoginPrompt;
