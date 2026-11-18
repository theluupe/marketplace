# Auth0 log stream: Auth0's logs kept in Google Cloud

> **Status:** ⏸️ Parked 2026-11-16 (Rafael), not built. Account linking no longer needs it: its own code logs the
> steps that pass through the Marketplace, and Auth0's 5 days of logs cover the rest ([account-linking.md](./account-linking.md)
> D15, §5.6). Kept for the day history beyond 5 days is wanted; the rest of this spec is as it stood. Written
> 2026-11-12 from Rafael's pick of that day (account linking's old D15); L2 answered 2026-11-13, L1 on 2026-11-16 (§6).
>
> **Goal:** Auth0 keeps 5 days of logs on our plan (Essentials). That is too short to check anything after a weekend,
> or to look back at a login problem someone reports a week later. This sends every Auth0 log event to Google Cloud
> Logging, next to the apps' own logs, where it can be searched and alerted on.
>
> **Scope.** In: one Marketplace endpoint that receives Auth0's events and writes them to its log; one Auth0 log stream
> per tenant (QA, PROD) pointed at it; a count of Auth0's rate-limit entries (§5, L2). Out: other alerts (possible
> later, §6), any change to what Auth0 logs, a third-party logging service.
>
> **When:** not scheduled. Until 2026-11-16 it was to be on PROD before account linking's Action (its side track B),
> so the Action's first weeks and the old-pairs data check had more than 5 days of logs.

---

## 1. Why this way

| Option | Verdict |
|---|---|
| Auth0's built-in stream to a cloud | None for Google Cloud. Auth0 offers AWS EventBridge, Azure Event Grid, Datadog, Splunk, Sumo Logic, Mixpanel, Segment and a generic **HTTP webhook** |
| A third-party service (Datadog etc.) | A new vendor and bill for about 40 events a day. Not worth it |
| **The HTTP webhook to an endpoint of ours, written to Cloud Logging** | ✅ Chosen. Auth0's plan allows one stream, which this uses |

Why the Marketplace hosts it: it is on PROD, it already handles Auth0 logins, and it stays after the webapp goes. A
separate service would be one more thing to deploy for one route.

## 2. How Auth0's HTTP stream behaves

- Auth0 POSTs batches of log events to the URL, with the `Authorization` header we give it, in the format we pick
  (JSON Lines, a JSON array, or one JSON object per request).
- Delivery is at least once: a batch can arrive twice. Each event carries its own `log_id`, so duplicates can be told
  apart when reading.
- If the endpoint keeps failing, Auth0 retries; after **7 days** of failures it **pauses** the stream, and someone has
  to resume it in the dashboard.
- Volume today: PROD about 40 events a day (logins, code exchanges, warnings, API rate limits); QA fewer.

## 3. The endpoint (Marketplace)

`POST /api/auth0-log-stream`

1. **Checks the token.** The `Authorization` header must equal `Bearer <AUTH0_LOG_STREAM_TOKEN>`, compared in constant
   time (as `server/api/slack/` does with `crypto.timingSafeEqual`). Otherwise `401`, with nothing logged from the body.
2. **Reads the body itself.** It must reach the route unparsed: `server/index.js` parses `json` bodies for the whole
   app when the CSP is on, with body-parser's 100 KB default, so the route is registered where that parser doesn't take
   the body first, the way `/slack/interactivity` takes its own parser in `apiRouter.js`. Body limit: a few MB.
3. **Writes one log line per event** to stdout as JSON, which Cloud Run turns into a structured log entry:
   `{ "severity": …, "message": "auth0 <type>", "source": "auth0", "auth0": <the event> }`. The severity follows the
   event's type: failures (`f*`) and limits (`api_limit`) as `WARNING`, the rest `INFO`. A line that doesn't parse is
   logged as one `ERROR` entry, without its content, and skipped.
4. **Answers `200`** once the lines are written, so Auth0 doesn't resend.

New code: `server/api/auth0LogStream.js` (the handler) and `server/api-util/auth0LogStream.js` (parsing and the line
format), with server tests: a wrong or missing token gets `401`; a batch of N events writes N lines; a bad line is
skipped and the rest still written; a duplicate is written again, not rejected.

New variable: `AUTH0_LOG_STREAM_TOKEN` (`openssl rand -base64 32`, one per environment), in `config-check`, Cloud Run
and TL_README's Auth0 section.

## 4. Auth0 (Rafael, in the dashboard: QA first, then PROD)

Monitoring → Streams → Create Stream → **Custom Webhook**:

| Field | QA | PROD |
|---|---|---|
| Name | `Google Cloud (Marketplace)` | The same |
| Payload URL | `https://market.qa.theluupe.com/api/auth0-log-stream` | `https://theluupe.com/api/auth0-log-stream` |
| Authorization Token | `Bearer <QA's AUTH0_LOG_STREAM_TOKEN>` | `Bearer <PROD's>` |
| Content Format | JSON Lines | The same |
| Filters | None: every category (the volume is small) | The same |

Each tenant's events land in its own environment's Google Cloud project, through that environment's Marketplace.

## 5. Reading the logs

Logs Explorer, in the environment's project: `jsonPayload.source="auth0"`, narrowed with `jsonPayload.auth0.type`,
`jsonPayload.auth0.client_name` or `jsonPayload.auth0.user_name`. Cloud Logging's default bucket keeps them **30 days**
(§6, L1).

**The rate-limit count (L2):** a log-based metric, `auth0_api_limit`, counting
`jsonPayload.source="auth0" AND jsonPayload.auth0.type="api_limit"`, one per environment.

**Privacy.** The events hold people's emails, IP addresses and browsers, as Auth0's own logs do. They're kept 30 days
in the project, readable by whoever can read the project's logs.

## 6. Open points

- **L1 – how long to keep them.** Decided 2026-11-16 (Rafael): Cloud Logging's default 30 days, with no extra setup.
  Longer would need a log bucket with its own retention and a sink; cheap at this volume, but one more piece of setup,
  so it waits until a case needs more than 30 days.
- **L2 – alerts.** Decided 2026-11-13 ([account-linking](./account-linking.md) D28): one, a count of Auth0's
  `api_limit` entries (a log-based metric), since the rate limit is what makes the linking Action's lookup or link
  fail (its D17, D23); whether it also emails someone is settled when it's built. Still for later: a burst of failed
  logins, and the stream itself going quiet (which is how a paused stream would show).
- **L3 – the content type Auth0 sends with JSON Lines**, and its batch sizes: confirmed on QA before PROD, since the
  body limit and the parser depend on them.

## 7. Check (QA, then PROD)

| # | Action | Expected |
|---|---|---|
| 1 | Log in to the Marketplace with a test account | Within a minute, Logs Explorer shows `auth0 s` (success) and `auth0 seacft` (code exchange) for that email |
| 2 | Log in with a wrong password | An `auth0 fp` entry at `WARNING` |
| 3 | `curl -X POST <endpoint>` with no or a wrong token | `401`; nothing logged from the body |
| 4 | Auth0 → Monitoring → Streams | The stream is Active, with no recent errors |
