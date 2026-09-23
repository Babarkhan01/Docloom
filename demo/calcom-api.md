# calcom/cal.com — API Reference

Structural facts below were extracted from the source at branch `main` with a TypeScript AST parser; descriptions are AI-written from those facts only.

> **Not documented in source:** 2 handler exports were found but could not be resolved to a handler function in the same file, so they are not documented in source.

## Endpoints (42)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/forgot-password` |  |
| GET | `/api/auth/oauth/me` |  |
| POST | `/api/auth/oauth/me` |  |
| POST | `/api/auth/oauth/refreshToken` |  |
| POST | `/api/auth/oauth/token` |  |
| POST | `/api/auth/reset-password` |  |
| POST | `/api/auth/setup` |  |
| POST | `/api/auth/signup` |  |
| POST | `/api/auth/two-factor/totp/disable` |  |
| POST | `/api/auth/two-factor/totp/enable` |  |
| POST | `/api/auth/two-factor/totp/setup` |  |
| POST | `/api/availability/calendar` |  |
| DELETE | `/api/availability/calendar` |  |
| GET | `/api/availability/calendar` |  |
| GET | `/api/avatar/[uuid]` |  |
| DELETE | `/api/cancel` |  |
| POST | `/api/cancel` |  |
| POST | `/api/cron/bookingReminder` |  |
| GET | `/api/cron/calendar-subscriptions-cleanup` |  |
| GET | `/api/cron/calendar-subscriptions` |  |
| POST | `/api/cron/changeTimeZone` |  |
| GET | `/api/cron/selected-calendars` |  |
| POST | `/api/cron/syncAppMeta` |  |
| POST | `/api/cron/webhookTriggers` |  |
| GET | `/api/csrf` |  |
| GET | `/api/email` |  |
| GET | `/api/geolocation` |  |
| GET | `/api/ip` |  |
| GET | `/api/link` |  |
| GET | `/api/logo` |  |
| GET | `/api/me` |  |
| POST | `/api/recorded-daily-video` |  |
| POST | `/api/sync/helpscout` |  |
| GET | `/api/user/referrals-token` |  |
| POST | `/api/username` |  |
| GET | `/api/verify-booking-token` |  |
| POST | `/api/verify-booking-token` |  |
| GET | `/api/version` |  |
| POST | `/api/video/guest-session` |  |
| GET | `/api/video/recording` |  |
| POST | `/api/webhook/app-credential` |  |
| POST | `/api/webhooks/calendar-subscription/[provider]` |  |

## Reference

### /api/auth/forgot-password

#### POST /api/auth/forgot-password

_No description available._

**Details**

- Source: `apps/web/app/api/auth/forgot-password/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (3):
  - `400` (literal)
    - `message`: `string`
  - `201` (literal)
    - `message`: `string`
  - `500` (literal)
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/oauth/me

#### GET /api/auth/oauth/me

_No description available._

**Details**

- Source: `apps/web/app/api/auth/oauth/me/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (2):
  - `401` (literal)
    - `message`: `string`
  - `201` (literal)
    - `username`: not documented in source
- Headers:
  - `authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `POST`

#### POST /api/auth/oauth/me

_No description available._

**Details**

- Source: `apps/web/app/api/auth/oauth/me/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (2):
  - `401` (literal)
    - `message`: `string`
  - `201` (literal)
    - `username`: not documented in source
- Headers:
  - `authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `POST`

### /api/auth/oauth/refreshToken

#### POST /api/auth/oauth/refreshToken

_No description available._

**Details**

- Source: `apps/web/app/api/auth/oauth/refreshToken/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (5):
  - `500` (literal)
    - `message`: not documented in source
  - `400` (literal)
    - `error`: `string`
  - `200` (literal)
    - `access_token`: not documented in source
    - `token_type`: `string`
    - `refresh_token`: not documented in source
    - `expires_in`: not documented in source
  - status not written (literal)
    - `error`: not documented in source
  - `500` (literal)
    - `error`: `string`
- Headers:
  - `authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/oauth/token

#### POST /api/auth/oauth/token

_No description available._

**Details**

- Source: `apps/web/app/api/auth/oauth/token/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (5):
  - `500` (literal)
    - `message`: not documented in source
  - `400` (literal)
    - `error`: `string`
  - `200` (literal)
    - `access_token`: not documented in source
    - `token_type`: `string`
    - `refresh_token`: not documented in source
    - `expires_in`: not documented in source
  - status not written (literal)
    - `error`: not documented in source
  - `500` (literal)
    - `error`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/reset-password

#### POST /api/auth/reset-password

_No description available._

**Details**

- Source: `apps/web/app/api/auth/reset-password/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (3):
  - `403` (literal)
    - `error`: `string`
  - `404` (literal) — fields not documented in source
  - `201` (literal)
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/setup

#### POST /api/auth/setup

_No description available._

**Details**

- Source: `apps/web/app/api/auth/setup/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (1):
  - status not written (literal)
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/signup

#### POST /api/auth/signup

Im not sure its worth merging these two handlers. They are different enough to be separate.
Calcom handles things like creating a stripe customer - which we don't need to do for self hosted.
It also handles things like premium username.
TODO: (SEAN) - Extract a lot of the logic from calcomHandler into a separate file and import it into both handlers.
@zomars: We need to be able to test this with E2E. They way it's done RN it will never run on CI.

**Details**

- Source: `apps/web/app/api/auth/signup/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (2):
  - status not written (literal)
    - `message`: not documented in source
  - `500` (literal)
    - `message`: `string`
- Headers:
  - `cf-access-token`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/two-factor/totp/disable

#### POST /api/auth/two-factor/totp/disable

_No description available._

**Details**

- Source: `apps/web/app/api/auth/two-factor/totp/disable/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (4):
  - `401` (literal)
    - `message`: `string`
  - `500` (literal)
    - `error`: not documented in source
  - `400` (literal)
    - `error`: not documented in source
  - status not written (literal)
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/two-factor/totp/enable

#### POST /api/auth/two-factor/totp/enable

_No description available._

**Details**

- Source: `apps/web/app/api/auth/two-factor/totp/enable/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (4):
  - `401` (literal)
    - `message`: `string`
  - `500` (literal)
    - `error`: not documented in source
  - `400` (literal)
    - `error`: not documented in source
  - status not written (literal)
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/two-factor/totp/setup

#### POST /api/auth/two-factor/totp/setup

_No description available._

**Details**

- Source: `apps/web/app/api/auth/two-factor/totp/setup/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (4):
  - `401` (literal)
    - `message`: `string`
  - `500` (literal)
    - `error`: not documented in source
  - `400` (literal)
    - `error`: not documented in source
  - status not written (literal) — fields not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/availability/calendar

#### POST /api/availability/calendar

_No description available._

**Details**

- Source: `apps/web/app/api/availability/calendar/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Request body (zod: `selectedCalendarSelectSchema`)
  - `integration`: `string`
  - `externalId`: `string`
  - `credentialId`: `number`
  - `delegationCredentialId`: `string` — optional, default `null`, `nullable`
  - `eventTypeId`: `number` — optional, `nullable`
- Responses (1):
  - status not written (literal)
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`, `DELETE`, `GET`

#### DELETE /api/availability/calendar

_No description available._

**Details**

- Source: `apps/web/app/api/availability/calendar/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (1):
  - status not written (literal)
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`, `DELETE`, `GET`

#### GET /api/availability/calendar

_No description available._

**Details**

- Source: `apps/web/app/api/availability/calendar/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Reads the request: no
- Returns a Response: yes
- Exports: `POST`, `DELETE`, `GET`

### /api/avatar/[uuid]

#### GET /api/avatar/[uuid]

_No description available._

**Details**

- Source: `apps/web/app/api/avatar/[uuid]/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Dynamic segments: `[uuid]`
- Parameters:
  - `params` (url): `Promise<Params>`
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/cancel

#### DELETE /api/cancel

_No description available._

**Details**

- Source: `apps/web/app/api/cancel/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (1):
  - `400` (literal)
    - `success`: `boolean`
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `DELETE`, `POST`

#### POST /api/cancel

_No description available._

**Details**

- Source: `apps/web/app/api/cancel/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (1):
  - `400` (literal)
    - `success`: `boolean`
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `DELETE`, `POST`

### /api/cron/bookingReminder

#### POST /api/cron/bookingReminder

_No description available._

**Details**

- Source: `apps/web/app/api/cron/bookingReminder/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (2):
  - `401` (literal)
    - `message`: `string`
  - status not written (literal) — fields not documented in source
- Query parameters:
  - `apiKey`: type not documented in source
- Headers:
  - `authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/cron/calendar-subscriptions-cleanup

#### GET /api/cron/calendar-subscriptions-cleanup

Cron webhook
Cleanup stale calendar cache
@param request
@returns

**Details**

- Source: `apps/web/app/api/cron/calendar-subscriptions-cleanup/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (3):
  - `403` (literal)
    - `message`: `string`
  - status not written (literal)
    - `ok`: `boolean`
  - `500` (literal) — fields not documented in source
- Query parameters:
  - `apiKey`: type not documented in source
- Headers:
  - `authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`

### /api/cron/calendar-subscriptions

#### GET /api/cron/calendar-subscriptions

Cron webhook
Checks for new calendar subscriptions (rollouts)
@param request
@returns

**Details**

- Source: `apps/web/app/api/cron/calendar-subscriptions/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (3):
  - `403` (literal)
    - `message`: `string`
  - status not written (literal)
    - `ok`: `boolean`
  - `500` (literal) — fields not documented in source
- Query parameters:
  - `apiKey`: type not documented in source
- Headers:
  - `authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`

### /api/cron/changeTimeZone

#### POST /api/cron/changeTimeZone

_No description available._

**Details**

- Source: `apps/web/app/api/cron/changeTimeZone/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (2):
  - `401` (literal)
    - `message`: `string`
  - status not written (literal) — fields not documented in source
- Query parameters:
  - `apiKey`: type not documented in source
- Headers:
  - `authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/cron/selected-calendars

#### GET /api/cron/selected-calendars

_No description available._

**Details**

- Source: `apps/web/app/api/cron/selected-calendars/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `isSameEmail`, `handleCreateSelectedCalendars`, `GET`

### /api/cron/syncAppMeta

#### POST /api/cron/syncAppMeta

syncAppMeta makes sure any app metadata that has been replicated into the database
remains synchronized with any changes made to the app config files.

**Details**

- Source: `apps/web/app/api/cron/syncAppMeta/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (2):
  - `401` (literal)
    - `message`: `string`
  - status not written (literal)
    - `ok`: `boolean`
- Query parameters:
  - `apiKey`: type not documented in source
- Headers:
  - `authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/cron/webhookTriggers

#### POST /api/cron/webhookTriggers

_No description available._

**Details**

- Source: `apps/web/app/api/cron/webhookTriggers/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (2):
  - `401` (literal)
    - `message`: `string`
  - status not written (literal)
    - `ok`: `boolean`
- Query parameters:
  - `apiKey`: type not documented in source
- Headers:
  - `authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/csrf

#### GET /api/csrf

_No description available._

**Details**

- Source: `apps/web/app/api/csrf/route.ts`
- Route context: none
- Reads the request: yes
- Returns a Response: no
- Exports: `GET`

### /api/email

#### GET /api/email

This API endpoint is used for development purposes to preview email templates

**Details**

- Source: `apps/web/app/api/email/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/geolocation

#### GET /api/geolocation

_No description available._

**Details**

- Source: `apps/web/app/api/geolocation/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Reads the request: no
- Returns a Response: no
- Exports: `GET`

### /api/ip

#### GET /api/ip

_No description available._

**Details**

- Source: `apps/web/app/api/ip/route.ts`
- Route context: none
- Responses (1):
  - status not written (literal)
    - `ip`: not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`

### /api/link

#### GET /api/link

_No description available._

**Details**

- Source: `apps/web/app/api/link/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`

### /api/logo

#### GET /api/logo

This API endpoint is used to serve the logo associated with a team if no logo is found we serve our default logo

**Details**

- Source: `apps/web/app/api/logo/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (2):
  - `400` (literal)
    - `error`: `string`
  - `404` (literal)
    - `error`: `string`
- Headers:
  - `host`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`

### /api/me

#### GET /api/me

_No description available._

**Details**

- Source: `apps/web/app/api/me/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (2):
  - `401` (literal)
    - `message`: `string`
  - `404` (literal)
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`

### /api/recorded-daily-video

#### POST /api/recorded-daily-video

_No description available._

**Details**

- Source: `apps/web/app/api/recorded-daily-video/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Request body (zod)
  - Fields: not documented in source
- Responses (6):
  - status not written (literal)
    - `message`: `string`
  - `405` (literal)
    - `message`: `string`
  - `403` (literal)
    - `message`: `string`
  - `400` (literal)
    - `message`: `string`
  - status not written (literal)
    - `message`: not documented in source
  - `500` (literal)
    - `message`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `postHandler`, `POST`

### /api/sync/helpscout

#### POST /api/sync/helpscout

API for Helpscout to retrieve key information about a user from a ticket
Note: HelpScout expects a JSON with a `html` prop to show its content as HTML

**Details**

- Source: `apps/web/app/api/sync/helpscout/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (4):
  - `400` (literal)
    - `message`: `string`
  - `500` (literal)
    - `message`: `string`
  - status not written (literal)
    - `html`: `string`
  - status not written (literal)
    - `html`: not documented in source
- Headers:
  - `x-helpscout-signature`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/user/referrals-token

#### GET /api/user/referrals-token

_No description available._

**Details**

- Source: `apps/web/app/api/user/referrals-token/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (3):
  - `404` (literal)
    - `error`: `string`
  - `401` (literal)
    - `error`: `string`
  - status not written (literal) — fields not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `dynamic`, `GET`

### /api/username

#### POST /api/username

_No description available._

**Details**

- Source: `apps/web/app/api/username/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Request body (zod: `bodySchema`)
  - `username`: `string`
  - `orgSlug`: `string` — optional
- Responses (1):
  - `400` (literal)
    - `error`: `string`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/verify-booking-token

#### GET /api/verify-booking-token

_No description available._

**Details**

- Source: `apps/web/app/api/verify-booking-token/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `POST`

#### POST /api/verify-booking-token

_No description available._

**Details**

- Source: `apps/web/app/api/verify-booking-token/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `POST`

### /api/version

#### GET /api/version

_No description available._

**Details**

- Source: `apps/web/app/api/version/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (1):
  - status not written (literal)
    - `version`: not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/video/guest-session

#### POST /api/video/guest-session

_No description available._

**Details**

- Source: `apps/web/app/api/video/guest-session/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Responses (4):
  - `400` (literal)
    - `success`: `boolean`
    - `message`: `string`
  - `404` (literal)
    - `error`: `string`
  - `403` (literal)
    - `error`: `string`
  - status not written (literal)
    - `guestSessionId`: not documented in source
    - `meetingPassword`: not documented in source
    - `meetingUrl`: not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/video/recording

#### GET /api/video/recording

_No description available._

**Details**

- Source: `apps/web/app/api/video/recording/route.ts`
- Route context: none
- Query parameters:
  - `token`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`

### /api/webhook/app-credential

#### POST /api/webhook/app-credential

_No description available._

**Details**

- Source: `apps/web/app/api/webhook/app-credential/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Route context: none
- Request body (zod: `appCredentialWebhookRequestBodySchema`)
  - `userId`: `number` — `int`
  - `appSlug`: `string`
  - `keys`: `string`
- Responses (5):
  - `403` (literal)
    - `message`: `string`
  - `400` (literal)
    - `error`: not documented in source
  - `404` (literal)
    - `message`: `string`
  - status not written (literal)
    - `message`: not documented in source
  - `500` (literal)
    - `message`: `string`
- Headers:
  - not documented in source: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/webhooks/calendar-subscription/[provider]

#### POST /api/webhooks/calendar-subscription/[provider]

Handles incoming POST requests for calendar webhooks.
It processes the webhook based on the calendar provider specified in the URL.
If the provider is unsupported, it returns a 400 response.
If the webhook is processed successfully, it returns a 200 response.
In case of errors during processing, it returns a 500 response with the error message.
@param {NextRequest} request - The incoming request object.
@param {Object} context - The context object containing route parameters.
@param {Promise<Params>} context.params - A promise that resolves to the route parameters.
@returns {Promise<NextResponse>} - A promise that resolves to the response object.

**Details**

- Source: `apps/web/app/api/webhooks/calendar-subscription/[provider]/route.ts`
- Handler: wrapped via `defaultResponderForAppDir`
- Dynamic segments: `[provider]`
- Parameters:
  - `params` (url): `Promise<Params>`
- Responses (3):
  - `400` (literal)
    - `message`: `string`
  - `200` (literal)
    - `message`: `string`
  - `500` (literal) — fields not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`
