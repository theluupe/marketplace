import React, { act } from 'react';
import '@testing-library/jest-dom';

import { createCurrentUser, fakeIntl } from '../../util/testData';
import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { ProfileSettingsPageComponent } from './ProfileSettingsPage';

const { screen } = testingLibrary;

const noop = () => null;

const baseProps = {
  authInProgress: false,
  history: { push: noop },
  isAuthenticated: false,
  location: { search: '' },
  onChange: noop,
  onImageUpload: noop,
  onLogout: noop,
  onManageDisableScrolling: noop,
  onUpdateProfile: noop,
  params: { displayName: 'my-shop' },
  scrollingDisabled: false,
  updateInProgress: false,
  uploadInProgress: false,
  sendVerificationEmailInProgress: false,
  onResendVerificationEmail: noop,
  intl: fakeIntl,
};

// spec/v0/login-and-registration.md §4.5.4
describe('ProfileSettingsPage, a brand admin', () => {
  const brandUser = (publicData, isBrandAdmin) =>
    createCurrentUser('userId', {
      profile: {
        firstName: 'Jo',
        lastName: 'Doe',
        abbreviatedName: 'JD',
        publicData: { userType: 'studio-brand', brandName: 'Acme', ...publicData },
        metadata: { isBrandAdmin },
      },
    });

  it.each([
    ["an admin with only the brand's name", {}, true, true],
    ['an admin who completed it', { aboutUs: 'About Acme' }, true, false],
    ['a member', {}, false, false],
  ])('asks %s to complete the brand profile: %s', async (_, publicData, isBrandAdmin, asked) => {
    await act(async () => {
      render(
        <ProfileSettingsPageComponent
          {...baseProps}
          currentUser={brandUser(publicData, isBrandAdmin)}
        />
      );
    });

    const banner = screen.queryByText('ProfileSettingsPage.completeBrandProfileTitle');
    expect(!!banner).toBe(asked);
  });
});

describe('ProfileSettingsPage', () => {
  it('Check that there is a link to ProfilePage', async () => {
    const props = {
      authInProgress: false,
      currentUser: createCurrentUser('userId'),
      history: { push: noop },
      isAuthenticated: false,
      location: { search: '' },
      onChange: noop,
      onImageUpload: noop,
      onLogout: noop,
      onManageDisableScrolling: noop,
      onUpdateProfile: noop,
      params: { displayName: 'my-shop' },
      scrollingDisabled: false,
      updateInProgress: false,
      uploadInProgress: false,
      sendVerificationEmailInProgress: false,
      onResendVerificationEmail: noop,
      intl: fakeIntl,
    };

    await act(async () => {
      render(<ProfileSettingsPageComponent {...props} />);
    });

    const viewProfileLink = 'ProfileSettingsPage.viewProfileLink';
    expect(screen.getByText(viewProfileLink)).toBeInTheDocument();
  });
});
