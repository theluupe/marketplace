jest.mock('@slack/web-api', () => ({ WebClient: jest.fn() }));
jest.mock('../../api-util/analytics', () => ({
  identifyUserEvent: jest.fn(),
  trackManagementAPIEvent: jest.fn(),
}));
jest.mock('../../api-util/scriptManager', () => ({ integrationSdkInit: jest.fn() }));
jest.mock('../../api-util/studioHelper', () => ({
  StudioManagerClient: jest.fn(),
  STUDIO_USER_TYPE: { CREATOR: 'CREATOR' },
}));

const { WebClient } = require('@slack/web-api');
const { integrationSdkInit } = require('../../api-util/scriptManager');
const { StudioManagerClient } = require('../../api-util/studioHelper');
const { slackInteractivity } = require('./slackInteractivity');

const USER_ID = 'user-1';
// The application message: an intro, then each decision's buttons.
const BLOCKS = [
  { type: 'section', block_id: 'intro', text: { type: 'mrkdwn', text: 'Jo applied' } },
  { type: 'actions', block_id: 'seller_actions', elements: [] },
  { type: 'actions', block_id: 'community_actions', elements: [] },
];

const click = (action, blocks = BLOCKS) => ({
  body: {
    payload: JSON.stringify({
      actions: [{ action_id: action, value: USER_ID }],
      channel: { id: 'C1' },
      message: { ts: '123.4', blocks },
    }),
  },
});
const userWith = (metadata, publicData = { creativeSpecialty: ['photography'] }) => ({
  data: {
    data: {
      attributes: {
        email: 'jo@example.com',
        identityProviders: [{ userId: 'auth0|jo' }],
        profile: {
          firstName: 'Jo',
          lastName: 'Doe',
          displayName: 'Jo D',
          publicData,
          privateData: {},
          metadata,
        },
      },
    },
  },
});
describe('slackInteractivity', () => {
  let sdk;
  let res;
  let studioCreatorInit;
  let chatUpdate;

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    chatUpdate = jest.fn().mockResolvedValue({});
    WebClient.mockImplementation(() => ({ chat: { update: chatUpdate } }));
    sdk = {
      users: {
        show: jest.fn().mockResolvedValue(userWith({ sellerStatus: 'APPLIED' })),
        updatePermissions: jest.fn().mockResolvedValue({}),
        updateProfile: jest.fn().mockResolvedValue({}),
      },
      listings: {
        create: jest.fn().mockResolvedValue({ data: { data: { id: { uuid: 'listing-1' } } } }),
      },
    };
    integrationSdkInit.mockReturnValue(sdk);
    studioCreatorInit = jest.fn();
    StudioManagerClient.mockImplementation(() => ({ studioCreatorInit }));
    res = { sendStatus: jest.fn() };
  });

  const updatedBlocks = () => chatUpdate.mock.calls[0][0].blocks;
  const blockText = blockId =>
    updatedBlocks().find(block => block.block_id === blockId)?.text?.text;

  it('answers Slack before doing the work', async () => {
    let showUser;
    sdk.users.show.mockReturnValue(new Promise(resolve => (showUser = resolve)));

    const handled = slackInteractivity(click('approve_seller'), res);

    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(sdk.listings.create).not.toHaveBeenCalled();
    showUser(userWith({ sellerStatus: 'APPLIED' }));
    await handled;
    expect(sdk.listings.create).toHaveBeenCalledTimes(1);
  });

  it('approves an applied seller and says so in the message', async () => {
    await slackInteractivity(click('approve_seller'), res);

    expect(sdk.users.updatePermissions).toHaveBeenCalled();
    expect(sdk.users.updateProfile).toHaveBeenCalledWith({
      id: USER_ID,
      metadata: expect.objectContaining({
        sellerStatus: 'APPROVED',
        profileListingId: 'listing-1',
      }),
    });
    expect(blockText('seller_actions')).toBe('User has been approved to be a Seller');
    expect(updatedBlocks()).toContainEqual(BLOCKS[2]);
  });

  it.each([
    ['approve_seller', { sellerStatus: 'APPROVED' }, 'seller_actions', 'seller', 'APPROVED'],
    ['approve_seller', { sellerStatus: 'WAITLISTED' }, 'seller_actions', 'seller', 'WAITLISTED'],
    [
      'approve_community',
      { communityStatus: 'APPROVED' },
      'community_actions',
      'community',
      'APPROVED',
    ],
  ])(
    '%s changes nothing for %o, and the message says so',
    async (action, metadata, blockId, decision, status) => {
      sdk.users.show.mockResolvedValue(userWith(metadata));

      await slackInteractivity(click(action), res);

      expect(sdk.users.updatePermissions).not.toHaveBeenCalled();
      expect(sdk.listings.create).not.toHaveBeenCalled();
      expect(studioCreatorInit).not.toHaveBeenCalled();
      expect(sdk.users.updateProfile).not.toHaveBeenCalled();
      expect(blockText(blockId)).toBe(
        `Nothing changed: this user's ${decision} status is already ${status}`
      );
    }
  );

  it('approves once when the button is clicked twice', async () => {
    await Promise.all([
      slackInteractivity(click('approve_seller'), res),
      slackInteractivity(click('approve_seller'), res),
    ]);

    expect(res.sendStatus).toHaveBeenCalledTimes(2);
    expect(sdk.listings.create).toHaveBeenCalledTimes(1);
  });

  it('keeps the buttons and asks to try again when the work fails', async () => {
    sdk.listings.create.mockRejectedValue(new Error('Sharetribe down'));

    await slackInteractivity(click('approve_seller'), res);

    expect(sdk.users.updateProfile).not.toHaveBeenCalled();
    expect(updatedBlocks()).toContainEqual(BLOCKS[1]);
    expect(blockText('seller_actions_note')).toBe(":warning: Couldn't complete this. Try again.");
  });

  it('drops the failure note once a retry works', async () => {
    const afterFailure = [
      ...BLOCKS.slice(0, 2),
      { type: 'section', block_id: 'seller_actions_note', text: { type: 'mrkdwn', text: 'x' } },
      BLOCKS[2],
    ];

    await slackInteractivity(click('approve_seller', afterFailure), res);

    expect(updatedBlocks().map(block => block.block_id)).toEqual([
      'intro',
      'seller_actions',
      'community_actions',
    ]);
    expect(blockText('seller_actions')).toBe('User has been approved to be a Seller');
  });

  describe('approving the community', () => {
    beforeEach(() => {
      sdk.users.show.mockResolvedValue(userWith({ communityStatus: 'APPLIED' }));
    });

    it("approves with the webapp's ids", async () => {
      studioCreatorInit.mockResolvedValue({ communityId: -7, studioId: 'studio-1' });

      await slackInteractivity(click('approve_community'), res);

      expect(sdk.users.updateProfile).toHaveBeenCalledWith({
        id: USER_ID,
        metadata: { communityId: -7, studioId: 'studio-1', communityStatus: 'APPROVED' },
      });
      expect(blockText('community_actions')).toBe(
        'User request to become part of the Community has been approved'
      );
    });

    it('approves a creator with no creative specialty', async () => {
      sdk.users.show.mockResolvedValue(userWith({ communityStatus: 'APPLIED' }, {}));
      studioCreatorInit.mockResolvedValue({ communityId: -7, studioId: 'studio-1' });

      await slackInteractivity(click('approve_community'), res);

      expect(studioCreatorInit).toHaveBeenCalledWith(
        expect.objectContaining({ attributes: { creativeSpecialty: '', location: undefined } })
      );
      expect(sdk.users.updateProfile).toHaveBeenCalled();
    });

    it.each([
      ['a failed call (the empty answer)', {}],
      ['no communityId', { studioId: 'studio-1' }],
      ['no studioId', { communityId: -7 }],
    ])(
      "changes nothing when the webapp returns %s, and says it couldn't be reached",
      async (_, answer) => {
        studioCreatorInit.mockResolvedValue(answer);

        await slackInteractivity(click('approve_community'), res);

        expect(sdk.users.updateProfile).not.toHaveBeenCalled();
        expect(updatedBlocks()).toContainEqual(BLOCKS[2]);
        expect(blockText('community_actions_note')).toBe(
          ":warning: The webapp couldn't be reached. Try again."
        );
      }
    );
  });
});
