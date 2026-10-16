import React, { act } from 'react';
import '@testing-library/jest-dom';
import Cookies from 'js-cookie';

import { renderWithProviders as render, testingLibrary } from '../../../util/testHelpers';

import LoginNotice from './LoginNotice';

const { screen } = testingLibrary;

// spec/v0/login-and-registration.md §4.5.5
describe('LoginNotice', () => {
  const renderNotice = async () => {
    await act(async () => {
      render(<LoginNotice onManageDisableScrolling={() => null} />, { withPortals: true });
    });
  };

  afterEach(() => {
    Cookies.remove('st-authnotice');
  });

  it.each([
    ['registered-as-buyer', 'LoginNotice.registeredAsBuyer'],
    ['registered-as-creator', 'LoginNotice.registeredAsCreator'],
  ])('shows the notice for %s once', async (code, messageId) => {
    Cookies.set('st-authnotice', `j:${JSON.stringify({ code })}`);

    await renderNotice();

    expect(screen.getByText(messageId)).toBeInTheDocument();
    expect(Cookies.get('st-authnotice')).toBeUndefined();
  });

  it('shows nothing without its cookie', async () => {
    await renderNotice();

    expect(screen.queryByText('LoginNotice.registeredAsBuyer')).toBeNull();
  });
});
