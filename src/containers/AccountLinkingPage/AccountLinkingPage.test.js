import React, { act } from 'react';
import '@testing-library/jest-dom';

import configureStore from '../../store';
import en from '../../translations/en.json';
import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';
import {
  accountLinkingSession,
  accountLinkingContinue,
  accountLinkingCancel,
} from '../../util/api';
import { leaveFor } from '../../util/browserNavigation';

import AccountLinkingPage from './AccountLinkingPage';
import { loadData, CANCELLED_METHODS_KEY } from './AccountLinkingPage.duck';

jest.mock('../../util/browserNavigation', () => ({ leaveFor: jest.fn() }));
jest.mock('../../util/api', () => ({
  ...jest.requireActual('../../util/api'),
  accountLinkingSession: jest.fn(),
  accountLinkingContinue: jest.fn(),
  accountLinkingCancel: jest.fn(),
}));

const { screen, userEvent } = testingLibrary;

// spec/v0/account-linking.md §5.2, §6 (§10, 3.4)
const TOKEN = 'the.link.token';
const PASSWORD = { connection: 'Username-Password-Authentication', kind: 'password' };
const GOOGLE = { connection: 'google-oauth2', kind: 'google' };
const OFFER = {
  email: 'ana@example.com',
  app: 'Sharetribe (QA)',
  newMethod: 'google',
  methods: [PASSWORD],
};
const failure = (status, error) => Object.assign(new Error(), { response: { status }, error });

// What the page shows once its loadData has run in the browser with this address (AccountLinkingPage.duck.js)
const openPage = async (search, session = OFFER) => {
  accountLinkingSession.mockImplementation(() =>
    session instanceof Error ? Promise.reject(session) : Promise.resolve(session)
  );
  window.history.replaceState(null, '', `/account-linking${search}`);
  const store = configureStore({});
  await store.dispatch(loadData({}, search));
  await act(async () => {
    render(<AccountLinkingPage />, {
      initialState: { AccountLinkingPage: store.getState().AccountLinkingPage },
      messages: en,
    });
  });
};
const button = name => screen.queryByRole('button', { name });
const text = content => screen.queryByText(content, { exact: false });

beforeEach(() => {
  window.scrollTo = jest.fn();
  window.sessionStorage.clear();
});

describe('AccountLinkingPage: what it shows', () => {
  it('offers the original’s method, and takes the token out of the address bar', async () => {
    await openPage(`?token=${TOKEN}&state=auth0-state`);

    expect(accountLinkingSession).toHaveBeenCalledWith({ token: TOKEN, error: undefined });
    expect(window.location.pathname).toBe('/account-linking');
    expect(window.location.search).toBe('');
    expect(screen.getByText('Login error')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'You already have a Luupe account' })).toBeVisible();
    expect(screen.getByText('ana@example.com')).toBeVisible();
    expect(
      text(
        'already has an account that logs in with your password. To use Google too, log in once with your password'
      )
    ).toBeVisible();
    expect(button('Log in with your password')).toBeVisible();
    expect(button('Log in with Google')).toBeNull();
    expect(text('Forgot your password?')).toBeVisible();
    expect(button('Cancel')).toBeVisible();
  });

  it('offers one button per method when the original already has two, the hint under the password only', async () => {
    await openPage(`?token=${TOKEN}`, {
      ...OFFER,
      newMethod: 'other',
      methods: [PASSWORD, GOOGLE],
    });

    expect(
      text('logs in with your password or Google. To use your other login method too')
    ).toBeVisible();
    expect(button('Log in with your password')).toBeVisible();
    expect(button('Log in with Google')).toBeVisible();
    expect(screen.getAllByText(/Forgot your password\?/)).toHaveLength(1);
  });

  it('with wrong-account: the message, then the same buttons again', async () => {
    await openPage(`?token=${TOKEN}&error=wrong-account`, { error: 'wrong-account', ...OFFER });

    expect(accountLinkingSession).toHaveBeenCalledWith({ token: TOKEN, error: 'wrong-account' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      "That wasn't the account that uses ana@example.com. Log in with that account to connect them."
    );
    expect(button('Log in with your password')).toBeVisible();
    expect(button('Cancel')).toBeVisible();
  });

  it.each([
    ['expired', 'This took too long', 'Please log in again.'],
    [
      'blocked',
      "We can't connect this login to your account",
      'Please write to us at hi@theluupe.com.',
    ],
    [
      'unavailable',
      "Logging in isn't working right now",
      "We're on it; write to us at hi@theluupe.com.",
    ],
  ])('with %s: the message only, no buttons', async (error, title, message) => {
    await openPage(`?error=${error}`, { error });

    expect(screen.getByText('Login error')).toBeVisible();
    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryAllByRole('button', { name: /Log in with|Cancel/ })).toHaveLength(0);
  });

  it('shows unavailable when the server fails', async () => {
    await openPage(`?token=${TOKEN}`, failure(500, 'failed'));
    expect(
      screen.getByRole('heading', { name: "Logging in isn't working right now" })
    ).toBeVisible();
  });

  it('after Cancel’s logout: no new account, and the method kept in this tab', async () => {
    window.sessionStorage.setItem(CANCELLED_METHODS_KEY, JSON.stringify(['password']));
    await openPage('?state=cancelled');

    expect(accountLinkingSession).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'No new account was created' })).toBeVisible();
    expect(
      text(
        "Each email can have only one Luupe account. Log in with your password instead, or contact support if you can't get in."
      )
    ).toBeVisible();
  });

  it('after Cancel’s logout in another tab: "your other login method"', async () => {
    await openPage('?state=cancelled');
    expect(text('Log in with your other login method instead')).toBeVisible();
  });
});

describe('AccountLinkingPage: Continue and Cancel', () => {
  it('Continue sends the browser to the login address the server answers', async () => {
    accountLinkingContinue.mockResolvedValue({ url: 'https://login.example.com/authorize?x=1' });
    await openPage(`?token=${TOKEN}`);

    await act(() => userEvent.click(button('Log in with your password')));

    expect(accountLinkingContinue).toHaveBeenCalledWith({
      token: TOKEN,
      connection: 'Username-Password-Authentication',
    });
    expect(leaveFor).toHaveBeenCalledWith('https://login.example.com/authorize?x=1');
  });

  it('Continue with a token the server no longer accepts: the expired message', async () => {
    accountLinkingContinue.mockRejectedValue(failure(401, 'expired'));
    await openPage(`?token=${TOKEN}`);

    await act(() => userEvent.click(button('Log in with your password')));

    expect(screen.getByRole('heading', { name: 'This took too long' })).toBeVisible();
    expect(leaveFor).not.toHaveBeenCalled();
  });

  it('Cancel keeps the method for the cancelled message, then goes through the logout', async () => {
    accountLinkingCancel.mockResolvedValue({
      logoutUrl: 'https://login.example.com/v2/logout?y=2',
    });
    await openPage(`?token=${TOKEN}`);

    await act(() => userEvent.click(button('Cancel')));

    expect(accountLinkingCancel).toHaveBeenCalledWith({ token: TOKEN });
    expect(JSON.parse(window.sessionStorage.getItem(CANCELLED_METHODS_KEY))).toEqual(['password']);
    expect(leaveFor).toHaveBeenCalledWith('https://login.example.com/v2/logout?y=2');
  });

  it('Cancel refused (no longer pending): the expired message', async () => {
    accountLinkingCancel.mockRejectedValue(failure(409, 'notPending'));
    await openPage(`?token=${TOKEN}`);

    await act(() => userEvent.click(button('Cancel')));

    expect(screen.getByRole('heading', { name: 'This took too long' })).toBeVisible();
  });

  it('Cancel failing in Auth0: an error under the buttons, which work again', async () => {
    accountLinkingCancel.mockRejectedValue(failure(502, 'auth0Failed'));
    await openPage(`?token=${TOKEN}`);

    await act(() => userEvent.click(button('Cancel')));

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(button('Cancel')).toBeEnabled();
    expect(button('Log in with your password')).toBeEnabled();
    expect(leaveFor).not.toHaveBeenCalled();
  });
});
