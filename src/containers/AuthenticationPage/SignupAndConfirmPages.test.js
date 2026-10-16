import React, { act } from 'react';
import '@testing-library/jest-dom';
import Cookies from 'js-cookie';
import { MemoryRouter, Route, Switch } from 'react-router-dom';

import { createCurrentUser } from '../../util/testData';
import {
  getHostedConfiguration,
  renderWithProviders as render,
  testingLibrary,
} from '../../util/testHelpers';

import AuthenticationPage, { AuthenticationPageComponent } from './AuthenticationPage';

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

const renderPage = async props => {
  await act(async () => {
    render(<AuthenticationPage location={{ state: {} }} params={{}} {...props} />, { config });
  });
};

// The invitation's brand once the page's loadData has asked for it (AuthenticationPage.duck.js).
const invitationBrand = brand => ({
  AuthenticationPage: {
    invitationBrand: {
      brandStudioId: 'brand-1',
      inProgress: false,
      companyName: null,
      notFound: false,
      ...brand,
    },
  },
});
const renderBrandPage = async ({ params, brand, messages }) => {
  await act(async () => {
    render(<AuthenticationPage location={{ state: {} }} tab="signup" params={params} />, {
      config,
      initialState: invitationBrand(brand),
      messages,
    });
  });
};
const INVITATION = { userType: 'studio-brand', brandStudioId: 'brand-1' };
const signupButton = () =>
  screen.queryByRole('button', { name: 'AuthenticationPage.signupWithAuth0' });

const expectLoginPrompt = () => {
  expect(screen.getByText('AuthenticationPage.loginLinkPrompt')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'AuthenticationPage.loginLinkText' })
  ).toBeInTheDocument();
};

beforeEach(() => {
  window.scrollTo = jest.fn();
  // Missing in jsdom: the page scrolls to the top, and its Marquee needs a ResizeObserver.
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Cookies.remove('st-authinfo');
  Cookies.remove('st-autherror');
});

// spec/v0/login-and-registration.md §2.6.2
describe('the sign-up pages', () => {
  it('offer "Log in" under the chooser\'s tiles', async () => {
    await renderPage({ tab: 'signup' });

    expectLoginPrompt();
  });

  it('offer "Log in" on a brand invitation', async () => {
    await renderBrandPage({ params: INVITATION, brand: { companyName: 'Acme' } });

    expectLoginPrompt();
  });
});

// spec/v0/login-and-registration.md §4.5.2
describe('the brand pages', () => {
  it('give the new-brand link its own title', async () => {
    await renderBrandPage({ params: { userType: 'studio-brand' } });

    expect(screen.getByText('AuthenticationPage.signupNewBrandTitle')).toBeInTheDocument();
    expect(signupButton()).toBeInTheDocument();
  });

  it('name the brand of an invitation', async () => {
    await renderBrandPage({
      params: INVITATION,
      brand: { companyName: 'Acme' },
      messages: {
        'AuthenticationPage.signupBrandInvitationTitle':
          "You've been invited to join {brandName} on The Luupe",
      },
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "You've been invited to join Acme on The Luupe"
    );
    expect(signupButton()).toBeInTheDocument();
  });

  it("say an invitation isn't valid, with no sign-up, for a brand the webapp doesn't know", async () => {
    await renderBrandPage({ params: INVITATION, brand: { notFound: true } });

    expect(screen.getByText('AuthenticationPage.invalidInvitationTitle')).toBeInTheDocument();
    expect(signupButton()).toBeNull();
    expect(screen.queryByText('AuthenticationPage.loginLinkPrompt')).toBeNull();
  });

  it("keep the generic invitation, with its sign-up, when the webapp can't be asked", async () => {
    await renderBrandPage({ params: INVITATION });

    expect(screen.getByText('AuthenticationPage.signupBrandTile')).toBeInTheDocument();
    expect(signupButton()).toBeInTheDocument();
  });

  it('offer no sign-up while the brand is being asked for', async () => {
    await renderBrandPage({ params: INVITATION, brand: { inProgress: true } });

    expect(signupButton()).toBeNull();
  });
});

// spec/v0/login-and-registration.md §2.6.3
describe('/confirm', () => {
  it('without its cookie, says the session expired and offers Continue', async () => {
    await renderPage({ tab: 'confirm' });

    expect(screen.getByText('AuthenticationPage.confirmExpiredTitle')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'AuthenticationPage.confirmExpiredContinue' })
    ).toBeInTheDocument();
  });

  it('with its cookie, shows the form', async () => {
    const authInfo = {
      idpToken: 'token',
      idpId: 'auth0',
      email: 'jo@example.com',
      firstName: 'Jo',
      lastName: 'Doe',
      userType: 'buyer',
    };
    Cookies.set('st-authinfo', `j:${JSON.stringify(authInfo)}`);

    await renderPage({ tab: 'confirm' });

    expect(screen.queryByText('AuthenticationPage.confirmExpiredTitle')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'ConfirmSignupForm.emailLabel' })).toHaveValue(
      'jo@example.com'
    );
  });
});

// spec/v0/login-and-registration.md §8.3, BR22
describe('a second login method', () => {
  it('gets the error page instead of the sign-up, with a way to log out', async () => {
    const user = userEvent.setup();
    const onLogout = jest.fn();
    Cookies.set('st-autherror', `j:${JSON.stringify({ code: 'second-login' })}`);

    await act(async () => {
      render(
        <AuthenticationPageComponent
          tab="signup"
          location={{ state: {} }}
          params={{}}
          onLogout={onLogout}
          onManageDisableScrolling={() => null}
        />,
        { config }
      );
    });

    expect(screen.getByText('AuthenticationPage.secondLoginTitle')).toBeInTheDocument();
    expect(screen.getByText('AuthenticationPage.secondLoginText')).toBeInTheDocument();
    expect(screen.queryByText('AuthenticationPage.signupBuyerTile')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'AuthenticationPage.secondLoginLogout' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

// spec/v0/login-and-registration.md §4.5.1
describe('an error page at login', () => {
  it.each([
    ['a brand join that still fails (§4.5.1)', 'unfinished-signup', 'unfinishedSignupTitle'],
    ["a brand link they can't use (§4.5.6)", 'invitation', 'invitationErrorTitle'],
  ])('shows %s instead of the sign-up', async (_, code, title) => {
    Cookies.set('st-autherror', `j:${JSON.stringify({ code })}`);

    await act(async () => {
      render(
        <AuthenticationPageComponent
          tab="signup"
          location={{ state: {} }}
          params={{}}
          onManageDisableScrolling={() => null}
        />,
        { config }
      );
    });

    expect(screen.getByText(`AuthenticationPage.${title}`)).toBeInTheDocument();
    expect(screen.queryByText('AuthenticationPage.signupBuyerTile')).toBeNull();
  });

  it('offers Try again after a brand join that still fails', async () => {
    Cookies.set('st-autherror', `j:${JSON.stringify({ code: 'unfinished-signup' })}`);

    await renderPage({ tab: 'signup' });

    expect(
      screen.getByRole('button', { name: 'AuthenticationPage.unfinishedSignupTryAgain' })
    ).toBeInTheDocument();
  });
});

// spec/v0/login-and-registration.md §4.5.4
describe('right after a sign-up', () => {
  const signedUp = metadata =>
    createCurrentUser('user-1', {
      profile: {
        firstName: 'Jo',
        lastName: 'Doe',
        abbreviatedName: 'JD',
        publicData: { userType: 'studio-brand', brandName: 'Acme' },
        metadata,
      },
    });
  const renderAfterSignup = async currentUser => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/confirm']}>
          <Switch>
            <Route path="/profile-settings" render={() => 'Profile settings'} />
            <Route path="/" exact render={() => 'Landing page'} />
            <Route path="/confirm">
              <AuthenticationPageComponent
                tab="confirm"
                location={{ state: {} }}
                params={{}}
                isAuthenticated
                currentUser={currentUser}
                onManageDisableScrolling={() => null}
              />
            </Route>
          </Switch>
        </MemoryRouter>,
        { config }
      );
    });
  };

  it("sends a brand's new admin with only its name to complete the brand profile", async () => {
    await renderAfterSignup(signedUp({ isBrandAdmin: true }));

    expect(screen.getByText('Profile settings')).toBeInTheDocument();
  });

  it('sends a member to the landing page, as before', async () => {
    await renderAfterSignup(signedUp({ isBrandAdmin: false }));

    expect(screen.getByText('Landing page')).toBeInTheDocument();
  });
});

// spec/v0/login-and-registration.md §10.2.3: a sign-up the server refused.
describe('a refused sign-up', () => {
  it.each([
    ['session-expired', 'AuthenticationPage.confirmExpiredTitle'],
    ['second-login', 'AuthenticationPage.secondLoginTitle'],
    ['unfinished-signup', 'AuthenticationPage.unfinishedSignupTitle'],
    ['invitation', 'AuthenticationPage.invitationErrorTitle'],
    ['invalid-invitation', 'AuthenticationPage.invalidInvitationTitle'],
  ])('shows the page for %s instead of the form', async (code, title) => {
    const authInfo = {
      idpToken: 'token',
      idpId: 'auth0',
      email: 'jo@example.com',
      userType: 'buyer',
    };
    Cookies.set('st-authinfo', `j:${JSON.stringify(authInfo)}`);

    await act(async () => {
      render(
        <AuthenticationPageComponent
          tab="confirm"
          location={{ state: {} }}
          params={{}}
          confirmError={{ type: 'error', name: 'SignupRefused', message: code, status: 401 }}
          onManageDisableScrolling={() => null}
        />,
        { config }
      );
    });

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'ConfirmSignupForm.emailLabel' })).toBeNull();
  });
});
