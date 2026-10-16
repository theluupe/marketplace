import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../../util/testHelpers';
import { fakeIntl } from '../../../util/testData';

import TermsAndConditions from '../TermsAndConditions/TermsAndConditions';
import ConfirmSignupForm from './ConfirmSignupForm';

const { screen, fireEvent, userEvent, waitFor } = testingLibrary;

const noop = () => null;

const userTypes = [
  {
    userType: 'a',
    label: 'Seller',
  },
  {
    userType: 'b',
    label: 'Buyer',
  },
  {
    userType: 'c',
    label: 'Guest',
  },
  {
    userType: 'd',
    label: 'Host',
  },
];

const userFields = [
  {
    key: 'enumField1',
    scope: 'public',
    schemaType: 'enum',
    enumOptions: [
      { option: 'o1', label: 'l1' },
      { option: 'o2', label: 'l2' },
      { option: 'o3', label: 'l3' },
    ],
    saveConfig: {
      label: 'Enum Field 1',
      displayInSignUp: true,
      isRequired: false,
    },
    userTypeConfig: {
      limitToUserTypeIds: false,
    },
  },
  {
    key: 'enumField2',
    scope: 'public',
    schemaType: 'enum',
    enumOptions: [
      { option: 'o1', label: 'l1' },
      { option: 'o2', label: 'l2' },
      { option: 'o3', label: 'l3' },
    ],
    saveConfig: {
      label: 'Enum Field 2',
      displayInSignUp: true,
      isRequired: false,
    },
    userTypeConfig: {
      limitToUserTypeIds: true,
      userTypeIds: ['c', 'd'],
    },
  },
  {
    key: 'textField',
    scope: 'private',
    schemaType: 'text',
    saveConfig: {
      label: 'Text Field',
      displayInSignUp: true,
      isRequired: true,
    },
    userTypeConfig: {
      limitToUserTypeIds: false,
    },
  },
  {
    key: 'booleanField',
    scope: 'protected',
    schemaType: 'boolean',
    saveConfig: {
      label: 'Boolean Field',
      displayInSignUp: false,
      isRequired: false,
    },
    userTypeConfig: {
      limitToUserTypeIds: false,
    },
  },
];

const authInfo = {
  idpToken: '123',
  email: 'name@example.com',
  firstName: 'Firstname',
  lastName: 'Lastname',
  idpId: 'idpId',
};

describe('ConfirmSignupForm', () => {
  // Terms and conditions component passed in as props
  const termsAndConditions = (
    <TermsAndConditions onOpenTermsOfService={noop} onOpenPrivacyPolicy={noop} intl={fakeIntl} />
  );

  // // If snapshot testing is preferred, this could be used
  // // However, this form starts to be too big DOM structure to be snapshot tested nicely
  // it('matches snapshot', () => {
  //   const tree = render(
  //     <ConfirmSignupForm intl={fakeIntl} termsAndConditions={termsAndConditions} onSubmit={noop} />
  //   );
  //   expect(tree.asFragment()).toMatchSnapshot();
  // });

  it("shows Auth0's email and doesn't let it be changed", () => {
    render(
      <ConfirmSignupForm
        authInfo={authInfo}
        intl={fakeIntl}
        termsAndConditions={termsAndConditions}
        userTypes={userTypes}
        userFields={[]}
        preselectedUserType="b"
        onSubmit={noop}
        onOpenTermsOfService={noop}
      />
    );

    // spec/v0/login-and-registration.md §2.6.4
    const email = screen.getByRole('textbox', { name: 'ConfirmSignupForm.emailLabel' });
    expect(email).toHaveValue(authInfo.email);
    expect(email).toBeDisabled();
  });

  it('enables Continue with button when required fields are filled', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmSignupForm
        authInfo={authInfo}
        intl={fakeIntl}
        termsAndConditions={termsAndConditions}
        userTypes={userTypes}
        userFields={userFields}
        onSubmit={noop}
        onOpenTermsOfService={noop}
      />
    );

    // Simulate user interaction and select parent level category
    await user.selectOptions(
      screen.getByRole('combobox'),
      screen.getByRole('option', { name: 'Seller' })
    );

    // Test that sign up button is disabled at first
    expect(screen.getByRole('button', { name: 'ConfirmSignupForm.signUp' })).toBeDisabled();

    // Check that auth info details are in the form already
    expect(screen.getByRole('textbox', { name: 'ConfirmSignupForm.emailLabel' })).toHaveValue(
      authInfo.email
    );
    expect(screen.getByRole('textbox', { name: 'ConfirmSignupForm.firstNameLabel' })).toHaveValue(
      authInfo.firstName
    );
    expect(screen.getByRole('textbox', { name: 'ConfirmSignupForm.lastNameLabel' })).toHaveValue(
      authInfo.lastName
    );

    // Type a value in the required text field
    await user.type(screen.getByLabelText('Text Field'), 'Text value');

    // Test that sign up button is still disabled before clicking the checkbox
    expect(screen.getByRole('button', { name: 'ConfirmSignupForm.signUp' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/AuthenticationPage.termsAndConditionsAcceptText/i));

    // Test that sign up button is enabled after typing the final value and selecting the checkbox
    expect(screen.getByRole('button', { name: 'ConfirmSignupForm.signUp' })).toBeEnabled();
  });

  it('shows custom user fields according to configuration', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmSignupForm
        authInfo={authInfo}
        intl={fakeIntl}
        termsAndConditions={termsAndConditions}
        userTypes={userTypes}
        userFields={userFields}
        onSubmit={noop}
        onOpenTermsOfService={noop}
      />
    );

    // Simulate user interaction and select parent level category
    await user.selectOptions(
      screen.getByRole('combobox'),
      screen.getByRole('option', { name: 'Seller' })
    );

    // Show user fields that have not been limited to type and have displayInSignUp: true
    expect(screen.getByText('Enum Field 1')).toBeInTheDocument();
    expect(screen.getByText('Text Field')).toBeInTheDocument();

    // Don't show user fields that have displayInSignUp: false
    expect(screen.queryByText('Boolean Field')).toBeNull();

    // Don't show user fields that are limited to user types –
    // ConfirmSignupForm does not support user types yet!
    expect(screen.queryByText('Enum Field 2')).toBeNull();
  });

  // spec/v0/login-and-registration.md §4.5.3: BR3, BR10.
  describe('a brand sign-up', () => {
    const brandField = (key, label) => ({
      key,
      scope: 'public',
      schemaType: 'text',
      saveConfig: { label, displayInSignUp: true, isRequired: false },
      userTypeConfig: { limitToUserTypeIds: false },
    });
    const brandFields = [
      brandField('brandName', 'Brand name'),
      brandField('brandWebsite', 'Website'),
    ];
    const renderBrandForm = brandAuthInfo =>
      render(
        <ConfirmSignupForm
          authInfo={{ ...authInfo, userType: 'studio-brand', ...brandAuthInfo }}
          intl={fakeIntl}
          termsAndConditions={termsAndConditions}
          userTypes={[{ userType: 'studio-brand', label: 'Brand' }]}
          userFields={brandFields}
          preselectedUserType="studio-brand"
          onSubmit={noop}
        />
      );

    it("gives a webapp brand's admin the brand fields, with its webapp name locked", () => {
      renderBrandForm({ brandStudioId: 'brand-1', isBrandAdmin: true, companyName: 'Acme' });

      expect(screen.getByLabelText('Brand name')).toHaveValue('Acme');
      expect(screen.getByLabelText('Brand name')).toBeDisabled();
      expect(screen.getByLabelText('Website')).toBeEnabled();
    });

    it('hides the brand fields from a member of the brand', () => {
      renderBrandForm({ brandStudioId: 'brand-1' });

      expect(screen.queryByLabelText('Brand name')).toBeNull();
    });

    it('gives a new brand the fields to fill in', () => {
      renderBrandForm({});

      expect(screen.getByLabelText('Brand name')).toHaveValue('');
      expect(screen.getByLabelText('Brand name')).toBeEnabled();
    });
  });
});
