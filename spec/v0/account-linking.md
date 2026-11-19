# Account linking: one account per email, linked by the person, through the Marketplace

> **Status:** 🟡 Pending. Written 2026-11-11 from Rafael's decisions of that day (§2); updated 2026-11-12 with the
> build plan (§10), the Auth0 apps and APIs audit (§1.4) and his answers to it (D8–D10), then with the step-0 review
> (D11–D16, §7.0 written out step by step) and a correction: Auth0 stops running Rules on 2028-01-31, not on
> 2026-11-18 as first written (§1.1); the plan stands (D8). Step 0 (§7.0) done and confirmed on QA (2026-11-12)
> and PROD (2026-11-13) (step 18). Grilled 2026-11-13 (§2.1, D17–D28): the biggest change is that the old pairs are
> merged **before** go-live, in the same release, so nobody is exempt (D4, D20, §8). On 2026-11-16 phase 0.3 was done
> on QA and confirmed, and the copy of Auth0's logs in Google Cloud was dropped: the linking code logs its own steps
> instead (D15, §5.6). Side track A and phase 1 built the same day; side track A committed on the webapp 2026-11-17
> (`2c12a8a9`), and a broken setup now stops the login instead of failing silently (D29); phase 2 (the Marketplace
> server) built the same day, uncommitted, and phase 3 (the linking page) too. Next: phase 4, the first real run of a
> local Marketplace against QA's Auth0, which starts with Rafael's Auth0 steps (4.1); the specs stay uncommitted until
> he says.
>
> **Goal:** replace the Auth0 "Account Link" extension, a deprecated Rule whose leaked secret can't be changed (§1.4),
> with our own flow: a person who logs in with a second method (Google after a password, say) must link it to the
> account that already has their email, or gets no second account.
>
> **Scope.** In: a new Auth0 Action, saved in the webapp and Studio repos (D10); a linking page in the Marketplace;
> the Auth0 setup on QA and PROD; step 0 (§7.0): removing the Rule, the extension and the Auth0 apps and APIs nobody
> uses, tightening the kept apps and the tenant settings, and setting Auth0 up for Studio on PROD (D11–D13); merging
> the duplicate accounts that already exist, before go-live (§8, D20); and new copy for the apps' "second account"
> pages, which stay as the safety net (D25). Alongside, with its own spec: the webapp's
> rate-limit fix (D14). Out: email verification (stays off, §1.1), Popup Studio's screens, Studio's code (Studio's
> repo only gets the Action's copy and its tests), a copy of Auth0's logs outside Auth0 (D15).
>
> **Baseline:** Marketplace `dev` @ `e92dfc85f`. Auth0 as read on 2026-11-11 through a read-only app on both tenants
> (QA `theluupe-dev`, PROD `theluupe`), not only as saved in `webapp/etc/auth0/` and `studio/etc/auth0/`.
>
> **Builds on:** [`login-and-registration.md`](./login-and-registration.md) §8.3, which left account linking to this
> work and built the Marketplace's "second login" error page (BR22).

---

## 1. Today

### 1.1 What Auth0 has (both tenants, 2026-11-11)

| | QA (`theluupe-dev`) | PROD (`theluupe`) |
|---|---|---|
| **Rules** | One: `auth0-account-link-extension`, enabled | The same, enabled. Its code is the repo copy (`webapp/etc/auth0/rules/`, identical in `studio/`), hard-coded secret included (login spec S9) |
| **Hooks** | None | None |
| **Post-login Actions** | Metadata standardization, MARKET / STUDIO / WEBAPP metadata | Metadata standardization, MARKET / STUDIO metadata |
| **Login methods** | Password, Google; LinkedIn and Microsoft exist but are on no app (2 and 0 users) | Password, Google |
| **Custom domain** | `auth.qa.theluupe.com` | `auth.theluupe.com` |
| **Apps people log in to** | Sharetribe (QA), Web App, Studio (QA), Circle (a sandbox), Retool | Sharetribe, Web App, Circle, Retool |
| **Extension's apps** | `Account Linking` (used by the Rule), `auth0-account-link` | The same |
| **Other apps and APIs** | Several unused, one with near-admin access (§1.4) | Several unused (§1.4) |
| **Email verification** | Not enforced: the repo's `Force-email-verification` Action is deployed on neither tenant | The same |
| **Logs kept** | About 5 days | About 5 days |

Rules have been read-only since 2024-11-18 (their code can't be created or changed) and stop running on
**2028-01-31**; Hooks stop on 2027-04-30 (Auth0's deprecations page, read 2026-11-12). Until 2026-11-12 this spec said
Rules stop on 2026-11-18, which was wrong. The Rule is the only thing affected: everything else already runs as
Actions. Rules and Actions run on Node 22 on both tenants, so Auth0's Node 18 deprecation (2026-11-10) doesn't touch
them.

### 1.2 How linking works today

On a person's **first** login with a method, if another Auth0 user has the same email, the Rule sends them to the
extension's page (hosted by Auth0 on webtask). There they log in with the other account; the Rule then joins the new
login into it, and the joined user keeps the original id. Skipping the page leaves two separate Auth0 users, and the
page is never offered again.

When two users exist, each app sees two people: the Marketplace shows its "second login" error page (login spec §8.3),
the webapp its 409 page, Studio its 409.

### 1.3 How much it's used (PROD, 2026-11-11)

| | |
|---|---|
| Users / active in the last 30 days | 6,101 / 182 |
| Linked users | 198 (68 logged in within the last 12 months). Links survive the Rule's end |
| Emails held by two separate users ("old pairs") | 213 (426 users); in 68 pairs both accounts logged in more than once |
| New second accounts, last 12 months | 21 (about 2 a month), plus the ones the Rule linked (1 in the 5 days of logs) |
| Second method is Google | 50 of 57 since 2025 |
| Password accounts created in the last 12 months that are verified | 61 of 248 |

QA: 1,452 users, 4 linked, 10 old pairs.

### 1.4 Auth0 apps and APIs (audit, 2026-11-11)

Read with the read-only app: each app's settings, permissions and login methods, its activity in the ~5 days of logs,
and whether any repo in the workspace mentions its id. What to do with each is §7.0.

**The extension's apps.** `Account Linking` (both tenants) is the app the Rule uses. Its PROD secret is the one
hard-coded in the webapp's and Studio's copies of the Rule (login spec S9). It holds Management API permissions to
read users and delete apps, and Rule permissions that no longer work now that Rules are read-only. The secret also
signs the token that tells the Rule a link was approved, and the Rule only checks that the token's email matches the
login's own. So anyone with the repos could, in principle, merge any account into one of their own (read from the
code, not tried). The secret can't be changed, since the Rule's code is read-only. Last used 2026-11-09. `auth0-account-link` (both tenants, created 2025-10-07) has the
same 10 permissions, was never used and is mentioned nowhere. Neither fits the Action: a leaked secret, set up for the
extension's interactive logins, with Rule and app permissions instead of user ones (D8).

**Every app and API, and what step 0 does with it** (reviewed again 2026-11-12). "Unused" means no activity in the
~5 days of logs, mentioned in no repo, or nothing asks Auth0 for it.

**Apps, QA**

| App | Verdict | Why |
|---|---|---|
| `Sharetribe (QA)` | Keep | The Marketplace's logins |
| `Web App` | Keep | The webapp's logins. The landing also uses its settings, to read the webapp's login session (the cookie shared on `.theluupe.com`) and recognise logged-in visitors. The landing never runs a login itself: its `/api/auth/*` addresses answer 404 |
| `Studio (QA)` | Keep | Studio's logins; Studio's API reads Auth0 users through it (`read:users`, `update:users`) |
| `Claude read-only` | Keep until §7.3 | This review's read-only access |
| `Account Linking`, `auth0-account-link` | Delete | The extension's (D8) |
| `API Explorer Application` | Delete | 90 Management API permissions, write included: near-admin, and unused |
| ` Sharetribe (QA) (Test Application)` | Delete | The test app Auth0 makes for each API; can read and update users; unused |
| `GraphQL API (QA)` (the app) | Delete | Auto-made test app, unused |
| `Salesforce Integration QA`'s test app | Delete | No Salesforce code anywhere |
| `Storage Manager` | Delete | storage-manager checks an API key, not Auth0 tokens |
| `Retool (QA)` | Delete | Retool is no longer used (D9) |
| `Circle (QA) (Test Application)` | Delete | Circle's sandbox, no longer used (D9) |

**Apps, PROD**

| App | Verdict | Why |
|---|---|---|
| `Sharetribe` | Keep | The Marketplace's logins (21 in 5 days) |
| `Web App` | Keep | The webapp's logins (13 in 5 days); the landing reads its session, as on QA |
| `Circle (Test Application)` | Keep, renamed `Circle` | Circle's logins (14 in 5 days) |
| `Studio` | **Create** | Studio's app on PROD, a copy of `Studio (QA)` (D12) |
| `Claude read-only` | Keep until §7.3 | |
| `Account Linking`, `auth0-account-link` | Delete | D8 |
| `Retool` | Delete | D9 |
| `Sharetribe (Test Application)` | Delete | Auto-made test app, unused |
| `GraphQL API (QA)` (an app on PROD, despite its name) | Delete | Auto-made test app, unused |
| `Storage Manager  (Test Application)` | Delete | storage-manager checks an API key |

**APIs, QA**

| API | Verdict | Why |
|---|---|---|
| Auth0 Management API | Keep | Auth0's own |
| `GraphQL API (QA)` (`https://app.qa.theluupe.com/graphql`) | Keep | The API the Marketplace, the webapp and Studio all log in with |
| ` Sharetribe (QA)` (`https://market.qa.theluupe.com`) | Delete | Nothing logs in with it: the Marketplace asks for the GraphQL API. Its address only prefixes the Marketplace's claim names, which need no API |
| `Salesforce Integration QA` | Delete | No Salesforce code anywhere |
| `storage-manager` | Delete | storage-manager checks an API key. `Studio (QA)`'s empty permission on it goes with it |
| `Circle (QA)` | Delete | D9 |

**APIs, PROD**

| API | Verdict | Why |
|---|---|---|
| Auth0 Management API | Keep | Auth0's own |
| `GraphQL API` (`https://app.theluupe.com/graphql`) | Keep | The API the Marketplace and the webapp log in with (22 of 22 and 13 of 13 logins), and Studio's on PROD (`studio/.env.prod`) |
| `Sharetribe` | Delete | Nothing logs in with it, as on QA |
| `Circle` | Delete | Circle's 13 logins asked for no API, only the person's profile |
| `Storage Manager ` | Delete | storage-manager checks an API key |

Deleting an API that an app still asks for breaks that app's logins, so step 0 logs in to every kept app straight
after (§7.0, step 17). Recreating the API with the same address undoes it in a minute.

**Settings before step 0:**

- **Grant types.** Every kept login app allows the implicit grant (the token sent straight to the return address) and
  the password grant (the app collects the password itself and sends it to Auth0, with no Auth0 page). No login in
  PROD's 5 days used either: all were code exchanges (Sharetribe 21, Web App 13, Circle 14), and the apps' code asks
  only for the code flow. A password-grant login would also skip the linking page, which needs a browser redirect.
- **Return addresses on hosts we don't control.** QA `Web App` has three domains that no longer exist
  (`theluupe.betabuild.dev`, `theluupe.marcusvinicius.info`, `theluupe.reversetunnel.net`), which anyone could
  register, and `theluupe.loca.lt` and `xyz.sa.ngrok.io`, which anyone can claim. Whoever holds such an address could
  receive people's logins. `theluupe-dev.ngrok.io` (in `Sharetribe` and `Web App`, both tenants) is Rafael's.
- **Dead return addresses of ours.** `Web App`'s callbacks on the landing's domains (`landing.qa.theluupe.com`,
  `studio.theluupe.com`) and on `theluupe.com` (now the Marketplace), whose `/api/auth/callback` answers 404; PROD
  `Sharetribe`'s `market.theluupe.com`, which doesn't answer.
- **Opening Auth0's login page directly** (a bookmark, a tab left open, `auth.theluupe.com/u/login`) shows the
  webapp's `/error-auth` page ("You may have pressed the back button…"), because no Tenant Login URI is set: 20 times
  in PROD's 5 days, from 8 browsers (D13).
- **Rate limit.** PROD `Web App` hit the Management API's rate limit 21 times in 5 days: a webapp bug (D14).
- **Tenant.** Support email and URL empty. Breached password detection off; it needs the Professional plan, and the
  tenant is on Essentials. PROD's brute-force protection exempts one IP, `168.149.245.28`, in a Palo Alto Networks
  range (a corporate VPN's exit) that nobody recognises. QA has LinkedIn (2 users) and Microsoft (0 users) login
  methods on no app. No log streams, so logs last 5 days (D15).

## 2. Decisions (Rafael, 2026-11-11)

| # | Decision |
|---|---|
| D1 | **Linking is forced.** A login whose email another account already has goes to our linking page and must log in with that account to continue |
| D2 | **Only the existing account's methods are shown.** If the original logs in with a password, the page offers only the password; if with Google, only Google |
| D3 | **Refusing creates nothing.** Cancel shows an error straight away, and no app ever sees the new account; it's deleted from Auth0 (§5.4) |
| D4 | **It applies to everyone, from the first day.** The old pairs are merged, app data included, before the Action goes live, in the same release (§8, D20). *Changed 2026-11-13: until then they were to stay exempt until a later merge, because merging only in Auth0 would orphan one account's app data* |
| D5 | **The linking page lives in the Marketplace**, the app that manages user creation from now on |
| D6 | **No deadline pressure: do it right.** From the Rule's removal (step 0, D8) until this ships, a second login makes a second Auth0 user and the apps' existing error pages show (§1.2), about 2 people a month. The pairs made in that gap are old pairs (§8) |
| D7 | **The newer account links into the older one, and the older one is never blocked or prompted** (agreed with the edge cases, 2026-11-11). Otherwise a stranger's password sign-up with someone's email could lock them out of their own account. The older account is the one with the app data, so the person keeps their original id and everything on it |
| D8 | **The Rule goes now, ahead of the Action** (2026-11-12): on both tenants, disable it, uninstall the extension and delete its two apps (§7.0). Deleting `Account Linking` is what makes the leaked secret useless; it stays in the repos' git history. Confirmed after the date correction (§1.1): the Rule could run until 2028-01-31, but its secret can't be changed and could merge any account (§1.4), so linking stops until this ships, which D6 already accepts. Reusing the extension from an Action was ruled out: Auth0 has no Actions version, the community port is reported to fail with custom domains (we use them), and the extension lets people skip linking, against D1. The Action gets a new app of its own (§7.1) |
| D9 | **Unused Auth0 apps and APIs are deleted in the same step** (2026-11-12), with Retool (no longer used anywhere) and Circle's QA sandbox (Circle runs on PROD only) among them (§1.4, §7.0) |
| D10 | **The Action's code lives in the webapp and Studio repos** (2026-11-12), identical in both, next to the other Actions (`etc/auth0/actions/`): the webapp is today's code, kept for maintenance, and Studio is the new one. The Marketplace holds no copy. **Tests in Studio only**, and the Rule's copies are removed from both repos (§4.1) |
| D11 | **Step 0 also tightens the kept apps and the tenant** (2026-11-12): the implicit and password grants off on every login app; the return addresses we don't control and the dead ones removed, while `localhost` and Rafael's `theluupe-dev.ngrok.io` stay; QA's unused LinkedIn and Microsoft login methods deleted; the support email and URL set; PROD's allowlisted IP removed. Breached password detection stays off: it needs the Professional plan (§1.4, §7.0) |
| D12 | **Auth0 is set up for Studio on PROD now** (2026-11-12), so that removing the webapp later needs no new Auth0 app or Action: a `Studio` app copied from `Studio (QA)`, and the `STUDIO` roles Action with Studio's claim name. The webapp's Action and app go with the webapp, listed in Studio's [webapp deprecation spec](../../../studio/spec/v3/webapp-deprecation.md) (§7.0, steps 14–16) |
| D13 | **Auth0's default login route is the Marketplace's login** (2026-11-12): whoever opens Auth0's login page without a login in progress is sent to `<Marketplace>/api/auth/auth0/login`, which starts a fresh login and shows the login page again, working this time. Afterwards they're in the Marketplace. Today they get the webapp's error page (§1.4, §7.0 step 11) |
| D14 | **The webapp's rate-limit bug is fixed first** (2026-11-12), with its own spec ([webapp `spec/role-lookup-rate-limit.md`](../../../webapp/spec/role-lookup-rate-limit.md)): its bursts fill the Management API limit that the Action's lookup shares (D17). Studio's auth spec records the rule so that Studio doesn't repeat the bug |
| D15 | **The linking code logs its own steps; Auth0's logs stay in Auth0** (2026-11-16, Rafael). Every step that passes through the Marketplace (the page shown, Continue, Cancel and its delete, an expired token, the wrong account, a blocked original) is logged by the Marketplace's server (§5.6), and Cloud Run already keeps what the Marketplace prints in Google Cloud for 30 days. What happens only inside Auth0 (wrong passwords, its rate limit, a link, the Action letting a login through) reaches no app and stays in Auth0's logs, 5 days on our plan; Claude reads them with the read-only app at the moments that matter (§10, phases 4 and 7). *From 2026-11-12 to 2026-11-16 every Auth0 log was to be copied into Google Cloud through Auth0's log stream and a new Marketplace endpoint ([auth0-log-stream.md](./auth0-log-stream.md), now parked): a public address and a secret to manage, for history beyond 5 days that this work doesn't need* |
| D16 | **The first real run is local** (2026-11-12, was G8): a local Marketplace against QA's Auth0 (§10, phase 4), so a fix to the page or the server is a reload, not a QA deploy. It works because the Action only sends the browser to the linking page and Auth0 never calls it, so on the tester's machine `localhost` works, even for logins from QA's deployed webapp and Studio. Accepted: until phase 5, someone else's new duplicate account on QA would land on a page that doesn't load for them; QA showed no logins by anyone else since 2026-11-09. *Until 2026-11-13 an exemption date (`LINKING_FROM`) also limited it to accounts made from that day; D20 removed it, so the Action covers QA's 10 old pairs from phase 4 too. That only matters if someone logs in with one, and those pairs are §8's rehearsal* |
| D17 | **A failed lookup lets the login through** (2026-11-13, G1). If the Management API fails while the Action looks for other accounts, it retries once after about half a second when Auth0 answered 429 (rate limit), then lets the login finish and logs it. The apps' safety-net pages (D25) catch a duplicate that gets through, and the next login looks again. Blocking every login while Auth0 is busy would be worse. *Since 2026-11-17 this covers Auth0 being busy or failing only: a broken setup of our own stops the login instead (D29)* |
| D18 | **Two Auth0 clients, each with the least it needs** (2026-11-13, G2). The Action gets its own app, `Account linking (Action)`, with `read:users` and `update:users` only; its secret never leaves Auth0. Cancel's delete runs in the Marketplace through its existing Management API client (`server/api-util/auth0Helper.js`, the `Sharetribe` app), which gets `delete:users` added. So the Marketplace gets one new variable, the token secret (§7.2) |
| D19 | **A blocked original gets a support message** (2026-11-13, G3): the page with `error=blocked`, no token, no buttons; nothing is linked, the new account stays pending, and support decides (§12) |
| D20 | **The old pairs are merged before go-live, in the same release** (2026-11-13, while grilling G4): D4 loses its exemption, so the Action has no go-live date to check and the original is always the oldest account with the email (G4 is moot). §8 moves onto the critical path, before PROD (§10, phase 6); QA's 10 pairs are its rehearsal |
| D21 | **A page closed half-way needs no design** (2026-11-13, G5). If Auth0 keeps no session, the next login shows the login screen, and the original goes straight in. If it keeps one for the new account, the next login runs the Action again and shows the page, whose Continue always asks for the original's password (`prompt=login`). No app gets a session either way. QA records which one Auth0 does (§11, row 8) |
| D22 | **Continue copies the original login request whole** (2026-11-13, G6): every parameter except the five it sets (§5.3), so an app's own parameters survive without our knowing them. Circle is the reason: a third party, and no QA (D9). It's checked in PROD's smoke test, and one merge test on PROD comes before §8's merges. Circle's own sync problems (members matched and tagged by email, emails that drift between systems) are out: Studio's [user-sync spec §9.5](../../../studio/spec/v2/user-sync-and-brand-onboarding.md) |
| D23 | **A failed link lets the person in as the original** (2026-11-13, G7): one retry on 429, then the login finishes as the original and it's logged. The new account stays pending and is offered again at its next login. *Since 2026-11-17, Auth0 being busy or failing only: a broken setup stops the login (D29)* |
| D24 | **No npm packages in the Action** (2026-11-13, G9): §4.6. The contract is Auth0's `/api/v2/` HTTP API, which is stable; the `auth0` SDK changed shape between v3 and v4, is caret-ranged in our repos, and v4 retries 3 times by default, which would break D17's single retry |
| D25 | **The safety-net pages get new copy and a Log out** (2026-11-13, G1, at Rafael's request): the Marketplace's second-login page, the webapp's `/error-account` and a new Studio page for its 409 say what happened and what to do (§6.1). The Marketplace's and the webapp's pages already have Log out; Studio's is a requirement in its [auth spec §5.3](../../../studio/spec/v1/auth0-authentication.md). Because of D20, "log in the same way again" now leads to the linking page, so the copy can promise it |
| D26 | **§8 is read-only until Rafael has reviewed a summary** (2026-11-13). Nothing is linked or deleted before that. No blind linking: joining a password account into someone's account without them logging in to it would let anyone who signed up with their email take it over, since verification is off. A pair whose newer account holds no app data is left to the Action, where the person proves they own the original; only pairs whose newer account holds data are merged by hand |
| D27 | **The release order** (2026-11-13): phases 1–5 and side track A (B until D15 dropped it), then §8 on QA, then §8 on PROD, then go-live in one sitting (§10, phases 6–7). A final sweep right before the Action is attached, and another right after, cover the pairs made in between |
| D28 | **Smaller decisions** (2026-11-13, the grill's last step): individual cases read in Auth0's dashboard (a count of Auth0's `api_limit` entries in Google Cloud went with the log copy on 2026-11-16, D15); a support runbook (§12); method names "password" and "Google" only; a "Forgot password" hint that says to come back to the tab (§6); no clean-up job for pending accounts, counted once at the close; no "already checked" marker on accounts, since about 10 logins a day don't need it |
| D29 | **A broken setup stops the login; only Auth0 being busy lets it through** (2026-11-17, Rafael: "I don't want silent errors"). If the Action's own setup is wrong (a secret missing, Auth0 refusing its app's credentials or permissions, a domain that doesn't exist), it doesn't pass on its own, and letting logins through (D17, D23) would quietly turn linking off while duplicates pile up. So the login stops on the page's "unavailable" message, which the Marketplace logs as an error (§5.6), and the Action's log says `SETUP ERROR` (§4.7). Accepted cost: while it's broken, nobody can log in to any app; it can only be caused by a change to the Action or its app in Auth0, it shows on the first login after that change, and the fix is in the same place (§12). Sessions already open keep refreshing (§4.2, step 2). Auth0 being busy or failing (429 after the retry, its 5xx errors, a network failure) still lets the login through |
| D30 | **The token travels in `link_token`, not an `ext-` parameter** (2026-11-18, found in phase 4.2, Rafael's pick). Auth0 refuses the whole login when an `ext-` parameter breaks its rules: a value of at most 255 characters from letters, digits and `-_.*~@+ /:`, a name of at most 28 characters after `ext-`, at most 10 of them ([Auth0's limits](https://support.auth0.com/center/s/article/Limit-of-ext-parameters-on-universal-login-page)). The token is about 1,300 characters, so Continue's first real run ended on Auth0's error page (`error parsing ext params`). A plain custom parameter reaches the Action through `event.request.query` too ([Auth0](https://support.auth0.com/center/s/article/Passing-UTM-parameters-on-signup)) and has no such limit. The Marketplace's tests now check Continue's `ext-` parameters against Auth0's rules, since the faked Auth0 can't refuse them. *Fallback if Auth0 ever drops the plain parameter: a short second token (≤255 characters) minted by Continue* |

### 2.1 The grill (2026-11-13)

Every open point was settled with Rafael; the decisions are the D rows above.

| # | Question | Decided |
|---|---|---|
| G1 | The Management API fails while the Action looks for other accounts | D17 |
| G2 | Who deletes the new account on Cancel | D18 |
| G3 | The original is blocked in Auth0 | D19 |
| G4 | More than one older account | Moot: the original is always the oldest (D20) |
| G5 | Auth0's session after a page closed half-way | D21 |
| G6 | Circle | D22 |
| G7 | The link fails after the person logged in as the original | D23 |
| G8 | A local run first | D16 |
| G9 | npm packages in the Action | D24 |

## 3. The flow

**Words.** The **original** is the older account with the email. The **new** account is the newer one. A new account
that hasn't been linked is **pending**: it has never finished a login, so no app has seen it.

1. **First login (the new account).** The person logs in with Google. Auth0 creates the new user (for Google it always
   does, before any Action runs). The Action finds an older account with the same email, so instead of finishing the
   login it sends the person to the Marketplace's linking page with a signed token (§4.4). No app gets a login.
2. **The linking page** says the email already has an account, names its method, and offers one button per method of
   the original ("Log in with your password"), plus **Cancel**.
3. **Continue** starts a fresh login with only that method, the email filled in and the password required even if
   Auth0 remembers someone (`prompt=login`). It carries the app's original login details, so the person ends in the app
   they started from.
4. **Second login (the original).** The Action checks the token and that this is exactly the original account (by id),
   joins the new account's login into it, and lets the login finish. The person is in, as the original.
5. **Cancel** deletes the new account from Auth0, logs out of Auth0 and shows the error (§6). No app saw anything.

### 3.1 Every case

| The person… | What happens |
|---|---|
| Logs in for the first time with an email nobody else has | Nothing changes |
| Logs in with a second method, email already used | Steps 1–4 |
| Closes the page at step 2 or 3 | The new account stays **pending**. Nothing else changes |
| Comes back and logs in with the **new** method | The linking page again, every time, until they link or cancel |
| Comes back and logs in with the **original** | Normal login, no prompt (D7) |
| Cancels | The new account is deleted, they're logged out of Auth0, and the error shows. Trying again starts over |
| At step 3 logs in as some other account | Not linked: "That wasn't the account…" (§6); the new account stays pending |
| Takes more than 15 minutes | The token expires: "This took too long…" (§6). Logging in again starts over |
| Doesn't know the original's password | "Forgot password" on the password screen; the reset email goes to the real owner |
| Is the real owner of an email a stranger signed up with first (password) | The same: reset the password, which takes that account back, then link |
| Has lost access to the original's Google account | Support (§12) |
| An app tries a silent login (`prompt=none`) for a pending account | It fails as "login required": a page can't be shown silently. The account can never get through without the page |
| The original is blocked in Auth0 | "We can't connect this login…" with no buttons; nothing is linked, the new account stays pending (D19, §12) |
| Logs in while the Action's own setup is broken (a secret wrong or missing, its app's permissions removed) | Stopped on "Logging in isn't working right now…"; every login waits for the fix (D29, §12) |
| Logs in while Auth0's Management API is busy or failing | Let through, and logged; an app's safety-net page catches the duplicate, and the next login looks again (D17) |
| Logs in as the original at step 3, but the link fails | In, as the original, and logged; the page again at the new account's next login (D23) |
| Is in an old pair (both accounts made before go-live) | Merged before go-live (§8). A pair §8 leaves to the Action gets steps 1–4 like any other |

## 4. The Auth0 Action "Account linking"

### 4.1 Where

A new post-login Action, **first** in the Login flow, so it decides before the other Actions run. While it sends a
person away, the rest of the flow doesn't run.

Its code is saved as `etc/auth0/actions/account-linking.js` in **both** the webapp and Studio repos, identical, next
to the other Actions (D10). A header in each copy says to keep them identical and that the tests live in Studio. The
tests are `studio/etc/auth0/actions/account-linking.test.mjs`, run by Node's own test runner from Studio's root
`test:scripts`, which is widened from `scripts/*.test.mjs` to take that folder too. The webapp's Jest doesn't look in
`etc/`, and a second copy of the tests would drift.

The Rule's copies, `etc/auth0/rules/auth0-account-link-extension.js` in both repos, are deleted in the same change
(done 2026-11-16; the hard-coded secret stays in git history, retired by step 0).

### 4.2 First login: sending the new account to the page

1. A login that carries a link token (`link_token`, D30) is a second login: §4.3.
2. A refresh-token exchange: nothing to do. It renews a login that already finished, and can't be redirected; asking
   Auth0 on each one would only add calls.
3. No email: nothing to do.
4. Find the other users with this email (Management API, users by email), searched in lowercase: the search is
   case-sensitive, and Auth0 stores password accounts' emails in lowercase. None **older** than this one: nothing to
   do. This account is the original (D7). If the call fails: one retry after about half a second when Auth0 answered
   429, then let the login through and log it (D17).
5. The oldest of them is the original (D20). If it's blocked: send the person to the page with `error=blocked`, no
   token (D19).
6. Otherwise sign the token (§4.4) and send the person to `<Marketplace>/account-linking?token=…`.

Whenever the Action would send the person to the page, here or in §4.3, a login that can't be redirected (a silent
`prompt=none`) is denied with `login_required` instead (§3.1).

*Until 2026-11-16 the silent check was a step of its own, after the blocked check, which a silent login with a
blocked original would have reached with a redirect it can't follow; and refresh-token exchanges weren't mentioned.*

*Until 2026-11-13 a step here skipped accounts made before go-live (`LINKING_FROM`); D20 removed it.*

### 4.3 Second login: linking

1. Verify the token's signature and expiry. Invalid or expired: send the person to the page with `error=expired`.
2. This login must be the token's original, by Auth0 id. Otherwise send them to the page with `error=wrong-account`
   and the same token, so the page can name the email and offer the original's login again.
3. The new account must still exist (found by the token's email, as stored on it), on its own with one login method,
   and with the same email. Otherwise carry on (already linked, or cancelled).
4. Link it into the original (Management API, link a user account). The new user stops existing as its own user.
5. Carry on with the login, as the original. If step 4 fails: one retry on 429, then carry on as the original and
   log it (D23).

### 4.4 The token

Signed by the Action with a secret shared with the Marketplace (HS256), valid **15 minutes**. It holds the new
account's id and method, the original's id, email and methods, the app's name, and **every** parameter of the
original login request, which Continue replays (§5.3, D22). Nobody can use it without then logging in as the
original, which the Action checks.

As built (2026-11-16), a JWT whose claims are:

| Claim | Holds |
|---|---|
| `email` | The email, as stored on the new account (the two accounts share it) |
| `newAccount` | `{ id, connection, provider }`: its Auth0 id and login method |
| `original` | `{ id, methods: [{ connection, provider }] }`: one entry per login method it has |
| `app` | The app's name in Auth0, or `null` |
| `host` | The Auth0 address the login came in on (`event.request.hostname`: the custom domain, or the tenant's own). Continue and Cancel's logout go back to it: an app accepts a login only from the Auth0 address it trusts, and Auth0's session cookie lives there. Added 2026-11-17 |
| `request` | Every parameter of the original `/authorize` request |
| `iat`, `exp` | Issued at, and 15 minutes later |

`connection` is what Continue passes to Auth0; `provider` names the method (`auth0` is the password, `google-oauth2`
Google; §6). The secret is used as UTF-8 text, not decoded, as `jose` does with `new TextEncoder().encode(secret)`.

### 4.5 Secrets

| Secret | Value |
|---|---|
| `LINKING_TOKEN_SECRET` | The shared signing secret (also in the Marketplace, §7.2) |
| `LINKING_PAGE_URL` | `https://market.qa.theluupe.com/account-linking` on QA, `https://theluupe.com/account-linking` on PROD (the PROD Marketplace is `theluupe.com`; `market.theluupe.com` doesn't answer) |
| `AUTH0_DOMAIN`, `CLIENT_ID`, `CLIENT_SECRET` | The `Account linking (Action)` app (§7.1, D18), for the Management API. Its token is cached between logins (`api.cache`). `AUTH0_DOMAIN` is the tenant's own domain (`theluupe-dev.auth0.com`, `theluupe.auth0.com`), not the custom one: the Management API's audience is built from it |

*`LINKING_FROM`, the go-live date, was dropped on 2026-11-13 (D20).*

### 4.6 How it's written (D24, D28)

- **No npm packages.** The token is HS256: one HMAC-SHA256 with Node's `crypto`, the algorithm fixed in the code (a
  token's own `alg` is never trusted), the signature compared in constant time, and the expiry checked.
- **Three `fetch` calls to Auth0**: the Management API token (client credentials), users by email, and linking an
  account. Each cites the Auth0 doc page it follows, next to the call.
- **Tests assert the exact requests** (method, path, body) and feed Auth0's documented answers back, 429 included.
  A token made by the Action is checked by the Marketplace's `jose`, and one made by `jose` by the Action (§10, 1.2
  and 2.4).
- **Logs.** What the Action logs (a failed lookup or link, a blocked original, a link made; Auth0 ids only, never an
  email) is that login's entry in Auth0's logs: Monitoring → Logs → the entry → **Action Details**, which shows each
  Action's console output (Auth0's "Test Actions" page, checked 2026-11-16, phase 1.6). So it's kept as long as Auth0
  keeps logs, 5 days on our plan. The real-time logs view is live only. The usual cause of a failure, Auth0's rate
  limit, is an `api_limit` entry in the same logs. None of this reaches our apps, which see a normal login; what
  passes through the Marketplace is logged there (D15, §5.6).

### 4.7 When something fails (D17, D23, D29)

| Kind | What counts | The login | The Action's log |
|---|---|---|---|
| **Auth0 busy or failing** | 429 after the one retry; Auth0's 5xx errors; a network failure; a cached Management API token refused (401), which is dropped so the next login gets a new one | Goes through: the first login finishes as it is (D17), the second as the original (D23) | `lookup failed …` or `link failed …` |
| **Our setup is wrong** | A secret missing; the token request refused (any 4xx but 429: wrong credentials, audience or domain); a token just issued refused (401); a missing permission (403); a domain that doesn't exist | **Stops**, on the page's `error=unavailable`, or, if `LINKING_PAGE_URL` itself is missing, Auth0's error with the same message (D29) | `SETUP ERROR, login of … stopped (D29): …` |

A silent login (`prompt=none`) is denied as `login_required` in either case where a page would be shown (§4.2).

## 5. The Marketplace linking page

### 5.1 Route and endpoints

- **Page:** `/account-linking`, public (no Marketplace login), not indexed, the token removed from the address bar once
  read. The site's `Referrer-Policy: origin` already keeps the token out of other sites' logs.
- **`POST /api/account-linking/session`**: verifies the token; returns what the page shows (email, methods, app name)
  or `expired`.
- **`POST /api/account-linking/continue`**: verifies it again; returns the login address of §5.3.
- **`POST /api/account-linking/cancel`**: verifies it, deletes the new account (§5.4); returns the logout address.

As built (2026-11-17, `server/api/account-linking.js`; the token check and addresses in
`server/api-util/accountLinking.js`):

| Endpoint | Sends | Answers |
|---|---|---|
| `session` | `{ token?, error? }`: what the page was opened with | `200` with `{ email, app, newMethod, methods: [{ connection, kind }] }` (`kind` is `password`, `google` or `other`, for §6's names; never the ids); with `error=wrong-account`, the same plus `error`; with `blocked`, `expired`, `unavailable` or a bad token, just `{ error }` (a bad token is `expired`) |
| `continue` | `{ token, connection }` | `200 { url }`; `400 unknownMethod` for a connection the original doesn't have (D2); `401 expired` |
| `cancel` | `{ token }` | `200 { logoutUrl }`; `409 notPending` when §5.4's checks refuse; `502 auth0Failed`; `401 expired` |

A missing `AUTH0_LINKING_TOKEN_SECRET` is a `500`, not an expired token: it's the server's setup.

Our code never logs the token (§5.6). Cloud Run's request log does keep the page's address, token included, for 30
days, readable by whoever can read the project's logs; so does Google Analytics, if it's on, which reads the address
as the page loads. The token expires after 15 minutes, and without the original's login the most it allows is
cancelling the pending new account (§5.4), so that's accepted.

The page as built (2026-11-17, `src/containers/AccountLinkingPage/`): its data is loaded in the browser only (the
server's render shows a spinner: it can't call the app's own API, the same as the login page's invitation brand). The
token is taken out of the address bar with the browser's own history, not the router's, which would load the page
again without it; a reload therefore shows `expired`. The robots meta says `noindex`, and `robots.txt`'s existing
`Disallow: /account` already covers `/account-linking`; the sitemap lists its pages by name, so it isn't there.

### 5.2 What it shows

The email, the original's methods as buttons, Cancel, and under a password button the "Forgot password" hint. Copy
in §6. One button per method if the original already has two. With `error=blocked` (D19): the message only, no
buttons. With `error=wrong-account`, the token comes back too (§4.3): the message, then the same buttons again. With
`error=unavailable` (D29): the message only, no buttons.

The cancelled state comes back from Auth0's logout without the token, so Cancel keeps the original's method names in
the tab (`sessionStorage`) for its message; opened anywhere else, it says "your other login method". A Continue or
Cancel the server answers `401` or `409` shows `expired`; any other failure shows "Something went wrong" under the
buttons, which work again (§6). If the server fails to answer the page's first call, the page shows `unavailable`.

The "Forgot password" link itself is on Auth0's password screen, and stays: it's how a person who forgot their
password gets through, and how the real owner of an email takes back an account a stranger made with it (§3.1). The
hint is there because the reset link opens in a new tab: logging in from that tab gets the person in without linking
(the page comes back at the next login), while coming back to the first tab finishes the link.

### 5.3 Continue

To Auth0's `/authorize`, on the address the login came in on (the token's `host`, §4.4), with **every** parameter of
the original request (client, return address, `scope`,
`response_type`, `response_mode`, state, nonce, PKCE, audience, `ext-mp-*`, and whatever else the app sent), except
five, which it sets: `connection` = the chosen method, `prompt=login`, `login_hint` = the email, `link_token` = the
token (D30: not an `ext-` parameter), and no `screen_hint` (D22). Auth0 still checks the return address against the app's list. Whether Universal
Login then hides the other methods is checked on QA (§11).

*Until 2026-11-13 this listed the parameters to keep; the list missed `scope`, `response_type` and `response_mode`,
and couldn't know Circle's (D22).*

### 5.4 Cancel

Before deleting, the server checks with the Management API, through the Marketplace's own client
(`server/api-util/auth0Helper.js`, with `delete:users` added; D18), that the new account exists, has one login method
(not linked), the token's email, and is newer than the original. Then it deletes it, and the browser goes through Auth0's
logout (`/v2/logout`) back to `/account-linking?state=cancelled`, which shows the error of §6. The Marketplace's
logout addresses in Auth0 get this page (§7.1).

As built: both accounts are read by id (two reads), so "newer than the original" doesn't depend on the case-sensitive
search by email. The logout goes to the token's `host` with the Marketplace's client id, whose allowed logout
addresses hold the page (§7.1 step 4). A refusal answers `409`, and the page shows the `expired` message ("Please
log in again"): what was pending has changed since the token was made. A new account that's already gone (cancelled
twice, or linked in another tab) is harmless and logged as a normal step, `cancel-gone`; any other refusal is logged
as an error (2026-11-17).

### 5.5 What stays

The Marketplace's "second login" error page (login spec BR22), as the safety net for a duplicate that gets through
(D17), with new copy (§6.1, D25).

### 5.6 What it logs (D15)

The server writes one line per step it handles. Cloud Run keeps what the Marketplace prints in Google Cloud for 30
days, so nothing else is needed to read them later (Logs Explorer, `jsonPayload.source="account-linking"`).

| Step | Line |
|---|---|
| The page opened with a valid token | `offered`, with the app's name and the original's methods |
| The page opened with `error=expired`, `wrong-account` or `blocked`, or a token that fails the check | That outcome. The page's first call to the server carries the `error` it was opened with |
| Continue | `continue`, with the chosen method |
| Cancel | `cancelled` once the account is deleted; `cancel-gone` when the new account is already gone (§5.4); any other refused or failed delete through `log.error`, which also reaches Sentry |
| The page opened with `error=unavailable` (D29) | `unavailable`, through `log.error`: every login is stopped until the Action's setup is fixed (§12) |

Each line carries the Auth0 ids it knows (the new account, the original), never the email or the token. A small
`info` next to `error` in `server/log.js` prints the lines as JSON with a `severity`, which Cloud Run reads as
structured entries.

Not here, because it never reaches the Marketplace: a successful link and a login the Action let through (D17, D23),
which the app sees as normal logins, and Auth0's own events (wrong passwords, its rate limit), which stay in Auth0's
logs for 5 days (§4.6).

## 6. Messages

| When | Text |
|---|---|
| Label, above every view's title (added 2026-11-17) | Login error |
| Page title | **You already have a Luupe account** |
| Page text | `{email}` already has an account that logs in with `{method}`. To use `{new method}` too, log in once with `{method}` and we'll connect them. After that, either works. |
| Buttons | **Log in with your password** / **Log in with Google** · **Cancel** |
| Under a password button | Forgot your password? You can reset it on the next screen, then come back to this tab to log in. |
| Cancelled (title) | **No new account was created** |
| Cancelled (text) | Each email can have only one Luupe account. Log in with `{method}` instead, or contact support if you can't get in. |
| `expired` | **This took too long** · Please log in again. |
| `wrong-account` | That wasn't the account that uses `{email}`. Log in with that account to connect them. |
| `blocked` (D19) | **We can't connect this login to your account** · Please write to us at hi@theluupe.com. |
| `unavailable` (D29) | **Logging in isn't working right now** · We're on it; write to us at hi@theluupe.com. |
| Continue or Cancel failed (added 2026-11-17) | Something went wrong. Please try again. |

Method names: password, Google; anything else, "your other login method" (D28). LinkedIn and Microsoft were deleted in
step 0. An original with two methods is "your password or Google". In `en.json` as `AccountLinkingPage.*`; Console's
hosted translations don't have these keys (checked on QA and PROD 2026-11-17), so `en.json`'s copy is the one shown.

Every view is laid out like the Marketplace's 404 page (Rafael, 2026-11-17): the label, the title (in bold above) and the
text, centered in a narrow column, then the buttons; no background box. `expired`, `blocked` and `unavailable` were one
sentence each until then and are now a title and a text, the same words split in two. The layout is the
`PageMessage` component, shared with the second-login page (§6.1).

### 6.1 The safety-net pages (D25)

Shown by each app when a duplicate gets past the Action (D17). Agreed with Rafael 2026-11-13.

| | Text |
|---|---|
| Label (Marketplace only, added 2026-11-17) | Login error |
| Title | **This email already has a Luupe account** |
| Text | That account uses a different login method: your password if you just used Google, or Google if you just used your password. Log out first, then choose one: log in with that other method to go straight to your account, or log in the same way again and we'll connect the two, so both methods work from then on. Still stuck? Write to us at hi@theluupe.com. |
| Button | **Log out** |

One paragraph on purpose: the webapp's page shows its text as one `<p>`, so a list would mean changing its component,
not just its strings, and the Marketplace's keeps the same paragraph to match (Rafael, 2026-11-17, after trying a
list). The Marketplace's page is laid out like its 404 page: the small blue label, the title and the text centered in a
narrow column, then **Log out**, without the sign-up's background box and banner (the `PageMessage` component, shared
with the linking page, §6, and the login page's other notices, [`login-and-registration.md`](./login-and-registration.md) §8.5). Both options start with Log out because the person is still logged in to Auth0 with the new
account. "Log in the same way again" works because of D20: no pair is exempt, so that login reaches the linking page.

| App | Where |
|---|---|
| Marketplace | `en.json`, `AuthenticationPage.existingAccount*`: `Label`, `Title`, `Text`, `Logout` (§10, 3.3). New keys: Console's hosted translations hold the old `secondLogin*` keys with the old copy, on QA and PROD (checked 2026-11-17), and a hosted text wins over `en.json`. The new copy so ships with the Marketplace's deploy, with no Console change |
| Webapp | `src/pages/error-account.tsx`, its title and content strings (§10, 1.5) |
| Studio | No page today for its API's 409 "Account linking error": a requirement in its [auth spec §5.3](../../../studio/spec/v1/auth0-authentication.md) |

## 7. Setup

### 7.0 Step 0: the Auth0 clean-up and setup (Rafael, in the dashboard: QA first, then PROD)

> Reviewed with Rafael on 2026-11-12 (D8, D9, D11–D13). No code depends on this step. Run it on QA and tell Claude,
> who confirms it (step 18); then PROD the same way. Have a test account for each kept app at hand for step 17.

**A. The Rule and the extension (D8)**

1. Auth Pipeline → Rules: switch off `auth0-account-link-extension`. On the same page, in the **Settings** section
   under the list of Rules, delete the Rule's one setting, `AUTH0_ACCOUNT_LINKING_EXTENSION_CUSTOM_DOMAIN` (its
   trash icon). Do it now: once the tenant has no Rule left, the dashboard stops showing this page. On QA the setting
   was left behind that way (2026-11-12); it's harmless (the custom domain's name, not a secret, read by nothing) and
   can only be removed through the Management API (`DELETE /api/v2/rules-configs/{key}`).
2. Extensions → Installed Extensions → **Account Link** → Uninstall. On QA this also deleted the Rule and both of the
   extension's apps, in the same second (Auth0's logs, 2026-11-12), so steps 3 and 4 may find nothing left to do.
3. Auth Pipeline → Rules: delete the Rule if it's still listed.
4. Applications → Applications: delete `Account Linking` and `auth0-account-link` (each app's Settings tab, at the
   bottom).

**B. The unused apps and APIs (D9)**

5. Applications → Applications: delete every app marked Delete in §1.4's table for this tenant.
6. Applications → APIs: delete every API marked Delete in §1.4's table for this tenant.

**C. The kept apps (D11)**

7. **Grant types.** On each kept login app (QA: `Sharetribe (QA)`, `Web App`, `Studio (QA)`; PROD: `Sharetribe`,
   `Web App`, `Circle`): Settings → Advanced Settings → Grant Types → leave only **Authorization Code**, **Refresh
   Token** and **Client Credentials** → Save. That unticks Implicit and Password (Password Realm and Circle's MFA types
   go with Password).
8. **Return addresses.** Settings → Application URIs → Allowed Callback URLs and Allowed Logout URLs → Save:

   | Tenant | App | Remove |
   |---|---|---|
   | QA | `Web App` | Every entry on `xyz.sa.ngrok.io`, `theluupe.marcusvinicius.info`, `theluupe.loca.lt`, `theluupe.reversetunnel.net` and `theluupe.betabuild.dev`, from both lists (10 entries); and the callback `https://landing.qa.theluupe.com/api/auth/callback` |
   | QA | `Sharetribe (QA)`, `Studio (QA)` | Nothing |
   | PROD | `Web App` | The callbacks `https://theluupe.com/api/auth/callback` and `https://studio.theluupe.com/api/auth/callback` |
   | PROD | `Sharetribe` | The callback `https://market.theluupe.com/api/auth/auth0/callback` and the logout URL `https://market.theluupe.com` |
   | PROD | `Circle` | Nothing |

   What stays: every `localhost` entry; `theluupe-dev.ngrok.io`, which is Rafael's (remove it if that ngrok domain is
   ever given up: anyone could then claim it); the live domains; and the logout URLs on our own domains, the landing's
   included.
9. PROD only: rename `Circle (Test Application)` to `Circle` (Settings → Name). Auth0 made this app as the old
   Circle API's test app, so its type is Machine to Machine, and the dashboard warns that such an app shouldn't have
   return addresses. Keep its one address, `https://community.theluupe.com/oauth2/callback`: it's where Circle's
   logins come back. Only the Management API can change the app's type (the dashboard can't), and all that would gain
   is losing the warning.

**D. The tenant (D11, D13)**

10. Settings → General: **Support Email** `hi@theluupe.com` (the only contact address in the apps' code) and
    **Support URL** `https://theluupe.com/p/faq`, on both tenants (agreed 2026-11-12).
11. Settings → Advanced → Login and Logout → **Tenant Login URI**: QA
    `https://market.qa.theluupe.com/api/auth/auth0/login`, PROD `https://theluupe.com/api/auth/auth0/login` (D13).
12. QA only: Authentication → Social → **LinkedIn** → delete; the same for **Microsoft** (under Social or Enterprise,
    wherever it's listed). Deleting a login method deletes its users: LinkedIn's 2 QA users go with it.
13. PROD only: Security → Attack Protection → Brute-force Protection → Allowlist → remove `168.149.245.28` → Save.

**E. Studio on PROD (D12; PROD only, QA has it already)**

14. Applications → Applications → Create Application → `Studio`, Regular Web Applications. Then:
    - Settings → Application URIs. Allowed Callback URLs: `https://app.theluupe.com/auth/callback`, and
      `http://localhost:3000/auth/callback`, `:3001`, `:3500`, `:3501` (the same paths, as on QA). Allowed Logout URLs:
      `https://app.theluupe.com`, `http://localhost:3000`, `:3001`, `:3500`, `:3501`. Studio takes over the webapp's
      domain on PROD (`studio/.env.prod`); its library's callback is `/auth/callback`, so nothing clashes with the
      webapp's `/api/auth/callback` meanwhile.
    - Settings → Advanced Settings → Grant Types: Authorization Code, Refresh Token, Client Credentials only.
    - Connections: only `Username-Password-Authentication` and `google-oauth2` (a new app gets every method switched
      on).
    - APIs: Auth0 Management API → authorise → `read:users` and `update:users`, which Studio's API asks for
      (`studio/api/src/lib/auth0.ts`).
    - Its client id and secret stay in Auth0 until Studio's PROD launch puts them in Studio's secrets (Studio's
      [webapp deprecation spec](../../../studio/spec/v3/webapp-deprecation.md)).
15. Actions → Library → Create Action → Build from scratch: name `STUDIO | Add metadata to auth token` (as on QA),
    trigger Login / Post Login, runtime Node 22. Code: `studio/etc/auth0/actions/Add-studio-metadata-to-auth-token.js`,
    exactly. Secret `NAMESPACE` = `https://api.theluupe.com`: Studio reads its roles from the claim
    `https://api.theluupe.com/roles` (`AUTH0_ROLES_NAMESPACE`, `studio/.env.prod`). Deploy.
16. Actions → Triggers → post-login. The box labelled `STUDIO` runs `WEBAPP | Add metadata to auth token`; a box keeps
    the name it had when it was added. Remove it, drag `WEBAPP | Add metadata to auth token` back into the same place,
    drag the new `STUDIO | Add metadata to auth token` after it, then **Apply** once. Nothing changes for logins until
    Apply, so none runs without the webapp's roles. From then on every PROD token also carries Studio's roles claim,
    which the Marketplace and the webapp ignore.

**F. Check**

17. Log in to each kept app with a test account and log out again: QA the Marketplace, the webapp and Studio; PROD the
    Marketplace, the webapp and Circle. Then, in a private window, open `https://auth.qa.theluupe.com/u/login` (PROD
    `https://auth.theluupe.com/u/login`): it should land on Auth0's login page, from the Marketplace's login route, not
    on `/error-auth`. If an app's login fails after step 6, recreate the API it asked for, with the same address
    (Applications → APIs → Create API), and tell Claude.
18. Claude confirms the tenant with the read-only app: the Rule, its setting and the deleted apps, APIs and login
    methods gone; the grant types and return addresses as above; the tenant settings; on PROD the `Studio` app and both
    roles Actions in the flow.

    **QA, confirmed 2026-11-12.** Every item as above, with one known leftover: the Rules setting
    `AUTH0_ACCOUNT_LINKING_EXTENSION_CUSTOM_DOMAIN` (step 1), left in place as harmless. `/u/login` with no login under
    way now goes to the Marketplace's login route, which starts a normal login. Auth0 accepts the Marketplace's,
    Studio's and the webapp's login requests (their callback addresses, and the GraphQL API they ask for), and the
    webapp's test login went through.

    **PROD, confirmed 2026-11-13.** Every item as above: the Rule's setting deleted first, so nothing is left over.
    The test logins to the Marketplace, the webapp and Circle went through after the new login flow was applied. `/u/login`
    goes to the Marketplace's login. Auth0 accepts a login request for the new `Studio` app. Its settings match
    `Studio (QA)`'s, and the deployed `STUDIO` Action's code is the repo file's. Two items were fixed the same day,
    after a first check:
    - The `Studio` app now has the Management API permissions `read:users` and `update:users` (step 14).
    - The login flow reads `Metadata standardization`, `MARKET`, `WEBAPP`, `STUDIO`, each box running the Action it
      names (step 16).

    The Action's `NAMESPACE` value can't be read back from Auth0. Studio's PROD launch shows whether it's right: its
    admins get their roles.

### 7.1 Auth0 for the Action (Rafael, in the dashboard: QA first, then PROD)

1. A new machine-to-machine app, **Account linking (Action)**, authorised for the Management API with `read:users`
   and `update:users` only (D18). Not the extension's app (D8).
2. The Marketplace's own app (QA `Sharetribe (QA)`, PROD `Sharetribe`): Management API → add `delete:users` to its
   `read:users` and `update:users` (D18).
3. The Action (§4) with its secrets (§4.5), deployed, added **first** to the Login flow. No npm packages (D24).
4. The Marketplace app's allowed logout URLs get `<Marketplace>/account-linking?state=cancelled`; on QA during the
   local run (D16), `http://localhost:3000/account-linking?state=cancelled`.

The Rule is already gone (§7.0), so two linkers never run at once.

### 7.2 Marketplace (Cloud Run variables and `.env`)

`AUTH0_LINKING_TOKEN_SECRET` only, the Action's signing secret (D18), one per environment. On QA and PROD it goes in
the Marketplace's Google Secret Manager secret (the one `CONFIG_MARKET_SECRET_NAME` names), next to its other Auth0
settings, which the server loads at start (`server/env/secretManager.js`); locally in `.env`, whose values win over
the secret's (`server/env/index.js`). *Found 2026-11-17: the Marketplace's Auth0 settings aren't Cloud Run variables.*
Cancel uses the
Marketplace's existing Management API client (`server/api-util/auth0Helper.js`, the `AUTH0_MARKETPLACE_CLIENT_*`
credentials). What that client may do is set by the app's grant in Auth0 (§7.1 step 2), not by the code: node-auth0
v4 (the Marketplace has 4.37) ignores the client's `scope` option and asks Auth0 for the audience only, so the token
carries every scope the app is granted. `delete:users` is therefore live for the Marketplace's credentials (Cloud Run
and the local `.env`) from the moment step 2 is saved, although nothing calls it until phase 2. The
`scope: 'read:users update:users'` line in `auth0Helper.js` does nothing and is removed in phase 2.2, so nobody reads
it as a limit. *Until 2026-11-16 this said to add `delete:users` to that line.*

### 7.3 When this work ends (after §8)

Delete the `Claude read-only` apps on both tenants and the local file holding their credentials. The Rule, the
extension and its apps went in step 0 (§7.0), which retired the hard-coded secret (login spec S9); the Rule's repo
copies went with the Action (§4.1).

## 8. The old pairs: merged before go-live (D4, D20, D26)

The 213 pairs PROD had at the review (§1.3), plus those made since step 0 (about 2 a month, D6); QA has 10. With no
exemption (D20), the Action treats every pair the same from go-live, so each pair is sorted first. Only PROD's pairs
are sorted (Rafael, 2026-11-19): 216 at the 2026-11-19 inventory (§10, phase 6.2).

**Rafael's rule:** this is delicate. Nothing is linked or deleted until he has reviewed a summary of everything, and he
makes every change.

### 8.1 Inventory (Claude, read-only)

For each email held by two or more Auth0 users:

- **Auth0:** each account's id, methods, creation date, last login and number of logins, and whether it's blocked.
- **Webapp:** the `User` whose `providerId` is one of the pair's Auth0 ids (`providerId` and `email` are both unique,
  `webapp/prisma/schema.prisma`). That account holds the creator's or brand's data. Creators' `providerId` can point
  at the **newer** account: the community approval overwrites it (login spec K4).
- **Marketplace:** which Auth0 id the Sharetribe user's login is tied to, and any duplicate Sharetribe user for the
  same person, for Rafael to pick which to keep. Sharetribe emails are unique, so a duplicate would carry a different
  email.

Each source is read only after Rafael's go, saying which credential and which environment first: Auth0 with the
read-only app; PROD's webapp database read-only; the Marketplace's Integration API with reads only.

### 8.2 The summary (for Rafael, before any change)

The pairs in four groups, each with its data per app:

| Group | What happens |
|---|---|
| The newer account holds no app data | **Left to the Action**: at the person's next login with it they get the page, prove they own the original, and the two are linked. Nothing to do by hand |
| The newer account holds the data | **Merged by hand**, keeping the account that holds the data as the surviving one (its id doesn't change, so the webapp, the Marketplace and Circle keep finding it) |
| Both hold data | Rafael decides per app: which account survives, and what moves |
| An app is tied to the account that won't survive | Listed, with what has to be repointed |

No blind linking (D26): joining an account into another without its owner logging in to it would let anyone who
signed up with someone's email take over their account, since email verification is off.

### 8.3 The merges (Rafael)

Linking by hand is a Management API call (`POST /api/v2/users/{surviving id}/identities`); Claude writes the exact
calls for each merge, and Rafael runs them. Afterwards each app is checked with one login of a merged pair.

### 8.4 Circle (D22)

Circle keeps an "SSO user id" on each member (Circle's API docs), most likely the Auth0 id of their first Circle
login; how it matches a later login isn't documented. After a merge, Auth0 sends Circle the surviving id. Most
people reach Circle through the webapp, so Circle most likely holds the same account as the webapp's `providerId`,
which survives. Before PROD's real merges, one test with Rafael's test emails:

1. Two accounts with the same email (a password one, then Google).
2. Log in to Circle with the newer one.
3. Merge it into the older one.
4. Log in to Circle again: is it the same Circle member?

If Circle can't follow the change, the summary lists the pairs whose surviving account isn't the one Circle holds,
and Rafael decides. Circle's own duplicates and email drift are out of this work: Studio's
[user-sync spec §9.5](../../../studio/spec/v2/user-sync-and-brand-onboarding.md).

### 8.5 Order (D27)

PROD's pairs only (Rafael, 2026-11-19; QA's rehearsal dropped): the inventory, the summary, Rafael's decisions, the
Circle test, then the merges and a login per app. On go-live day, a **final sweep** for pairs made since the inventory comes right before the
Action is attached, and a second one right after, for the minutes in between (§10, phase 7). A pair missed in that
window loses no data, but its app data is reached through the wrong id until it's repointed by hand.

*Until 2026-11-13 this section was a documented last step after go-live, and it linked by hand any pair where one
account had no app data. D20 moved it before go-live; D26 dropped the blind linking.*

## 9. What each system holds afterwards

| System | After a link |
|---|---|
| Auth0 | One user, the original's id, with both methods; the new user is gone |
| Marketplace (Sharetribe) | Unchanged: its account is tied to the original's Auth0 id. For old pairs, §8 checks which id it's tied to before merging |
| Webapp, Studio | Unchanged: they key people by the original's Auth0 id |
| Circle | Unchanged: the person comes back to Circle as the original (D22). Checked in PROD's smoke test (§10, 7.4); for merged old pairs, by §8.4's test |

## 10. Build plan

**Who does what.** Claude writes the code and the tests, and checks Auth0 with the read-only app. Rafael makes every
change in Auth0, every deploy and every commit. Each phase ends at a gate, and the next starts on Rafael's go.

**Phase 0: Auth0 clean-up and prep**

- 0.1 (Rafael, QA then PROD): step 0 (§7.0).
- 0.2 (Claude): confirm it on both tenants with the read-only app.
- 0.3 (Rafael, QA): §7.1 steps 1–2 (`Account linking (Action)`, and `delete:users` on `Sharetribe (QA)`), and a token
  secret (`openssl rand -base64 32`), which goes into the Marketplace's local `.env`. Claude writes the exact steps.
  ✅ Done 2026-11-16 and confirmed with the read-only app: the new app is machine to machine, client credentials only,
  with `read:users` and `update:users`; `Sharetribe (QA)` has `delete:users` added and nothing else; the flow is
  unchanged; the secret is in `.env`.
- 0.4 (Claude, when phase 1 starts): a branch in each repo (Marketplace, webapp, Studio). Uncommitted work already in
  them is Rafael's and stays untouched.
- **Gate:** step 0 confirmed on both tenants.

**Alongside phases 1–5: one side track, with its own spec, branch and Rafael's go**

- A. The webapp's rate-limit fix (D14, [webapp `spec/role-lookup-rate-limit.md`](../../../webapp/spec/role-lookup-rate-limit.md)):
  a failing test first, then the fix; Rafael deploys QA, then PROD. It doesn't depend on phases 1–5, and is on PROD
  before phase 7 (its gate). Built 2026-11-16 on the webapp's `dev`, uncommitted; next, Rafael's commit and deploys.
  Merged into the webapp's `dev` 2026-11-17 (#1278); the Action's copy and the `/error-account` copy followed on
  2026-11-18 (#1279). The webapp reaches PROD only through a version tag, and the last one (v10.5.2, 2026-11-09) came
  before both, so the next tag carries the fix and the new copy together. It is cut in phase 7.1, not earlier: the copy
  promises a link that only the Action makes.

*Until 2026-11-16 a side track B copied Auth0's logs into Google Cloud; D15 dropped it.*

**Phase 1: the Action (code only, no Auth0 change)**

- 1.1: `studio/etc/auth0/actions/account-linking.js`: the first login (§4.2), the second login (§4.3), the Management
  API token cached between logins, the single retry on 429 (D17, D23), no npm packages (§4.6). The identical copy in
  the webapp (§4.1).
- 1.2: the tests (§4.1, §4.6), with Auth0 faked: no email, no older account, redirect, silent login, blocked original,
  link, wrong account, expired, already linked; a failing lookup and a failing link, with and without a 429 (one
  retry, then through); the exact requests sent to Auth0. A token fixture for 2.4.
- 1.3: Studio's `test:scripts` widened to take `etc/auth0/actions/` (§4.1).
- 1.4: the Rule's copies deleted from both repos (§4.1).
- 1.5: the webapp's `/error-account` copy (§6.1, D25), `src/pages/error-account.tsx`, on the same webapp branch.
- 1.6: from Auth0's current docs, where an Action's log lines can be read after the login, and for how long (§4.6).
- **Gate:** Studio's `test:scripts` green, the webapp's tests and formatting clean, the two copies identical.
- ✅ **Done 2026-11-16**, uncommitted (Rafael commits): the Action and its tests (37 since D29 was added on
  2026-11-17); each of 22 deliberate breaks of the Action (the token checks, the retry, the oldest, the silent login,
  the refresh skip, the wrong account, the cache, a non-lone account, a blocked original, and the eleven ways of
  mixing up a broken setup with Auth0 being busy) turns its own test red. A token made by the Marketplace's `jose`
  5.9.6 passes the Action's check, and the Action's token passes `jose`'s; that token is the fixture in
  `account-linking.test.mjs` (secret `test-linking-secret`, clock 2026-11-20T10:00:00Z) that 2.4 copies. Studio's
  `test:scripts` 40 of 40; webapp Jest 196 of 196, Prettier clean, no type errors in the page; copies identical.
  Studio's `lint` doesn't cover `etc/` (nor `scripts/`), so no linter runs on the Action.

**Phase 2: the Marketplace server**

- 2.1: `server/api-util/accountLinking.js`: checks the token; builds the "log in again" address (§5.3: every
  parameter of the original request, with the five it sets); the method names (§6).
- 2.2: the ignored `scope` option removed from `server/api-util/auth0Helper.js` (§7.2: the app's grant in Auth0 is
  what counts), and the delete with §5.4's checks (D18).
- 2.3: the three endpoints (§5.1) in `server/api/`, registered in `apiRouter.js`, each logging its outcome (§5.6),
  and the `info` line in `server/log.js`.
- 2.4: server tests: a tampered or expired token is refused; the Action's token fixture (1.2) is accepted, and a
  token made by `jose` passes the Action's check; the address keeps every parameter it isn't meant to set, Circle's
  shape included; Cancel refuses to delete a linked, older or different-email account; each endpoint logs its
  outcome with the Auth0 ids, never the email or the token (§5.6).
- 2.5: the one variable (§7.2) in `config-check` and in TL_README's Auth0 section.
- **Gate:** server tests and formatting.
- ✅ **Done 2026-11-17**, uncommitted: `server/api-util/accountLinking.js` (the token check with `jose`, the
  Continue and logout addresses, the method names), `server/api/account-linking.js` (the three endpoints and their
  log lines), registered in `apiRouter.js`; `auth0Helper.js` without its ignored `scope` and with `getAuth0User` /
  `deleteAuth0User`; `log.info` in `server/log.js`. 37 tests in two suites, which accept the Action's own token (the
  fixture from 1.2); each of 11 deliberate breaks (the algorithm, the host check, the five overrides, `prompt=login`,
  the method check, Cancel's four checks, an email in a log line, the `unavailable` error) turns its own test red.
  The server suite: 277 of 277 (the lineItem suites excluded, red on `dev` before this work). 2.5: `config-check`
  only checks that `.env` exists, and `.env-template` lists no Auth0 variable, so the variable is in TL_README's Auth0
  section only, with a short "Account linking" note.

**Phase 3: the linking page**

- 3.1: `AccountLinkingPage`, its data loaded before it renders (the `loadData` pattern); the route `/account-linking`,
  public and not indexed; the token removed from the address bar once read.
- 3.2: its states: the offer (one button per method, Cancel, the "Forgot password" hint), cancelled, expired, wrong
  account (with the buttons again), blocked and unavailable (no buttons).
- 3.3: the copy of §6 in `en.json`, and the second-login page's new copy (§6.1); a check that Console's hosted
  translations don't override those keys.
- 3.4: client tests for each state.
- **Gate:** client tests, formatting and `yarn build`.
- ✅ **Done 2026-11-17**, uncommitted: `src/containers/AccountLinkingPage/` (the page, its duck and styles), the
  route, the three calls in `src/util/api.js`, and `src/util/browserNavigation.js` (leaving for Auth0, in one place
  tests can replace: jsdom won't let a test touch `window.location`). As built in §5.1–§5.2; one new message, for a
  failed Continue or Cancel (§6). 3.3: Console's hosted translations override the second-login keys on QA and PROD,
  so §6.1's copy went in under new keys (§6.1); the page's own keys aren't hosted. 14 page tests, with the real
  `en.json` copy; the second-login page's 20 tests pass under the new keys. Formatting clean; `yarn build` passes, its
  only warning the CSS-order one that was there before.

**Phase 4: first real run, a local Marketplace against QA's Auth0 (D16)**

- 4.1 (Rafael, QA dashboard): before the Action is attached, §11 row 13's first half (a pair made the old way). Then
  §7.1 steps 3–4, with `LINKING_PAGE_URL` = `http://localhost:3000/account-linking` and the localhost logout URL.
  Claude confirms with the read-only app that the Action is first.
  ✅ Done 2026-11-17 (Rafael), confirmed by Claude the same day with the read-only app (QA): `Account linking` first in
  the Login flow, node22, deployed (version 1, no undeployed changes), no npm dependencies, its five secrets present
  (names only: the API never returns values), its deployed code identical to the repo's; `Sharetribe (QA)` allows the
  localhost logout URL and callback and has `delete:users`; `Account linking (Action)` has `read:users` and
  `update:users` only. The secrets' values (the page's address, the shared secret, the app's credentials) are proven by
  4.2's first row: a wrong one shows as `expired` (secret) or `unavailable` (credentials, D29).
- 4.2 (Rafael, with Claude): §11 rows 1–18 on the local Marketplace (`yarn dev`), row 5 included: QA's deployed webapp
  and Studio send the browser to the local page too. Claude fixes what breaks; a change to the Action itself means
  Rafael pastes and deploys it again.
- 2026-11-18, first run: the local Marketplace was first found on PROD's Auth0 (its local-dev config secret; Rafael
  fixed it, and deleted the two test accounts it had made on PROD). Then rows 1–2 passed (the Action sent the Google
  login to the page), and Continue failed on Auth0's `ext-` limits: fixed by D30 (the Action then pasted and deployed again on QA by Rafael).
  With D30 deployed (Action version 2), passed on 2026-11-18 (Rafael's runs, each checked in QA's Auth0 logs by
  Claude): rows 1–4, 6, 7 (Cancel deleted the waiting account and logged out), 8–10, 14 and 15. Row 8's outcome (D21):
  Auth0 kept the new account's session, so "Log in" after closing the tab went straight back to the linking page. Rows 11, 12, 13 and
  16–18 not run, by Rafael's call ("those were the main ones"); row 5 (the webapp and Studio) moves to phase 5, once the
  page is on QA. Testing with one Gmail means deleting the account in Auth0 and the Marketplace between rows.
- **Gate:** every row passes; row 8 records which outcome Auth0 gives (D21).

**Phase 5: QA deploy**

- 5.1 (Rafael): the commit, on his ask; the deploy to QA with the variable; then the Action's `LINKING_PAGE_URL`
  switched to `https://market.qa.theluupe.com/account-linking` and redeployed, and the localhost logout URL replaced
  by QA's.
  ✅ Done 2026-11-18 (Rafael): merged into `dev` (PR #158) and deployed to QA, `AUTH0_LINKING_TOKEN_SECRET` added to
  QA's MARKET secret; the Action redeployed at 19:17 UTC (version 3) with the QA page's address. The localhost logout
  URL stays next to QA's until phase 8. Confirmed by Claude the same day: in QA's Auth0 with the read-only app (the
  Action first in the flow, its code identical to the repo's, `LINKING_PAGE_URL` changed at 19:16, QA's logout URL
  allowed, no Rules left); on the QA site with anonymous calls (`robots.txt` disallows all, the page answers with
  noindex, the bundle carries the new copy, the three endpoints answer a bad token with `expired`); and with one
  Continue call carrying a token signed with the local secret and made-up account ids, which QA accepted and answered
  with the token in `link_token` (QA's secret is the Action's, and D30 is live).
- 5.2: §11 row 5 (webapp, Studio QA), and rows 1–4 again.
  2026-11-19, Rafael: "it all worked perfectly". QA's Auth0 logs (read by Claude at 15:46 UTC) show one full run:
  a password sign-up on the Marketplace, then Google from the webapp, linked by the Action into the password account
  (`Link a User Account` by `Account linking (Action)`), and the login finishing in the webapp as the original:
  rows 1–3 and row 5 for the webapp. Not in the logs since the switch: a Studio (QA) login, a run started from the
  Marketplace site, and row 4's Google login after the link. Waived (Rafael, 2026-11-19).
- 5.3 (Claude): the results written into this spec.
- **Gate:** QA passes.

**Phase 6: the old pairs (§8), on PROD only**

- 6.1: dropped (Rafael, 2026-11-19: "QA is just for testing"; the old pairs are reviewed on PROD only). The Circle
  test (6.3) makes the first real merge call, with Rafael's test emails, so it is the rehearsal.
- 6.2: PROD's pairs: the inventory and the summary, each read on Rafael's go (§8.1).
  ✅ Read on 2026-11-19, 17:07 to 17:10 UTC, on Rafael's go: Auth0 with the read-only app, the webapp's database
  with a read-only role (`claude_readonly`, Rafael's), Sharetribe's Integration API with read calls only. The
  summary is a Google Sheet in Rafael's Drive (`Auth0-LinkingAccounts` folder): one row per email, his decision per
  row. 6,112 Auth0 users; 216 emails with two accounts each, none with more. 201 pairs where the newer account holds
  no app data (left to the Action), 10 where only the newer does (merged by hand, keeping it), 5 where both do (his
  call: the webapp on the older account, the Marketplace on the newer). §8.2's fourth group became a column (the apps
  tied to the account that goes: 7 pairs). Found on the way: 11 Sharetribe users are linked to both Auth0 logins of
  their pair, so the Marketplace keeps working whichever survives; 74 have no Auth0 login linked at all.
  Then, at Rafael's ask, the sheet was split into two lists after a review of the 201: **Needs you** (17: 5 his call,
  12 merged by hand) and **Left to the Action** (199, nothing to do). The review moved 2 pairs to Needs you: only their
  newer account carries a Circle id in Auth0, and the webapp user it pointed to no longer exists. It also confirmed:
  the Action doesn't carry the newer account's Auth0 metadata over (the link drops it; 3 of the 199 lose only
  Marketplace details the Marketplace keeps itself); Sharetribe links a login with a verified email to the existing
  Marketplace user by itself (all 11 double links came that way), and none of the 199 has an unverified older email
  next to a Marketplace user that isn't linked to it, so none loses the Marketplace. 31 of the 199 have an unverified
  older email: those people will likely use Forgot password on the linking page.
- 6.4, as done (Rafael, 2026-11-19, before the Circle test): the 5 "his call" pairs were not linked. He kept the newer
  account, moved the webapp user to it (`providerId`), and deleted the older account in Auth0. Claude's check: one
  webapp user each, now on the newer account, its `marketId` the Sharetribe user's, which is linked to the newer login;
  nothing points at the deleted accounts. **Roles don't move with an account**: the webapp's memberships are Auth0
  roles, given by Circle's paywall webhook to the account the webapp user pointed to then (`manageMembership`,
  `webapp/server/lib/circle.ts`). One of the 5 is Pro in Sharetribe and its kept account had no `role-pro`; Founding
  Member can't be told for a deleted account. Deleting rather than linking also leaves one login method; a later login
  with the other creates a new account, which the Action links once it's live. `role-pro` was then given back to the
  Pro one (seen on its account the same evening).
  The other 12, the same evening: one (a past member, "not part of the platform anymore") had both accounts deleted;
  it held nothing in the webapp or the Marketplace. The 11 others were **linked**, the newer account kept as the
  primary (its id unchanged, so the webapp, the Marketplace and Circle see no change). Six of them had an older
  password account whose email was never verified, so to keep D26 Rafael first set a random password on each (18:37
  to 18:41 UTC): the login survives but only Forgot password, which proves the email, opens it. Claude then made the
  11 calls (`POST /api/v2/users/{newer}/identities`) with `update:users` lent to its PROD app for this alone, after a
  pre-check of each pair, the first pair alone; then checked: each email has one Auth0 user with two logins, the
  roles unchanged (no older account held any), the older ids gone as users of their own. Needs you is empty.
- 6.3: dropped (Rafael, 2026-11-19). The hand merges didn't need it: all 16 kept the account the webapp points to.
  What Circle does when the Action links (the original survives, the newer id goes) shows in production instead.
  Founding Member for the 5 deleted accounts isn't looked into either (Rafael).
- 6.4 (Rafael): PROD's merges, from his decisions; a login per app on a merged pair. ✅ Done 2026-11-19 (above).
- **Gate:** Rafael has reviewed every pair's outcome.

**Phase 7: PROD go-live, in one sitting** (starts once phase 6 is done; side track A reaches PROD in 7.1, with the
webapp's release)

- 7.1 (Rafael): PROD's §7.1 steps 1–2, the Marketplace's PROD variable and its deploy. The page sits unused until the
  Action is attached. Also the webapp's deploy carrying the new `/error-account` copy (1.5): it promises that logging
  in the same way again connects the accounts, true only once the Action is live, so it reaches PROD here, not with an
  earlier webapp release. That release (the next version tag) also carries side track A (#1278), ahead of the Action.
- 7.2 (Claude): the final sweep: pairs made since 6.2's inventory. Rafael decides on any whose newer account holds
  data, before 7.3.
- 7.3 (Rafael): PROD's Action, first in the flow; the logout URL (§7.1, steps 3–4).
- 7.4: a smoke test with Rafael's test emails: §11 rows 1–4 and 7, and row 5 from Circle (D22). Claude confirms the
  setup and reads PROD's Auth0 logs with the read-only app that day and again a few days later, inside Auth0's 5
  days, next to the Marketplace's own linking lines in Google Cloud (D15, §5.6).
- 7.5 (Claude): the second sweep, for the minutes between 7.2 and 7.3.
- **Gate:** clean logs.

**Phase 8: close**

- 8.1 (Claude): this spec to ✅ Implemented, its rows in TL_README and `spec/v0/README.md`, the login spec's amendment
  notes; the pending accounts counted once, for Rafael (D28); §7.3.

*Until 2026-11-13 the PROD go-live was phase 6 and the old pairs a later phase 8, with a go-live date exempting them
(D20).*

## 11. QA test plan

**Prereqs:** §7 done on QA; the Marketplace with this change on QA; two test emails (Gmail addresses, for Google).

| # | Action | Expected |
|---|---|---|
| 1 | With a password account (made before the test), choose "Continue with Google" on the Marketplace | The linking page: the email, "password", one password button, the "Forgot password" hint |
| 2 | Click it | Auth0's password screen only, email filled in, "Forgot password" shown |
| 3 | Log in | Back in the Marketplace, as the original account. In Auth0: one user with two methods |
| 4 | Log out; log in with Google | Straight in, same account |
| 5 | Repeat 1–3 from the webapp and Studio (QA); on PROD, from Circle (phase 7.4, D22) | Each lands back in its own app, as the original |
| 6 | Google account first, then sign up with a password and the same email | The page offers Google only; linking works |
| 7 | At step 2 click **Cancel** | "No new account was created"; the new user is gone from Auth0; the next "Log in" shows the login screen |
| 8 | At step 2 close the tab; log in with the original | Either the normal login screen, and in with no page; or, if Auth0 kept the new account's session, the linking page again, and Continue from there links them (D21). Record which |
| 9 | Then log in with Google again | The linking page again |
| 10 | At the password screen log in as a different account | "That wasn't the account…"; still pending |
| 11 | Wait 16 minutes on the page, then continue | "This took too long…" |
| 12 | Use "Forgot password" from the linking flow; set the new password in the email's tab, then go back to the first tab and log in | Linked. (Logging in from the email's tab instead: in, not linked, and the page again next time) |
| 13 | Before the Action is attached (phase 4.1): a password account, then "Continue with Google" with the same email. Log out. After it's attached: "Continue with Google" again | Before: the Marketplace's second-login page with §6.1's copy and **Log out**. After: the linking page; linking works (an old pair left to the Action, §8.2) |
| 14 | Ordinary password and Google logins, no duplicate | Unchanged |
| 15 | An already-linked user, both methods | Unchanged |
| 16 | A pending account with an app's silent login | Logged out quietly; no page, no error screen |
| 17 | Block the original in Auth0 (dashboard), then "Continue with Google" with its email; unblock it afterwards | "We can't connect this login…", no buttons; nothing linked (D19) |
| 18 | In the Action's secrets, change one character of `CLIENT_SECRET` and deploy; log in with any account. Then restore it, deploy, log in again | First: "Logging in isn't working right now…", no buttons; the login's Action Details say `SETUP ERROR`; an error line in the Marketplace's log. Then: a normal login (D29) |

**Not changed (spot-check):** sign-up and `/confirm`, the brand join. The webapp's `/error-account` shows §6.1's copy
(phase 1.5). A failing lookup or link (D17, D23) can't be caused by hand; the tests cover them (phase 1.2).

## 12. Support runbook (D28)

For the cases that end with "write to us". Start the same way each time: Auth0 → User Management → Users, search the
email, and note each user's id, login method, creation date and whether it's blocked. Linking and unlinking are
Management API calls (`POST` and `DELETE /api/v2/users/{id}/identities`); Rafael runs them, and Claude writes the
exact call on request.

| Case | What to do |
|---|---|
| **Lost access to the original's Google account** (or to its email inbox) | Confirm the person controls the email, by a reply to a message sent to it. Then link the new account into the original (the original survives, D7). If they've lost the inbox too, Rafael decides from the account's history |
| **A blocked original** (D19) | Find out why it was blocked. If it shouldn't be: unblock it (the user's page), and the person logs in again with the new method, which offers the page. If it stays blocked: delete the pending new account, or leave it; it can't get in |
| **A failed link** (D23) | Nothing to do: the new account's next login offers the page again. If it keeps failing, look for `api_limit` in Auth0's logs (5 days) |
| **Nobody can log in: "Logging in isn't working right now…"** (D29) | The Action's setup is broken. Open a failed login's Action Details (Monitoring → Logs): the `SETUP ERROR` line names the cause. Fix the Action's secrets (§4.5) or the `Account linking (Action)` app's permissions (§7.1), and deploy. To let people in at once while you look, drag the Action out of the Login flow and apply; linking is off until it's back |
| **A wrong link** | Unlink the identity from the surviving user; it becomes its own user again, so it would get the page at its next login. Delete it if it shouldn't exist |
| **"I used Google and got 'This email already has a Luupe account'"** (a safety-net page, D25) | The Action let a duplicate through (D17). Logging in the same way again offers the page; if it doesn't, check Auth0's logs for that login (5 days) and the Marketplace's linking lines (§5.6) |

