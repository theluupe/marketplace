import React from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { isScrollingDisabled } from '../../ducks/ui.duck';

import {
  IconSpinner,
  InlineTextButton,
  LayoutSingleColumn,
  Page,
  PageMessage,
  SocialLoginButton,
} from '../../components';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import {
  VIEW_LOADING,
  VIEW_OFFER,
  VIEW_WRONG_ACCOUNT,
  VIEW_CANCELLED,
  continueLogin,
  cancelLinking,
} from './AccountLinkingPage.duck';
import css from './AccountLinkingPage.module.css';

// How the page names a login method (spec/v0/account-linking.md §6, D28): the password, Google, or anything else
const KINDS = ['password', 'google', 'other'];
const knownKind = kind => (KINDS.includes(kind) ? kind : 'other');

// "your password", "Google", or "your password or Google" for an original that already has both
const methodNames = (intl, kinds) => {
  const unique = [...new Set((kinds.length ? kinds : ['other']).map(knownKind))];
  const names = unique.map(kind => intl.formatMessage({ id: `AccountLinkingPage.method.${kind}` }));
  return names
    .slice(1)
    .reduce(
      (first, second) =>
        intl.formatMessage({ id: 'AccountLinkingPage.methodOr' }, { first, second }),
      names[0]
    );
};

// One button per method the original has (§5.2), and under a password button the "Forgot password" hint: the
// reset link opens in a new tab, and only coming back to this one finishes the link.
const LoginButtons = ({ methods, inProgress, onContinue, onCancel }) => (
  <>
    <div className={css.methods}>
      {methods.map(({ connection, kind }) => (
        <div key={connection}>
          <SocialLoginButton
            type="button"
            onClick={() => onContinue(connection)}
            inProgress={inProgress === connection}
            disabled={!!inProgress}
          >
            <FormattedMessage id={`AccountLinkingPage.continue.${knownKind(kind)}`} />
          </SocialLoginButton>
          {kind === 'password' ? (
            <p className={css.hint}>
              <FormattedMessage id="AccountLinkingPage.passwordHint" />
            </p>
          ) : null}
        </div>
      ))}
    </div>
    <div className={css.cancel}>
      <InlineTextButton
        type="button"
        onClick={onCancel}
        inProgress={inProgress === 'cancel'}
        disabled={!!inProgress}
      >
        <FormattedMessage id="AccountLinkingPage.cancel" />
      </InlineTextButton>
    </div>
  </>
);

// Every view looks like the 404 page (PageMessage), with the same label: Rafael's call, 2026-11-17
const Content = ({ page, intl, onContinue, onCancel }) => {
  const { view, email, newMethod, methods, cancelledMethods, inProgress, actionFailed } = page;
  const emailValue = <span className={css.email}>{email}</span>;
  const label = <FormattedMessage id="AccountLinkingPage.label" />;

  if (view === VIEW_LOADING) {
    return (
      <div className={css.loading}>
        <IconSpinner />
      </div>
    );
  }

  if (view === VIEW_CANCELLED) {
    return (
      <PageMessage
        label={label}
        title={<FormattedMessage id="AccountLinkingPage.cancelledTitle" />}
      >
        <p>
          <FormattedMessage
            id="AccountLinkingPage.cancelledText"
            values={{ method: methodNames(intl, cancelledMethods) }}
          />
        </p>
      </PageMessage>
    );
  }

  if (view === VIEW_OFFER || view === VIEW_WRONG_ACCOUNT) {
    const method = methodNames(intl, methods.map(m => m.kind));
    return (
      <PageMessage
        label={label}
        title={<FormattedMessage id="AccountLinkingPage.title" />}
        actions={
          <>
            <LoginButtons
              methods={methods}
              inProgress={inProgress}
              onContinue={onContinue}
              onCancel={onCancel}
            />
            {actionFailed ? (
              <p className={css.actionFailed} role="alert">
                <FormattedMessage id="AccountLinkingPage.actionFailed" />
              </p>
            ) : null}
          </>
        }
      >
        {view === VIEW_WRONG_ACCOUNT ? (
          <p className={css.error} role="alert">
            <FormattedMessage id="AccountLinkingPage.wrongAccount" values={{ email: emailValue }} />
          </p>
        ) : (
          <p>
            <FormattedMessage
              id="AccountLinkingPage.text"
              values={{ email: emailValue, method, newMethod: methodNames(intl, [newMethod]) }}
            />
          </p>
        )}
      </PageMessage>
    );
  }

  // expired, blocked and unavailable: the message only, no buttons (§5.2)
  return (
    <PageMessage label={label} title={<FormattedMessage id={`AccountLinkingPage.${view}Title`} />}>
      <p>
        <FormattedMessage id={`AccountLinkingPage.${view}Text`} />
      </p>
    </PageMessage>
  );
};

/**
 * The account-linking page (spec/v0/account-linking.md §5): `/account-linking`, public and not indexed. Its data is
 * loaded in AccountLinkingPage.duck.js; Continue and Cancel leave the page for Auth0.
 */
const AccountLinkingPage = () => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const scrollingDisabled = useSelector(isScrollingDisabled);
  const page = useSelector(state => state.AccountLinkingPage);

  return (
    <Page
      title={intl.formatMessage({ id: 'AccountLinkingPage.title' })}
      scrollingDisabled={scrollingDisabled}
      noIndex
    >
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <Content
          page={page}
          intl={intl}
          onContinue={connection => dispatch(continueLogin(connection))}
          onCancel={() => dispatch(cancelLinking())}
        />
      </LayoutSingleColumn>
    </Page>
  );
};

export default AccountLinkingPage;
