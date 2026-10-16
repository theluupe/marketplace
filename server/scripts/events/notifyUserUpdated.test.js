jest.mock('../../api-util/auth0Helper', () => ({ updateAuth0User: jest.fn() }));
jest.mock('../../api-util/slackHelper', () => ({ slacktUserUpdatedErrorWorkflow: jest.fn() }));
jest.mock('../../api-util/scriptManager', () => ({
  integrationSdkInit: jest.fn(),
  generateScript: jest.fn(),
}));
jest.mock('../../api-util/studioHelper', () => ({ StudioManagerClient: jest.fn() }));

const { updateAuth0User } = require('../../api-util/auth0Helper');
const { USER_TYPES } = require('../../api-util/metadataHelper');
const { slacktUserUpdatedErrorWorkflow } = require('../../api-util/slackHelper');
const { integrationSdkInit, generateScript } = require('../../api-util/scriptManager');
const { StudioManagerClient } = require('../../api-util/studioHelper');
const notifyUserUpdated = require('./notifyUserUpdated');

const { shouldUpdateBrandUsers } = notifyUserUpdated;

const BRAND_ID = 'brand-1';
const ADMIN_ID = 'admin-1';

// The admin as the event's resource has them, after the update.
const admin = publicData => ({
  profile: {
    publicData: { userType: USER_TYPES.BRAND, brandName: 'Acme', ...publicData },
    privateData: { brandStudioId: BRAND_ID },
    metadata: { isBrandAdmin: true, brandUsers: ['member-1', 'member-2'] },
  },
});
// Sharetribe's previousValues: only the changed keys, an added one as null.
// The accounts with the brand's id, as Sharetribe's search returns them: the admin included.
const brandAccounts = (ids, deletedIds = []) => ({
  data: {
    data: [ADMIN_ID, ...ids, ...deletedIds].map(uuid => ({
      id: { uuid },
      attributes: { deleted: deletedIds.includes(uuid) },
    })),
  },
});
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
    sdk = {
      users: {
        query: jest.fn().mockResolvedValue(brandAccounts(['member-1', 'member-2'])),
        updateProfile: jest.fn().mockResolvedValue({}),
      },
    };
    integrationSdkInit.mockReturnValue(sdk);
    studioBrandUpdate = jest.fn().mockResolvedValue(true);
    StudioManagerClient.mockImplementation(() => ({ studioBrandUpdate }));
  });

  it("sends an admin's first website to the members", async () => {
    await shouldUpdateBrandUsers(
      ADMIN_ID,
      admin({ brandWebsite: 'acme.com' }),
      previous({ brandWebsite: null })
    );

    expectMembersGot({ brandName: 'Acme', brandWebsite: 'acme.com' });
    expect(studioBrandUpdate).not.toHaveBeenCalled();
  });

  it('sends a changed value to the members', async () => {
    await shouldUpdateBrandUsers(ADMIN_ID, admin({ aboutUs: 'New' }), previous({ aboutUs: 'Old' }));

    expectMembersGot({ brandName: 'Acme', aboutUs: 'New' });
  });

  it('sends a cleared value to the members', async () => {
    await shouldUpdateBrandUsers(ADMIN_ID, admin({}), previous({ brandWebsite: 'acme.com' }));

    expectMembersGot({ brandName: 'Acme', brandWebsite: undefined });
  });

  it('sends a renamed brand to the members and the webapp', async () => {
    await shouldUpdateBrandUsers(ADMIN_ID, admin({}), previous({ brandName: 'Old name' }));

    expectMembersGot({ brandName: 'Acme' });
    expect(studioBrandUpdate).toHaveBeenCalledWith(BRAND_ID, { companyName: 'Acme' });
  });

  it.each([
    ['gone from the search', brandAccounts(['member-1', 'member-2'])],
    ['marked deleted', brandAccounts(['member-1', 'member-2'], ['gone-1'])],
  ])("skips a deleted member %s and takes it off the admin's list", async (_, accounts) => {
    sdk.users.query.mockResolvedValue(accounts);
    const withDeleted = admin({ aboutUs: 'New' });
    withDeleted.profile.metadata.brandUsers = ['member-1', 'member-2', 'gone-1'];

    await shouldUpdateBrandUsers(ADMIN_ID, withDeleted, previous({ brandName: 'Old name' }));

    expect(sdk.users.query).toHaveBeenCalledWith({ priv_brandStudioId: BRAND_ID });
    expect(sdk.users.updateProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gone-1' })
    );
    expect(sdk.users.updateProfile).toHaveBeenCalledWith({
      id: ADMIN_ID,
      metadata: { brandUsers: ['member-1', 'member-2'] },
    });
    expect(studioBrandUpdate).toHaveBeenCalledWith(BRAND_ID, { companyName: 'Acme' });
  });

  it("sends the edit to a member missing from the admin's list, and adds them", async () => {
    sdk.users.query.mockResolvedValue(brandAccounts(['member-1', 'member-2', 'member-3']));

    await shouldUpdateBrandUsers(ADMIN_ID, admin({ aboutUs: 'New' }), previous({ aboutUs: 'Old' }));

    expect(sdk.users.updateProfile).toHaveBeenCalledWith({
      id: 'member-3',
      publicData: { brandName: 'Acme', aboutUs: 'New' },
    });
    expect(sdk.users.updateProfile).toHaveBeenCalledWith({
      id: ADMIN_ID,
      metadata: { brandUsers: ['member-1', 'member-2', 'member-3'] },
    });
  });

  it('sends nothing when no brand field changed', async () => {
    await shouldUpdateBrandUsers(ADMIN_ID, admin({ brandWebsite: 'acme.com' }), {
      attributes: { profile: { firstName: 'Old' } },
    });

    expect(sdk.users.query).not.toHaveBeenCalled();
    expect(sdk.users.updateProfile).not.toHaveBeenCalled();
    expect(studioBrandUpdate).not.toHaveBeenCalled();
  });
});

describe('notifyUserUpdated, a change the webapp refuses', () => {
  let studioUserUpdate;
  let handleEvents;

  // A brand member renames themselves.
  const nameChange = {
    attributes: {
      resourceType: 'user',
      eventType: 'user/updated',
      resourceId: { uuid: 'user-1' },
      resource: {
        attributes: {
          email: 'jo@example.com',
          profile: {
            firstName: 'Jo',
            lastName: 'Doe',
            displayName: 'Jo D',
            publicData: { userType: USER_TYPES.BRAND },
            metadata: { studioId: 'studio-1' },
          },
          identityProviders: [{ userId: 'auth0|1' }],
        },
        relationships: {},
      },
      previousValues: { attributes: { profile: { firstName: 'Joe' } } },
    },
  };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    updateAuth0User.mockReset();
    slacktUserUpdatedErrorWorkflow.mockReset();
    studioUserUpdate = jest.fn();
    StudioManagerClient.mockImplementation(() => ({ studioUserUpdate }));
    generateScript.mockReset();
    notifyUserUpdated();
    [[, , handleEvents]] = generateScript.mock.calls;
  });

  it('still syncs Auth0, then sends the usual alert', async () => {
    studioUserUpdate.mockResolvedValue(false);

    await handleEvents([nameChange]);

    expect(studioUserUpdate).toHaveBeenCalledWith(
      'studio-1',
      expect.objectContaining({ firstName: 'Jo' })
    );
    expect(updateAuth0User).toHaveBeenCalledWith(
      expect.objectContaining({ auth0UserId: 'auth0|1', firstName: 'Jo' })
    );
    expect(slacktUserUpdatedErrorWorkflow).toHaveBeenCalledTimes(1);
    expect(slacktUserUpdatedErrorWorkflow).toHaveBeenCalledWith('user-1');
  });

  it('sends a creator profile with no mentorship, and syncs Auth0', async () => {
    const creatorProfileListingUpdate = jest.fn().mockResolvedValue(true);
    StudioManagerClient.mockImplementation(() => ({ creatorProfileListingUpdate }));
    const handleChange = {
      attributes: {
        ...nameChange.attributes,
        resource: {
          ...nameChange.attributes.resource,
          attributes: {
            ...nameChange.attributes.resource.attributes,
            profile: {
              ...nameChange.attributes.resource.attributes.profile,
              publicData: { userType: USER_TYPES.SELLER, instagramHandle: 'jo' },
            },
          },
        },
        previousValues: { attributes: { profile: { publicData: { instagramHandle: 'joe' } } } },
      },
    };

    await handleEvents([handleChange]);

    expect(creatorProfileListingUpdate).toHaveBeenCalledWith(
      'studio-1',
      expect.objectContaining({ instagramHandle: 'jo', mentorship: '' })
    );
    expect(updateAuth0User).toHaveBeenCalled();
    expect(slacktUserUpdatedErrorWorkflow).not.toHaveBeenCalled();
  });

  it('sends no alert when the webapp takes it', async () => {
    studioUserUpdate.mockResolvedValue(true);

    await handleEvents([nameChange]);

    expect(updateAuth0User).toHaveBeenCalled();
    expect(slacktUserUpdatedErrorWorkflow).not.toHaveBeenCalled();
  });
});

// spec/v0/login-and-registration.md §4.5.1, §9.4.3
describe("notifyUserUpdated, a brand user's community", () => {
  let addUserToCommunity;
  let updateProfile;
  let handleEvents;

  // The join's write: `studioId` added.
  const joined = (metadata = {}, previousMetadata = { studioId: null }) => ({
    attributes: {
      resourceType: 'user',
      eventType: 'user/updated',
      resourceId: { uuid: 'user-1' },
      resource: {
        attributes: {
          email: 'jo@example.com',
          profile: {
            firstName: 'Jo',
            lastName: 'Doe',
            displayName: 'Jo D',
            publicData: { userType: USER_TYPES.BRAND },
            privateData: { brandStudioId: BRAND_ID },
            metadata: { studioId: 'studio-1', isBrandAdmin: false, ...metadata },
          },
          identityProviders: [{ userId: 'auth0|1' }],
        },
        relationships: {},
      },
      previousValues: { attributes: { profile: { metadata: previousMetadata } } },
    },
  });

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    updateAuth0User.mockReset();
    slacktUserUpdatedErrorWorkflow.mockReset();
    addUserToCommunity = jest.fn().mockResolvedValue(-7);
    StudioManagerClient.mockImplementation(() => ({ addUserToCommunity }));
    updateProfile = jest.fn().mockResolvedValue({});
    integrationSdkInit.mockReturnValue({ users: { updateProfile } });
    generateScript.mockReset();
    notifyUserUpdated();
    [[, , handleEvents]] = generateScript.mock.calls;
  });

  it('joins it once their brand join is written, and saves its id', async () => {
    await handleEvents([joined()]);

    expect(addUserToCommunity).toHaveBeenCalledWith('studio-1');
    expect(updateProfile).toHaveBeenCalledWith({ id: 'user-1', metadata: { communityId: -7 } });
    expect(slacktUserUpdatedErrorWorkflow).not.toHaveBeenCalled();
  });

  it.each([
    ['the webapp fails', () => addUserToCommunity.mockResolvedValue(null)],
    ["the id can't be saved", () => updateProfile.mockRejectedValue(new Error('down'))],
  ])('still syncs Auth0, then sends the usual alert, when %s', async (_, failure) => {
    failure();

    await handleEvents([joined()]);

    expect(updateAuth0User).toHaveBeenCalledWith(
      expect.objectContaining({ auth0UserId: 'auth0|1', studioId: 'studio-1' })
    );
    expect(slacktUserUpdatedErrorWorkflow).toHaveBeenCalledWith('user-1');
  });

  it.each([
    ['for a later update', joined({}, { isBrandAdmin: null })],
    ['when they already have one', joined({ communityId: 12 })],
  ])('asks for nothing %s', async (_, event) => {
    await handleEvents([event]);

    expect(addUserToCommunity).not.toHaveBeenCalled();
    expect(slacktUserUpdatedErrorWorkflow).not.toHaveBeenCalled();
  });
});
