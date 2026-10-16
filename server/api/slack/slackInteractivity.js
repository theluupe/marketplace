const { WebClient } = require('@slack/web-api');

const { identifyUserEvent, trackManagementAPIEvent } = require('../../api-util/analytics');
const { approveCommunity, approveSeller } = require('../../api-util/creatorApproval');
const { COMMUNITY_STATUS, SELLER_STATUS } = require('../../api-util/metadataHelper');
const { integrationSdkInit } = require('../../api-util/scriptManager');

const SELLER_ACTIONS_BLOCK_ID = 'seller_actions';
const COMMUNITY_ACTIONS_BLOCK_ID = 'community_actions';

const SLACK_ACTIONS = {
  approveSeller: 'approve_seller',
  rejectSeller: 'reject_seller',
  approveCommunity: 'approve_community',
  rejectCommunity: 'reject_community',
};

const isSellerAction = action =>
  action === SLACK_ACTIONS.approveSeller || action === SLACK_ACTIONS.rejectSeller;
const isApproveAction = action =>
  action === SLACK_ACTIONS.approveSeller || action === SLACK_ACTIONS.approveCommunity;

const outcomeText = action => {
  const result = isApproveAction(action) ? 'approved' : 'rejected';
  return isSellerAction(action)
    ? `User has been ${result} to be a Seller`
    : `User request to become part of the Community has been ${result}`;
};

// A failure whose cause the message names, instead of the general "Couldn't complete this".
const failureWithNote = note => Object.assign(new Error(note), { slackNote: note });

const textBlock = (blockId, text) => ({
  type: 'section',
  block_id: blockId,
  text: { type: 'mrkdwn', text, verbatim: false },
});

// Rewrites the clicked decision in the message: its buttons become `text`, or, with
// `keepButtons`, stay with `text` under them. A note left by an earlier failed click on that
// decision goes either way.
const chatUpdate = async (click, text, { keepButtons = false } = {}) => {
  const { action, channel, ts, blocks } = click;
  const blockId = isSellerAction(action) ? SELLER_ACTIONS_BLOCK_ID : COMMUNITY_ACTIONS_BLOCK_ID;
  const noteBlockId = `${blockId}_note`;
  const slackBotToken = process.env.SLACK_BOT_TOKEN;

  const parsedBLocks = blocks
    .filter(block => block.block_id !== noteBlockId)
    .flatMap(block => {
      if (block.block_id !== blockId) return [block];
      return keepButtons ? [block, textBlock(noteBlockId, text)] : [textBlock(blockId, text)];
    });
  const payload = {
    text: 'User action has been processed.',
    blocks: parsedBLocks,
    channel,
    ts,
  };
  const webClient = new WebClient(slackBotToken);
  await webClient.chat.update(payload);
};

// The approvals are shared with the job's automatic approval (api-util/creatorApproval.js).
const approveSellerHandler = approveSeller;

async function approveCommunityHandler(userId, userAttributes) {
  const metadata = await approveCommunity(userId, userAttributes);
  if (!metadata) {
    throw failureWithNote("The webapp couldn't be reached. Try again.");
  }
  return metadata;
}

async function rejectSellerHandler(userId, userAttributes) {
  console.warn(`--- REJECT SELLER: ${userId}`);
  const { email } = userAttributes;
  const eventUser = { id: userId, email };
  const eventTraits = {
    sellerStatus: SELLER_STATUS.WAITLISTED,
  };
  identifyUserEvent(eventUser, eventTraits);
  trackManagementAPIEvent('NEW_CREATOR | MARKET_SELLER - Waitlisted', eventUser);
  const reviewedAt = new Date();
  const metadata = { sellerStatus: SELLER_STATUS.WAITLISTED, reviewedAt: reviewedAt.toUTCString() };
  return metadata;
}

async function rejectCommunityHandler(userId, userAttributes) {
  console.warn(`--- REJECT COMMUNITY: ${userId}`);
  const { email } = userAttributes;
  const eventUser = { id: userId, email };
  trackManagementAPIEvent('NEW_CREATOR | COMMUNITY - Waitlisted', eventUser);
  const metadata = { communityStatus: COMMUNITY_STATUS.WAITLISTED };
  return metadata;
}

const DECISION_HANDLERS = {
  [SLACK_ACTIONS.approveSeller]: approveSellerHandler,
  [SLACK_ACTIONS.rejectSeller]: rejectSellerHandler,
  [SLACK_ACTIONS.approveCommunity]: approveCommunityHandler,
  [SLACK_ACTIONS.rejectCommunity]: rejectCommunityHandler,
};

// Clicks being handled, one per person and decision. The status only changes at the end of the
// work, so a double click would otherwise approve twice. The Marketplace runs a single instance
// (spec/v0/login-and-registration.md §9.4.5), so memory is enough.
const decisionsInProgress = new Set();

const slackInteractivity = async (req, res) => {
  // Slack wants an answer within 3 seconds and the work can take longer: without one, the
  // operator sees "didn't respond" and clicks again. The outcome goes into the message instead
  // (spec/v0/login-and-registration.md §3.6.2). The work after the answer needs Cloud Run's CPU
  // always allocated (§9.4.5).
  res.sendStatus(200);
  console.warn('\nStarting slack interactivity service..');
  let click;
  try {
    const payload = JSON.parse(req.body.payload);
    const [{ action_id: action, value: userId }] = payload.actions;
    const { ts, blocks } = payload.message;
    click = { action, userId, channel: payload.channel.id, ts, blocks };
  } catch (error) {
    console.error('Slack interactivity: unreadable payload', error?.message);
    return;
  }
  const { action, userId } = click;
  console.warn(`--- action:`, action);
  console.warn(`--- userId:`, userId);
  const decisionHandler = DECISION_HANDLERS[action];
  if (!decisionHandler) {
    console.warn(`--- NO ACTION REQUIRED`);
    return;
  }
  const decision = isSellerAction(action) ? 'seller' : 'community';
  const decisionKey = `${decision}:${userId}`;
  if (decisionsInProgress.has(decisionKey)) {
    console.warn(`--- already being handled, click ignored`);
    return;
  }
  decisionsInProgress.add(decisionKey);
  try {
    const integrationSdk = integrationSdkInit();
    const response = await integrationSdk.users.show({ id: userId });
    const user = response.data.data;
    const userAttributes = user.attributes;
    const { email } = userAttributes;
    console.warn(`--- email:`, email);
    // Approve once (spec/v0/login-and-registration.md §3.6.1): approving twice created a second
    // published profile listing. Rejecting is unchanged.
    const { sellerStatus, communityStatus } = userAttributes.profile.metadata || {};
    const currentStatus = isSellerAction(action) ? sellerStatus : communityStatus;
    const appliedStatus = isSellerAction(action) ? SELLER_STATUS.APPLIED : COMMUNITY_STATUS.APPLIED;
    if (isApproveAction(action) && currentStatus !== appliedStatus) {
      await chatUpdate(
        click,
        `Nothing changed: this user's ${decision} status is already ${currentStatus || 'not set'}`
      );
      return;
    }
    const metadata = await decisionHandler(userId, userAttributes);
    await integrationSdk.users.updateProfile({
      id: userId,
      metadata,
    });
    await chatUpdate(click, outcomeText(action));
    console.warn('Slack interactivity service DONE\n');
  } catch (error) {
    console.error(`Slack interactivity: ${action} failed | userId: ${userId} |`, error?.message);
    console.warn(`--- error`, error?.data);
    console.warn(`--- metadata`, error?.data?.response_metadata);
    const note = error?.slackNote || "Couldn't complete this. Try again.";
    await chatUpdate(click, `:warning: ${note}`, { keepButtons: true }).catch(updateError =>
      console.error('Slack interactivity: the message could not be updated', updateError?.message)
    );
  } finally {
    decisionsInProgress.delete(decisionKey);
  }
};

module.exports = {
  slackInteractivity,
};
