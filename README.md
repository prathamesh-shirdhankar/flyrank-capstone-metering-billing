# Metering & Billing Service

A multi-tenant metering and billing service built with **Node.js, Express, PostgreSQL, and Stripe Test Mode**.

## What the system does

The service:

* Tracks API usage per tenant.
* Enforces monthly usage quotas.
* Uses idempotency keys to prevent duplicate usage records.
* Provides a monthly usage endpoint.
* Calculates AI-token usage and token costs.
* Provides Stripe Checkout for upgrading a tenant to Pro.
* Processes Stripe webhooks to update subscription plans.
* Verifies Stripe webhook signatures.
* Deduplicates processed Stripe webhook events.

## Plans

| Plan | API Calls / Month | AI Tokens / Month |
| ---- | ----------------: | ----------------: |
| Free |             1,000 |           100,000 |
| Pro  |            50,000 |         5,000,000 |

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
```

## Database

The PostgreSQL database contains:

* `tenants`
* `usage_events`
* `processed_webhook_events`

The `usage_events` table uses a unique constraint on:

```text
tenant_id + idempotency_key
```

This prevents the same tenant request from being counted more than once.

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

```bash
docker exec -i $(docker compose ps -q db) psql -U postgres -d billing < migrations/001_init.sql
```

### 5. Start the server

```bash
npm run dev
```

The server runs at:

```text
http://localhost:3000
```

Health check:

```text
GET /health
```

## API Endpoints

### Generate

```text
POST /generate
```

Records one API call for a tenant.

The request requires an `Idempotency-Key` header.

Example:

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-1" \
  -d '{"tenantId":"TENANT_ID"}'
```

### Usage

```text
GET /usage/:tenantId
```

Returns the tenant's monthly:

* API-call usage
* AI-token usage
* AI-token cost

Example response:

```json
{
  "plan": "pro",
  "api_calls": {
    "used": 50000,
    "limit": 50000
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

### Stripe Webhook

```text
POST /webhooks/stripe
```

Processes Stripe subscription events and updates the tenant's plan.

## Idempotency

Usage requests require an idempotency key.

If the same tenant sends the same idempotency key again, the existing usage event is returned instead of creating another usage event.

The database unique constraint provides an additional safety mechanism for concurrent requests.

## Quotas

Monthly usage is calculated from the `usage_events` table.

### Free plan

* API-call limit: 1,000/month
* AI-token limit: 100,000/month

The tested boundary was:

```text
1000 requests -> HTTP 200
1001 requests -> HTTP 402
```

The 1001st request returned:

```json
{
  "error": "quota_exceeded_upgrade_required",
  "message": "You've used 1000/1000 API calls this month. Upgrade to Pro to continue."
}
```

### Pro plan

* API-call limit: 50,000/month
* AI-token limit: 5,000,000/month

The tested boundary was:

```text
50000 requests -> HTTP 200
50001 requests -> HTTP 429
```

The over-limit request returned:

```json
{
  "error": "quota_exceeded",
  "message": "You've used 50000/50000 API calls this month."
}
```

## AI Token Pricing

The service tracks:

* Input tokens
* Cached input tokens
* Output tokens
* Reasoning tokens

The tested pricing example was:

```text
Input:          1000 tokens
Cached input:    500 tokens
Output:          200 tokens
Reasoning:        300 tokens
```

Expected cost:

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

## Stripe Test Mode

Stripe is configured for test/sandbox mode.

Start Stripe webhook forwarding with:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

The Stripe Checkout flow was tested successfully.

The tested flow was:

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
free -> pro
```

## Stripe Webhook Security

Stripe webhook signatures are verified using:

```text
STRIPE_WEBHOOK_SECRET
```

A forged webhook using a fake signature was rejected with HTTP 400:

```text
Webhook signature verification failed:
No signatures found matching the expected signature for payload.
```

## Webhook Deduplication

Processed Stripe event IDs are stored in:

```text
processed_webhook_events
```

If the same Stripe event is received again, it is treated as a duplicate instead of being processed again.

## Testing

The project was tested with:

* PostgreSQL running through Docker.
* Express server running locally.
* API usage tracking.
* Idempotency behavior.
* Free-plan quota boundary.
* Pro-plan quota boundary.
* AI-token pricing.
* Stripe Checkout in test mode.
* Stripe CLI webhook forwarding.
* Stripe subscription cancellation.
* Stripe webhook signature verification.
* Stripe webhook event deduplication.
* Tenant isolation.

## Evidence

Detailed test results and command outputs are documented in:

```text
EVIDENCE.md
```

## Build Log

Implementation progress is documented in:

```text
buildlog.md
```

## Environment Variables

Example environment configuration is provided in:

```text
.env.example
```

Real credentials should be stored only in `.env` and should never be committed.

## Limitations

This project does not implement:

* Proration
* Production payment processing
* Refund processing
* Tax calculation
* Advanced invoicing
* Other production-grade billing functionality

Stripe is configured for test/sandbox mode only.
