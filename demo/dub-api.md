# steven-tey/dub — API Reference

Structural facts below were extracted from the source at branch `main` with a TypeScript AST parser; descriptions are AI-written from those facts only.

> **Coverage note:** 470 route files were not scanned (file cap: 50), so endpoints defined there are missing from this document.

## Endpoints (57)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/analytics` |  |
| POST | `/api/admin/ban` |  |
| GET | `/api/admin/commissions` |  |
| POST | `/api/admin/domains/refresh` |  |
| POST | `/api/admin/domains/register-premium` |  |
| POST | `/api/admin/domains/renew` |  |
| GET | `/api/admin/domains/search-availability` |  |
| GET | `/api/admin/events` |  |
| PATCH | `/api/admin/fraud-alerts/[fraudAlertId]` |  |
| POST | `/api/admin/impersonate` |  |
| DELETE | `/api/admin/links/ban` |  |
| GET | `/api/admin/links/count` |  |
| GET | `/api/admin/links` |  |
| POST | `/api/admin/partners/[partnerId]/generate-veriff-session` |  |
| PATCH | `/api/admin/partners/[partnerId]/network-status` |  |
| POST | `/api/admin/partners/[partnerId]/platforms` |  |
| GET | `/api/admin/partners/[partnerId]` |  |
| PATCH | `/api/admin/partners/[partnerId]` |  |
| GET | `/api/admin/partners/[partnerId]/shared-platforms` |  |
| POST | `/api/admin/partners/[partnerId]/verify-identity` |  |
| POST | `/api/admin/partners/delete-account` |  |
| GET | `/api/admin/partners/fraud` |  |
| GET | `/api/admin/partners/network/count` |  |
| GET | `/api/admin/partners/network` |  |
| GET | `/api/admin/partners/trusted` |  |
| POST | `/api/admin/partners/trusted` |  |
| DELETE | `/api/admin/partners/trusted` |  |
| GET | `/api/admin/payouts/paypal` |  |
| GET | `/api/admin/payouts` |  |
| GET | `/api/admin/payouts/stablecoin` |  |
| PATCH | `/api/admin/programs/[programId]` |  |
| DELETE | `/api/admin/programs/[programId]` |  |
| GET | `/api/admin/programs/recent` |  |
| GET | `/api/admin/programs` |  |
| POST | `/api/admin/programs` |  |
| PATCH | `/api/admin/programs` |  |
| GET | `/api/admin/programs/sales` |  |
| POST | `/api/admin/reset-login-attempts` |  |
| GET | `/api/admin/revenue` |  |
| POST | `/api/admin/slack-support-invite` |  |
| POST | `/api/admin/workspaces/disable` |  |
| POST | `/api/admin/workspaces/restore` |  |
| GET | `/api/appsflyer/webhook` |  |
| HEAD | `/api/appsflyer/webhook` |  |
| POST | `/api/audit-logs/export` |  |
| POST | `/api/auth/saml/callback` |  |
| POST | `/api/auth/saml/token` |  |
| GET | `/api/auth/saml/userinfo` |  |
| POST | `/api/auth/saml/verify` |  |
| GET | `/api/bounties/[bountyId]` |  |
| PATCH | `/api/bounties/[bountyId]` |  |
| DELETE | `/api/bounties/[bountyId]` |  |
| POST | `/api/bounties/[bountyId]/submissions/[submissionId]/approve` |  |
| POST | `/api/bounties/[bountyId]/submissions/[submissionId]/reject` |  |
| GET | `/api/bounties/[bountyId]/submissions` |  |
| POST | `/api/bounties/[bountyId]/sync-social-metrics` |  |
| GET | `/api/bounties/count/submissions` |  |

## Reference

### /api/admin/analytics

#### GET /api/admin/analytics

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/analytics/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/ban

#### POST /api/admin/ban

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/ban/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Responses (1):
  - status not written (literal)
    - `success`: `boolean`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/commissions

#### GET /api/admin/commissions

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/commissions/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (zod: `adminCommissionsDataSchema`) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/domains/refresh

#### POST /api/admin/domains/refresh

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/domains/refresh/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Responses (1):
  - status not written (literal)
    - `success`: `boolean`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/domains/register-premium

#### POST /api/admin/domains/register-premium

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/domains/register-premium/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Request body (zod: `schema`)
  - `domain`: `string` — `min(1)`, `transform(...)`
  - `workspaceSlug`: `string` — `min(1)`
- Responses (5):
  - `400` (literal)
    - `error`: not documented in source
  - `400` (literal)
    - `error`: `string`
  - `404` (literal)
    - `error`: not documented in source
  - status not written (literal) — fields not documented in source
  - status not written (literal)
    - `error`: not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/domains/renew

#### POST /api/admin/domains/renew

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/domains/renew/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Request body (zod: `schema`)
  - `domain`: `string` — `min(1)`, `transform(...)`
- Responses (6):
  - `400` (literal)
    - `error`: not documented in source
  - `400` (literal)
    - `error`: `string`
  - `404` (literal)
    - `error`: not documented in source
  - `409` (literal)
    - `error`: `string`
  - `422` (literal)
    - `error`: `string`
    - `invoiceId`: not documented in source
  - status not written (literal)
    - `success`: `boolean`
    - `message`: `string`
    - `invoiceId`: not documented in source
    - `paymentIntentStatus`: not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/domains/search-availability

#### GET /api/admin/domains/search-availability

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/domains/search-availability/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (2):
  - `400` (literal)
    - `error`: not documented in source
  - `400` (literal)
    - `error`: `string`
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/events

#### GET /api/admin/events

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/events/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/fraud-alerts/[fraudAlertId]

#### PATCH /api/admin/fraud-alerts/[fraudAlertId]

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/fraud-alerts/[fraudAlertId]/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[fraudAlertId]`
- Parameters:
  - `req` (context): not documented in source
  - `params` (url): not documented in source
  - `session` (context): not documented in source
- Request body (zod: `reviewSchema`)
  - `status`: `enum: confirmed | dismissed`
  - `reviewNote`: `string` — optional, `max(MAX_FRAUD_REASON_LENGTH)`
- Responses (1):
  - status not written (literal)
    - `success`: `boolean`
- Reads the request: yes
- Returns a Response: yes
- Exports: `PATCH`

### /api/admin/impersonate

#### POST /api/admin/impersonate

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/impersonate/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Responses (1):
  - status not written (literal: `data`)
    - `email`: not documented in source
    - `workspaces`: not documented in source
    - `programs`: not documented in source
    - `impersonateUrl`: not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/links/ban

#### DELETE /api/admin/links/ban

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/links/ban/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - `404` (literal)
    - `error`: `string`
- Reads the request: no
- Returns a Response: yes
- Exports: `DELETE`

### /api/admin/links/count

#### GET /api/admin/links/count

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/links/count/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/links

#### GET /api/admin/links

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/links/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/partners/[partnerId]/generate-veriff-session

#### POST /api/admin/partners/[partnerId]/generate-veriff-session

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/[partnerId]/generate-veriff-session/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[partnerId]`
- Parameters:
  - `params` (url): not documented in source
- Responses (1):
  - status not written (literal)
    - `sessionUrl`: not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `POST`

### /api/admin/partners/[partnerId]/network-status

#### PATCH /api/admin/partners/[partnerId]/network-status

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/[partnerId]/network-status/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[partnerId]`
- Parameters:
  - `params` (url): not documented in source
  - `req` (context): not documented in source
- Request body (zod: `updateAdminNetworkStatusSchema`)
  - `status`: `enum: approved | rejected | draft`
- Reads the request: yes
- Returns a Response: yes
- Exports: `PATCH`

### /api/admin/partners/[partnerId]/platforms

#### POST /api/admin/partners/[partnerId]/platforms

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/[partnerId]/platforms/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[partnerId]`
- Parameters:
  - `req` (context): not documented in source
  - `params` (url): not documented in source
- Request body (zod: `postSchema`)
  - `platform`: not documented in source
  - `identifier`: `string` — `min(1)`
  - `postUrl`: `string` — optional, `url`
- Responses (1):
  - status not written (literal)
    - `platform`: not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/partners/[partnerId]

#### GET /api/admin/partners/[partnerId]

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/[partnerId]/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[partnerId]`
- Parameters:
  - `params` (url): not documented in source
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`, `PATCH`

#### PATCH /api/admin/partners/[partnerId]

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/[partnerId]/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[partnerId]`
- Parameters:
  - `params` (url): not documented in source
  - `req` (context): not documented in source
- Request body (zod: `adminUpdatePartnerSchema`)
  - `country`: not documented in source
- Responses (1):
  - status not written (literal)
    - `success`: `boolean`
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `PATCH`

### /api/admin/partners/[partnerId]/shared-platforms

#### GET /api/admin/partners/[partnerId]/shared-platforms

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/[partnerId]/shared-platforms/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[partnerId]`
- Parameters:
  - `params` (url): not documented in source
- Responses (2):
  - status not written (literal) — fields not documented in source
  - status not written (zod) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/partners/[partnerId]/verify-identity

#### POST /api/admin/partners/[partnerId]/verify-identity

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/[partnerId]/verify-identity/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[partnerId]`
- Parameters:
  - `params` (url): not documented in source
- Responses (1):
  - status not written (literal)
    - `success`: `boolean`
- Reads the request: no
- Returns a Response: yes
- Exports: `POST`

### /api/admin/partners/delete-account

#### POST /api/admin/partners/delete-account

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/delete-account/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Responses (1):
  - status not written (literal)
    - `success`: `boolean`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/partners/fraud

#### GET /api/admin/partners/fraud

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/fraud/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/partners/network/count

#### GET /api/admin/partners/network/count

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/network/count/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (literal)
    - `count`: not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/partners/network

#### GET /api/admin/partners/network

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/network/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (zod) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/partners/trusted

#### GET /api/admin/partners/trusted

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/trusted/route.ts`
- Handler: wrapped via `withAdmin`
- Route context: none
- Responses (1):
  - status not written (literal)
    - `partners`: not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`, `POST`, `DELETE`

#### POST /api/admin/partners/trusted

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/trusted/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Request body (zod)
  - `partnerIdOrEmail`: `string` — `min(1)`
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `POST`, `DELETE`

#### DELETE /api/admin/partners/trusted

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/partners/trusted/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Request body (zod)
  - `partnerId`: `string` — `min(1)`
- Responses (1):
  - status not written (literal)
    - `success`: `boolean`
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `POST`, `DELETE`

### /api/admin/payouts/paypal

#### GET /api/admin/payouts/paypal

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/payouts/paypal/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/payouts

#### GET /api/admin/payouts

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/payouts/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/payouts/stablecoin

#### GET /api/admin/payouts/stablecoin

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/payouts/stablecoin/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (zod) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/programs/[programId]

#### PATCH /api/admin/programs/[programId]

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/programs/[programId]/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[programId]`
- Parameters:
  - `params` (url): not documented in source
  - `req` (context): not documented in source
- Request body (zod: `updateProgramSchema`)
  - Fields: not documented in source (schema `updateProgramSchema` could not be resolved to plain fields)
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `PATCH`, `DELETE`

#### DELETE /api/admin/programs/[programId]

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/programs/[programId]/route.ts`
- Handler: wrapped via `withAdmin`
- Dynamic segments: `[programId]`
- Parameters:
  - `params` (url): not documented in source
- Responses (1):
  - status not written (literal)
    - `ok`: `boolean`
- Reads the request: no
- Returns a Response: yes
- Exports: `PATCH`, `DELETE`

### /api/admin/programs/recent

#### GET /api/admin/programs/recent

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/programs/recent/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/programs

#### GET /api/admin/programs

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/programs/route.ts`
- Handler: wrapped via `withAdmin`
- Route context: none
- Responses (1):
  - status not written (literal)
    - `programs`: not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`, `POST`, `PATCH`

#### POST /api/admin/programs

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/programs/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Request body (zod: `addProgramSchema`)
  - `programSlug`: `string` — `min(1)`
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `POST`, `PATCH`

#### PATCH /api/admin/programs

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/programs/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Request body (zod: `reorderProgramsSchema`)
  - `updates`: `object[]` — `min(1)`
- Responses (1):
  - status not written (literal)
    - `ok`: `boolean`
    - `updated`: not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `POST`, `PATCH`

### /api/admin/programs/sales

#### GET /api/admin/programs/sales

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/programs/sales/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/reset-login-attempts

#### POST /api/admin/reset-login-attempts

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/reset-login-attempts/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Responses (3):
  - `400` (literal)
    - `error`: `string`
  - `404` (literal)
    - `error`: `string`
  - status not written (literal)
    - `success`: `boolean`
    - `user`: not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/revenue

#### GET /api/admin/revenue

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/revenue/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `searchParams` (context): not documented in source
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/admin/slack-support-invite

#### POST /api/admin/slack-support-invite

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/slack-support-invite/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Responses (3):
  - `400` (literal)
    - `error`: `string`
  - `409` (literal)
    - `error`: not documented in source
    - `nameTaken`: `boolean`
  - status not written (literal) — fields not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/workspaces/disable

#### POST /api/admin/workspaces/disable

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/workspaces/disable/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Responses (1):
  - status not written (literal)
    - `success`: `boolean`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/admin/workspaces/restore

#### POST /api/admin/workspaces/restore

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/admin/workspaces/restore/route.ts`
- Handler: wrapped via `withAdmin`
- Parameters:
  - `req` (context): not documented in source
- Responses (1):
  - status not written (literal)
    - `success`: `boolean`
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/appsflyer/webhook

#### GET /api/appsflyer/webhook

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/appsflyer/webhook/route.ts`
- Handler: wrapped via `withAxiom`
- Route context: none
- Headers:
  - `user-agent`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `HEAD`

#### HEAD /api/appsflyer/webhook

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/appsflyer/webhook/route.ts`
- Route context: none
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`, `HEAD`

### /api/audit-logs/export

#### POST /api/audit-logs/export

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/audit-logs/export/route.ts`
- Handler: wrapped via `withWorkspace`
- Parameters:
  - `req` (context): not documented in source
  - `workspace` (context): not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/saml/callback

#### POST /api/auth/saml/callback

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/auth/saml/callback/route.ts`
- Route context: none
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/saml/token

#### POST /api/auth/saml/token

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/auth/saml/token/route.ts`
- Route context: none
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/auth/saml/userinfo

#### GET /api/auth/saml/userinfo

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/auth/saml/userinfo/route.ts`
- Route context: none
- Headers:
  - `Authorization`: type not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`

### /api/auth/saml/verify

#### POST /api/auth/saml/verify

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/auth/saml/verify/route.tsx`
- Route context: none
- Responses (4):
  - `400` (literal)
    - `error`: `string`
  - `429` (literal)
    - `error`: not documented in source
  - `404` (literal)
    - `error`: `string`
  - status not written (literal) — fields not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/bounties/[bountyId]

#### GET /api/bounties/[bountyId]

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/bounties/[bountyId]/route.ts`
- Handler: wrapped via `withWorkspace`
- Dynamic segments: `[bountyId]`
- Parameters:
  - `workspace` (context): not documented in source
  - `params` (url): not documented in source
- Responses (1):
  - status not written (zod: `BountySchema`) — fields not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`, `PATCH`, `DELETE`

#### PATCH /api/bounties/[bountyId]

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/bounties/[bountyId]/route.ts`
- Handler: wrapped via `withWorkspace`
- Dynamic segments: `[bountyId]`
- Parameters:
  - `workspace` (context): not documented in source
  - `params` (url): not documented in source
  - `req` (context): not documented in source
  - `session` (context): not documented in source
- Responses (1):
  - status not written (zod: `BountySchema`) — fields not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `GET`, `PATCH`, `DELETE`

#### DELETE /api/bounties/[bountyId]

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/bounties/[bountyId]/route.ts`
- Handler: wrapped via `withWorkspace`
- Dynamic segments: `[bountyId]`
- Parameters:
  - `workspace` (context): not documented in source
  - `params` (url): not documented in source
  - `session` (context): not documented in source
- Responses (1):
  - status not written (literal)
    - `id`: not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`, `PATCH`, `DELETE`

### /api/bounties/[bountyId]/submissions/[submissionId]/approve

#### POST /api/bounties/[bountyId]/submissions/[submissionId]/approve

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/bounties/[bountyId]/submissions/[submissionId]/approve/route.ts`
- Handler: wrapped via `withWorkspace`
- Dynamic segments: `[bountyId]`, `[submissionId]`
- Parameters:
  - `workspace` (context): not documented in source
  - `params` (url): not documented in source
  - `req` (context): not documented in source
  - `session` (context): not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/bounties/[bountyId]/submissions/[submissionId]/reject

#### POST /api/bounties/[bountyId]/submissions/[submissionId]/reject

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/bounties/[bountyId]/submissions/[submissionId]/reject/route.ts`
- Handler: wrapped via `withWorkspace`
- Dynamic segments: `[bountyId]`, `[submissionId]`
- Parameters:
  - `workspace` (context): not documented in source
  - `params` (url): not documented in source
  - `req` (context): not documented in source
  - `session` (context): not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/bounties/[bountyId]/submissions

#### GET /api/bounties/[bountyId]/submissions

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/bounties/[bountyId]/submissions/route.ts`
- Handler: wrapped via `withWorkspace`
- Dynamic segments: `[bountyId]`
- Parameters:
  - `workspace` (context): not documented in source
  - `params` (url): not documented in source
  - `searchParams` (context): not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`

### /api/bounties/[bountyId]/sync-social-metrics

#### POST /api/bounties/[bountyId]/sync-social-metrics

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/bounties/[bountyId]/sync-social-metrics/route.ts`
- Handler: wrapped via `withWorkspace`
- Dynamic segments: `[bountyId]`
- Parameters:
  - `workspace` (context): not documented in source
  - `params` (url): not documented in source
  - `req` (context): not documented in source
- Responses (1):
  - status not written (literal) — fields not documented in source
- Reads the request: yes
- Returns a Response: yes
- Exports: `POST`

### /api/bounties/count/submissions

#### GET /api/bounties/count/submissions

_No description available._

**Details**

- Source: `apps/web/app/(ee)/api/bounties/count/submissions/route.ts`
- Handler: wrapped via `withWorkspace`
- Parameters:
  - `workspace` (context): not documented in source
  - `searchParams` (context): not documented in source
- Reads the request: no
- Returns a Response: yes
- Exports: `GET`
