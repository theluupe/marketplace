const crypto = require('crypto');
const bodyParser = require('body-parser');

const { slackInteractivity } = require('./slackInteractivity');

// Slack's request signing (spec/v0/login-and-registration.md §10.2.1):
// https://api.slack.com/authentication/verifying-requests-from-slack
const SIGNATURE_VERSION = 'v0';
// Slack's own limit, both ways, so an old request can't be replayed.
const MAX_AGE_SECONDS = 60 * 5;

// Slack signs the body exactly as it sent it, so keep those bytes before they're parsed.
const slackBodyParser = bodyParser.urlencoded({
  extended: true,
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
});

const isSignedBySlack = (req, signingSecret) => {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!req.rawBody || typeof signature !== 'string' || !/^\d+$/.test(timestamp || '')) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_AGE_SECONDS) {
    return false;
  }

  const expected = `${SIGNATURE_VERSION}=${crypto
    .createHmac('sha256', signingSecret)
    .update(`${SIGNATURE_VERSION}:${timestamp}:${req.rawBody}`)
    .digest('hex')}`;
  const received = Buffer.from(signature);
  return (
    received.length === expected.length && crypto.timingSafeEqual(received, Buffer.from(expected))
  );
};

const verifySlackRequestMiddleware = (req, res, next) => {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error('Slack interactivity: SLACK_SIGNING_SECRET is not set');
    return res.status(400).send('Verification failed');
  }
  if (!isSignedBySlack(req, signingSecret)) {
    console.debug('Slack interactivity: request not signed by Slack');
    return res.status(400).send('Verification failed');
  }
  next();
};

module.exports = {
  slackBodyParser,
  verifySlackRequestMiddleware,
  slackInteractivity,
};
