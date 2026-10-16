const crypto = require('crypto');
const express = require('express');

jest.mock('./slackInteractivity', () => ({ slackInteractivity: jest.fn() }));

const { slackBodyParser, verifySlackRequestMiddleware } = require('./index');

const SIGNING_SECRET = 'test-signing-secret';
const BODY = `payload=${encodeURIComponent(JSON.stringify({ type: 'block_actions' }))}`;

const sign = (body, timestamp, secret = SIGNING_SECRET) =>
  `v0=${crypto
    .createHmac('sha256', secret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')}`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('Slack interactivity: the request must be signed by Slack', () => {
  let server;
  let url;
  let handler;
  const savedSecret = process.env.SLACK_SIGNING_SECRET;

  beforeAll(async () => {
    const app = express();
    app.post('/slack', slackBodyParser, verifySlackRequestMiddleware, (req, res) =>
      handler(req, res)
    );
    await new Promise(resolve => {
      server = app.listen(0, resolve);
    });
    url = `http://127.0.0.1:${server.address().port}/slack`;
  });

  afterAll(() => {
    server.close();
    process.env.SLACK_SIGNING_SECRET = savedSecret;
  });

  beforeEach(() => {
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
    handler = jest.fn((req, res) => res.status(200).send(req.body.payload));
  });

  const post = (headers, body = BODY) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body,
    });
  const signed = (timestamp = nowSeconds(), body = BODY) => ({
    'x-slack-request-timestamp': String(timestamp),
    'x-slack-signature': sign(body, timestamp),
  });

  it('lets a request signed by Slack through, with its payload parsed', async () => {
    const res = await post(signed());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JSON.stringify({ type: 'block_actions' }));
  });

  it.each([
    ['no signature or timestamp', {}],
    ['no timestamp', { 'x-slack-signature': sign(BODY, nowSeconds()) }],
    [
      'a signature made with another secret',
      {
        'x-slack-request-timestamp': String(nowSeconds()),
        'x-slack-signature': sign(BODY, nowSeconds(), 'another-secret'),
      },
    ],
    ['a timestamp more than 5 minutes old', signed(nowSeconds() - 6 * 60)],
    ['a timestamp more than 5 minutes ahead', signed(nowSeconds() + 6 * 60)],
  ])('refuses a request with %s and never runs the action', async (_, headers) => {
    const res = await post(headers);
    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it('refuses a body changed after Slack signed it', async () => {
    const res = await post(signed(), `${BODY}&token=forged`);
    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it('refuses everything when the signing secret is not set', async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const res = await post(signed());
    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });
});
