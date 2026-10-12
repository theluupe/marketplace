jest.mock('../../api-util/auth0Helper', () => ({}));
jest.mock('../../api-util/slackHelper', () => ({}));
jest.mock('../../api-util/scriptManager', () => ({ integrationSdkInit: jest.fn() }));
jest.mock('../../api-util/studioHelper', () => ({ StudioManagerClient: jest.fn() }));

const { USER_TYPES } = require('../../api-util/metadataHelper');
const { integrationSdkInit } = require('../../api-util/scriptManager');
const { StudioManagerClient } = require('../../api-util/studioHelper');
const { shouldUpdateBrandUsers } = require('./notifyUserUpdated');

const BRAND_ID = 'brand-1';

// The admin as the event's resource has them, after the update.
const admin = publicData => ({
  profile: {
    publicData: { userType: USER_TYPES.BRAND, brandName: 'Acme', ...publicData },
    privateData: { brandStudioId: BRAND_ID },
    metadata: { isBrandAdmin: true, brandUsers: ['member-1', 'member-2'] },
  },
});
// Sharetribe's previousValues: only the changed keys, an added one as null.
const previous = publicData => ({ attributes: { profile: { publicData } } });

describe('notifyUserUpdated shouldUpdateBrandUsers', () => {
  let sdk;
  let studioBrandUpdate;

  const expectMembersGot = brandData => {
    expect(sdk.users.updateProfile).toHaveBeenCalledTimes(2);
    expect(sdk.users.updateProfile).toHaveBeenCalledWith({ id: 'member-1', publicData: brandData });
    expect(sdk.users.updateProfile).toHaveBeenCalledWith({ id: 'member-2', publicData: brandData });
  };

  beforeEach(() => {
    sdk = { users: { updateProfile: jest.fn().mockResolvedValue({}) } };
    integrationSdkInit.mockReturnValue(sdk);
    studioBrandUpdate = jest.fn().mockResolvedValue(true);
    StudioManagerClient.mockImplementation(() => ({ studioBrandUpdate }));
  });

  it("sends an admin's first website to the members", async () => {
    await shouldUpdateBrandUsers(
      admin({ brandWebsite: 'acme.com' }),
      previous({ brandWebsite: null })
    );

    expectMembersGot({ brandName: 'Acme', brandWebsite: 'acme.com' });
    expect(studioBrandUpdate).not.toHaveBeenCalled();
  });

  it('sends a changed value to the members', async () => {
    await shouldUpdateBrandUsers(admin({ aboutUs: 'New' }), previous({ aboutUs: 'Old' }));

    expectMembersGot({ brandName: 'Acme', aboutUs: 'New' });
  });

  it('sends a cleared value to the members', async () => {
    await shouldUpdateBrandUsers(admin({}), previous({ brandWebsite: 'acme.com' }));

    expectMembersGot({ brandName: 'Acme', brandWebsite: undefined });
  });

  it('sends a renamed brand to the members and the webapp', async () => {
    await shouldUpdateBrandUsers(admin({}), previous({ brandName: 'Old name' }));

    expectMembersGot({ brandName: 'Acme' });
    expect(studioBrandUpdate).toHaveBeenCalledWith(BRAND_ID, { companyName: 'Acme' });
  });

  it('sends nothing when no brand field changed', async () => {
    await shouldUpdateBrandUsers(admin({ brandWebsite: 'acme.com' }), {
      attributes: { profile: { firstName: 'Old' } },
    });

    expect(sdk.users.updateProfile).not.toHaveBeenCalled();
    expect(studioBrandUpdate).not.toHaveBeenCalled();
  });
});
