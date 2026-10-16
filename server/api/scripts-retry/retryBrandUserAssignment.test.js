jest.mock('../../api-util/scriptManager', () => ({ integrationSdkInit: jest.fn() }));
jest.mock('../../api-util/brandJoin', () => ({ joinBrand: jest.fn() }));
jest.mock('../../api-util/studioHelper', () => ({ StudioManagerClient: jest.fn() }));

const { integrationSdkInit } = require('../../api-util/scriptManager');
const { joinBrand } = require('../../api-util/brandJoin');
const { StudioManagerClient } = require('../../api-util/studioHelper');
const { retryBrandUserAssignmentScript } = require('./retryBrandUserAssignment');

const NO_RESPONSE = "Couldn't assign: the platform didn't respond. Try again.";

// spec/v0/login-and-registration.md §7.4
describe('the "assign an existing buyer to a brand" tool', () => {
  let showUser;
  let getBrand;
  let res;

  const account = (publicData, privateData = {}, metadata = {}) => ({
    data: { data: { attributes: { profile: { publicData, privateData, metadata } } } },
  });

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    showUser = jest.fn().mockResolvedValue(account({ userType: 'buyer' }));
    integrationSdkInit.mockReturnValue({ users: { show: showUser } });
    getBrand = jest.fn().mockResolvedValue({ id: 'brand-1', companyName: 'Globex' });
    StudioManagerClient.mockImplementation(() => ({ getBrand }));
    joinBrand.mockResolvedValue(true);
    res = { json: jest.fn() };
  });

  const assign = () =>
    retryBrandUserAssignmentScript({ params: { brandStudioId: 'brand-1', userId: 'bob' } }, res);
  const answered = () => res.json.mock.calls[0][0];

  it('joins a buyer to a brand the webapp has, through the shared join', async () => {
    await assign();

    expect(getBrand).toHaveBeenCalledWith('brand-1');
    expect(joinBrand).toHaveBeenCalledWith('bob', 'brand-1');
    expect(answered()).toEqual({ success: true });
  });

  it('says so, leaving the buyer as they were, when the join fails', async () => {
    joinBrand.mockResolvedValue(false);

    await assign();

    expect(answered()).toEqual({ success: false, message: NO_RESPONSE });
  });

  it.each([
    [
      "a brand the webapp doesn't know",
      () => getBrand.mockResolvedValue(null),
      "Brand 'brand-1' does not exist",
    ],
    [
      "a webapp that can't be asked",
      () => getBrand.mockRejectedValue(new Error('down')),
      NO_RESPONSE,
    ],
    [
      'an unknown user',
      () => showUser.mockRejectedValue({ status: 404 }),
      "User 'bob' does not exist",
    ],
    [
      'a brand user',
      () =>
        showUser.mockResolvedValue(
          account({ userType: 'studio-brand' }, { brandStudioId: 'brand-2' })
        ),
      "User 'bob' already belongs to another brand. Reach out to support to be added to this brand.",
    ],
    [
      'a seller',
      () => showUser.mockResolvedValue(account({ userType: 'creative-seller' })),
      "User 'bob' is a seller and cannot be assigned to a brand. Reach out to support to be added to this brand.",
    ],
  ])('refuses %s, joining nothing', async (_, setUp, message) => {
    setUp();

    await assign();

    expect(answered()).toEqual({ success: false, message });
    expect(joinBrand).not.toHaveBeenCalled();
  });
});
