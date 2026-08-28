# Metering & Billing Service

A multi-tenant metering and billing service built with **Node.js, Express, PostgreSQL, and Stripe Test Mode**.

## What the system does

The service:

- Tracks API usage per tenant.
- Enforces monthly usage quotas.
- Uses tenant-scoped idempotency keys to prevent duplicate usage records.
- Provides monthly usage and cost reporting.
- Calculates AI-token usage and token costs.
- Calculates API-call costs.
- Provides Stripe Checkout for upgrading a tenant to Pro.
- Processes Stripe webhooks to synchronize subscription plans.
- Verifies Stripe webhook signatures.
- Deduplicates processed Stripe webhook events.
- Runs a background rollup job to calculate usage summaries and costs.
- Validates malformed and invalid API requests with appropriate 4xx responses.

The primary reliability goals are:

- A retried billable request must not create duplicate usage.
- Quota limits must be enforced before additional billable usage is recorded.
- Usage and costs must remain isolated between tenants.
- Stripe webhook events must be signature-verified and processed idempotently.

For the design overview, see [`DESIGN.md`](DESIGN.md).

---

## Plans

| Plan | API Calls / Month | AI Tokens / Month |
| ---- | ----------------: | ----------------: |
| Free |             1,000 |           100,000 |
| Pro  |            50,000 |         5,000,000 |

---

## Architecture

```text
                    +-------------------+
                    |      Client       |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    |   Express Server  |
                    +---------+---------+
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
        /generate        /usage/:id       /checkout
             |                |                |
             +----------------+                |
                              |                v
                              |          +-----------+
                              |          |  Stripe   |
                              |          +-----+-----+
                              |                |
                              |                |
                              +<--- Webhook ---+
                              |
                              v
                       +-------------+
                       | PostgreSQL  |
                       +-------------+

                              ^
                              |
                       Background Rollup
                           Job
```

The application separates HTTP routes, business services, Stripe integration, database persistence, and background processing.

---

## Database

The PostgreSQL database contains:

- `tenants`
- `usage_events`
- `processed_webhook_events`

### `tenants`

Stores each customer organization and its subscription information, including:

- tenant ID
- tenant name
- plan
- Stripe customer ID
- Stripe subscription ID

### `usage_events`

Stores billable activity belonging to a tenant.

Each event contains:

- tenant ID
- usage type
- quantity
- input tokens
- cached input tokens
- output tokens
- reasoning tokens
- idempotency key
- timestamp

The table uses a unique constraint on:

```text
(tenant_id, idempotency_key)
```

This prevents the same tenant request from being counted more than once.

### `processed_webhook_events`

Stores Stripe event IDs that have already been processed.

This prevents a replayed Stripe webhook from applying the same state change twice.

---

## Setup

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file based on `.env.example`.

Example:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/billing
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
PORT=3000
```

Do not commit real Stripe secret keys or webhook secrets.

### 4. Initialize the database

The schema is in:

```text
migrations/001_init.sql
```

In PowerShell, the migration can be applied with:

```powershell
Get-Content .\migrations\001_init.sql | docker exec -i $(docker compose ps -q db) psql -U postgres -d billing
```

### 5. Start the server

```bash
npm run dev
```

The server runs at:

```text
http://localhost:3000
```

---

## API Endpoints

### Health

```text
GET /health
```

Returns the health status of the service.

Example:

```json
{
  "ok": true
}
```

### Generate

```text
POST /generate
```

Records one API-call usage event for a tenant.

The request requires:

- `tenantId` in the JSON body
- `Idempotency-Key` header

Example:

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-1" \
  -d '{"tenantId":"TENANT_ID"}'
```

Repeated requests using the same tenant and idempotency key return the existing usage event rather than creating another one.

### Usage

```text
GET /usage/:tenantId
```

Returns the tenant's monthly:

- API-call usage
- API-call cost
- AI-token usage
- AI-token cost
- plan limits

Example:

```json
{
  "plan": "pro",
  "api_calls": {
    "used": 50000,
    "limit": 50000,
    "cost_cents": 50000,
    "cost_dollars": "500.00"
  },
  "ai_tokens": {
    "used": 2000,
    "limit": 5000000
  },
  "ai_token_cost": {
    "cents": 130,
    "dollars": "1.30"
  }
}
```

### Checkout

```text
POST /checkout
```

Creates a Stripe Checkout Session for upgrading a tenant to Pro.

Example request:

```json
{
  "tenantId": "TENANT_ID"
}
```

The response contains a Stripe Checkout URL and session ID.

### Stripe Webhook

```text
POST /webhooks/stripe
```

Receives Stripe subscription events.

The endpoint:

1. Receives the raw request body.
2. Verifies the Stripe signature.
3. Deduplicates the Stripe event ID.
4. Updates the tenant subscription state.

Supported subscription events include:

```text
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
```

---

## Idempotency

Usage requests require an idempotency key.

If the same tenant sends the same idempotency key again, the existing usage event is returned instead of creating another usage event.

The database also enforces:

```text
UNIQUE (tenant_id, idempotency_key)
```

This provides an additional safety mechanism against concurrent duplicate requests.

Stripe webhook events use their Stripe event ID for deduplication through:

```text
processed_webhook_events
```

---

## Quotas

Monthly usage is calculated from the `usage_events` table.

### Free plan

Limits:

- API calls: 1,000/month
- AI tokens: 100,000/month

Tested boundary:

```text
999  -> HTTP 200
1000 -> HTTP 200
1001 -> HTTP 402
```

The over-limit request returned:

```json
{
  "error": "quota_exceeded_upgrade_required",
  "message": "You've used 1000/1000 API calls this month. Upgrade to Pro to continue."
}
```

### Pro plan

Limits:

- API calls: 50,000/month
- AI tokens: 5,000,000/month

Tested boundary:

```text
50000 -> HTTP 200
50001 -> HTTP 429
```

The over-limit request returned:

```json
{
  "error": "quota_exceeded",
  "message": "You've used 50000/50000 API calls this month."
}
```

Quota enforcement occurs before additional billable usage is recorded.

---

## API-call Pricing

API usage is priced at:

```text
$0.01 per API call
```

For example:

```text
2 API calls × $0.01 = $0.02
```

Costs are represented internally as integer cents rather than floating-point currency values.

---

## AI Token Pricing

The service tracks:

- Input tokens
- Cached input tokens
- Output tokens
- Reasoning tokens

Tested example:

```text
Input:           1000 tokens
Cached input:     500 tokens
Output:           200 tokens
Reasoning:        300 tokens
```

The pricing calculation was:

```text
(1000 / 1000 × 0.50)
+ (500 / 1000 × 0.10)
+ (500 / 1000 × 1.50)

= 0.50 + 0.05 + 0.75
= $1.30
= 130 cents
```

The usage endpoint reported:

```json
{
  "ai_token_cost": {
    "cents": 130,
    "dollars": "1.30"
  }
}
```

---

## Stripe Test Mode

Stripe is configured for Test/Sandbox Mode.

Start Stripe webhook forwarding with:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

The tested Checkout flow is:

```text
POST /checkout
      |
      v
Stripe Checkout
      |
      v
Payment completed
      |
      v
checkout.session.completed
      |
      v
Webhook signature verification
      |
      v
Tenant identified by client_reference_id
      |
      v
Database updated
      |
      v
Free -> Pro
```

Subscription cancellation is handled through:

```text
customer.subscription.deleted
```

which changes the tenant from Pro back to Free.

---

## Stripe Webhook Security

Stripe webhook signatures are verified using:

```text
STRIPE_WEBHOOK_SECRET
```

A forged webhook using an invalid signature was rejected with HTTP 400:

```text
Webhook signature verification failed:
No signatures found matching the expected signature for payload.
```

The webhook route uses the raw request body before `express.json()` so that Stripe signature verification can operate correctly.

---

## Webhook Deduplication

Processed Stripe event IDs are stored in:

```text
processed_webhook_events
```

If the same event is received again, it is acknowledged without processing the event a second time.

A Stripe event replay produced:

```text
[webhook] duplicate event ignored: evt_1U9I2RFqujTPnt3gemzdTqXs
```

---

## Background Rollup Job

The application includes a background rollup job.

The job:

- Queries tenant usage.
- Calculates monthly API-call usage.
- Calculates corresponding API-call cost.
- Processes all tenants.
- Includes retry handling.

A successful run produced:

```text
[rollup] tenant=Acme Inc api_calls=2 cost_cents=2
[rollup] tenant=Pro Test Tenant api_calls=50000 cost_cents=50000
[rollup] tenant=Quota Test Tenant api_calls=1000 cost_cents=1000
[rollup] succeeded on attempt 1, processed 3 tenants
```

---

## Request Validation

The `/generate` endpoint validates malformed and invalid requests.

Tested cases include:

- Missing `tenantId`
- Missing `Idempotency-Key`
- Malformed JSON
- Invalid tenant UUID
- Valid UUID for a nonexistent tenant

Example nonexistent-tenant response:

```json
{
  "error": "tenant not found"
}
```

These validation cases are documented in `EVIDENCE.md`.

---

## Tenant Isolation

Usage is scoped to individual tenants.

Testing confirmed that generating an API request for one tenant changes only that tenant's usage.

For example, an Acme usage increase did not change the Pro Test Tenant's usage.

This demonstrates tenant-level data isolation.

---

## Testing

The project was tested with:

- PostgreSQL running through Docker.
- Express server running locally.
- API usage tracking.
- Idempotency behavior.
- Free-plan quota boundary.
- Pro-plan quota boundary.
- API-call cost reporting.
- AI-token pricing.
- Stripe Checkout in Test Mode.
- Stripe CLI webhook forwarding.
- Stripe subscription cancellation.
- Stripe webhook signature verification.
- Stripe webhook event deduplication.
- Tenant isolation.
- Malformed-request validation.
- Missing-field validation.
- Invalid UUID validation.
- Nonexistent-tenant validation.
- Background rollup processing.
- Server health checks.

Detailed test results and command outputs are documented in:

```text
EVIDENCE.md
```

---

## Project Documentation

```text
README.md
DESIGN.md
EVIDENCE.md
BUILDLOG.md
capstone.yaml
.env.example
```

### DESIGN.md

Contains the design overview covering:

- Problem
- Data model
- API surface
- Layer sketch
- Plans and quotas
- Explicit non-goals
- Reliability decisions

### EVIDENCE.md

Contains detailed implementation and testing evidence.

### BUILDLOG.md

Contains the implementation/build history.

### capstone.yaml

Defines the project run command, database seed command, base URL, and exposed endpoints.

---

## Environment Variables

Example configuration is provided in:

```text
.env.example
```

Real credentials should be stored only in:

```text
.env
```

and should never be committed to Git.

---

## Limitations

This project does not implement:

- Production payment processing
- Proration
- Refund processing
- Tax calculation
- Advanced invoicing
- Production-grade billing functionality
- Overage billing

Stripe is configured for Test/Sandbox Mode only.

---

## License

This project was developed as a capstone implementation.
