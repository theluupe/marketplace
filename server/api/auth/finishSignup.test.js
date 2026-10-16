jest.mock('../../log.js', () => ({ error: jest.fn() }));
jest.mock('../../api-util/brandJoin', () => ({
  ...jest.requireActual('../../api-util/brandJoin'),
  joinBrand: jest.fn(),
}));

const log = require('../../log.js');
const { joinBrand } = require('../../api-util/brandJoin');
const { finishSignup } = require('./finishSignup');

const account = (userType, metadata = {}) => ({
  data: {
    data: {
      id: { uuid: 'user-1' },
      attributes: { profile: { publicData: { userType }, metadata } },
    },
  },
});

// spec/v0/login-and-registration.md §4.5.1
describe('finishSignup', () => {
  let sdk;
  let tokenStore;

  beforeEach(() => {
    sdk = { currentUser: { show: jest.fn() }, logout: jest.fn().mockResolvedValue({}) };
    tokenStore = { removeToken: jest.fn() };
    joinBrand.mockResolvedValue(true);
  });

  it.each([
    ['a buyer', account('buyer')],
    ['a joined brand user', account('studio-brand', { studioId: 'studio-1' })],
  ])('lets %s carry on without a join', async (_, user) => {
    sdk.currentUser.show.mockResolvedValue(user);

    await expect(finishSignup(sdk, tokenStore)).resolves.toEqual({
      finished: true,
      user: user.data.data,
    });

    expect(joinBrand).not.toHaveBeenCalled();
    expect(sdk.logout).not.toHaveBeenCalled();
  });

  it('joins a brand user whose join is unfinished, and lets them carry on', async () => {
    sdk.currentUser.show.mockResolvedValue(account('studio-brand'));

    await expect(finishSignup(sdk, tokenStore)).resolves.toMatchObject({ finished: true });

    expect(joinBrand).toHaveBeenCalledWith('user-1');
    expect(sdk.logout).not.toHaveBeenCalled();
  });

  it.each([
    ['the logout works', () => {}],
    ['the logout fails', () => sdk.logout.mockRejectedValue(new Error('down'))],
  ])('logs them out when the join fails, and %s', async (_, logoutAnswers) => {
    logoutAnswers();
    sdk.currentUser.show.mockResolvedValue(account('studio-brand'));
    joinBrand.mockResolvedValue(false);

    await expect(finishSignup(sdk, tokenStore)).resolves.toMatchObject({ finished: false });

    expect(sdk.logout).toHaveBeenCalled();
    expect(tokenStore.removeToken).toHaveBeenCalled();
  });

  it("lets them in, and logs it, when the account can't be read", async () => {
    const error = new Error('Sharetribe down');
    sdk.currentUser.show.mockRejectedValue(error);

    await expect(finishSignup(sdk, tokenStore)).resolves.toEqual({ finished: true, user: null });

    expect(log.error).toHaveBeenCalledWith(error, 'current-user-read-failed');
    expect(joinBrand).not.toHaveBeenCalled();
  });
});
