import React from 'react';
import '@testing-library/jest-dom';

import {
  getHostedConfiguration,
  renderWithProviders as render,
  testingLibrary,
} from '../../util/testHelpers';

import { ConfirmIdProviderInfoForm } from './AuthenticationPage';

const { screen, userEvent } = testingLibrary;

const fields = { displayName: false, phoneNumber: false };
const config = {
  ...getHostedConfiguration(),
  userTypes: {
    userTypes: [
      { userType: 'buyer', label: 'Buyer', defaultListingFields: fields },
      { userType: 'creative-seller', label: 'Creator', defaultListingFields: fields },
      { userType: 'studio-brand', label: 'Brand', defaultListingFields: fields },
    ],
  },
  userFields: { userFields: [] },
};

const authInfo = {
  idpToken: '123',
  email: 'jo@example.com',
  firstName: 'Jo',
  lastName: 'Doe',
  idpId: 'auth0',
};

const renderConfirm = (userType, extraAuthInfo = {}) =>
  render(
    <ConfirmIdProviderInfoForm
      userType={userType}
      authInfo={{ ...authInfo, userType, ...extraAuthInfo }}
      submitSingupWithIdp={() => null}
      termsAndConditions={<span>Terms</span>}
    />,
    { config }
  );

// spec/v0/login-and-registration.md §2.6.1
describe('ConfirmIdProviderInfoForm, the switch between buyer and creator', () => {
  it('switches a buyer to the creator form and back, in place', async () => {
    const user = userEvent.setup();
    renderConfirm('buyer');

    expect(screen.queryByText('ConfirmSignupForm.sellerInfoTitle')).toBeNull();
    expect(screen.getByText('AuthenticationPage.switchToSellerPrompt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'AuthenticationPage.switchToSellerLink' }));

    expect(screen.getByText('ConfirmSignupForm.sellerInfoTitle')).toBeInTheDocument();
    expect(screen.getByText('ConfirmSignupForm.address')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'ConfirmSignupForm.emailLabel' })).toHaveValue(
      'jo@example.com'
    );

    await user.click(screen.getByRole('button', { name: 'AuthenticationPage.switchToBuyerLink' }));

    expect(screen.queryByText('ConfirmSignupForm.sellerInfoTitle')).toBeNull();
    expect(screen.queryByText('ConfirmSignupForm.address')).toBeNull();
  });

  it.each([
    ['the webapp chose the type', 'creative-seller', { userTypeFromWebapp: true }],
    ['a brand sign-up', 'studio-brand', {}],
  ])('is hidden when %s', (_, userType, extraAuthInfo) => {
    renderConfirm(userType, extraAuthInfo);

    expect(screen.queryByRole('button', { name: /AuthenticationPage.switchTo/ })).toBeNull();
  });
});

// spec/v0/login-and-registration.md §6.4.2, §6.4.3
describe('ConfirmIdProviderInfoForm, the banner when the webapp chose the type', () => {
  const chosen = { userTypeFromWebapp: true, userTypeNotice: true };

  it.each([
    ['a creator', 'creative-seller', 'AuthenticationPage.setUpAsCreator'],
    ['a buyer', 'buyer', 'AuthenticationPage.setUpAsBuyer'],
  ])('tells %s how the account is set up', (_, userType, messageId) => {
    renderConfirm(userType, chosen);

    expect(screen.getByText(messageId)).toBeInTheDocument();
  });

  it('shows none to a webapp creator who came through the creator sign-up', () => {
    renderConfirm('creative-seller', { userTypeFromWebapp: true });

    expect(screen.queryByText(/AuthenticationPage.setUpAs/)).toBeNull();
  });
});
