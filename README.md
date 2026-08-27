Absolutely. Your current README has escaped characters (`\#`, `\&`, `\_`) and HTML-style spacing artifacts, so GitHub will not render it cleanly.

Replace the **entire contents** of `README.md` with this:

# Metering & Billing Service

A multi-tenant metering and billing service built with **Node.js, Express, PostgreSQL, and Stripe Test Mode**.

The service tracks API and AI-token usage, enforces monthly quotas, prevents duplicate usage through idempotency keys, and integrates Stripe Checkout and webhooks for subscription management.

## What the System Does

The system:

* Tracks API usage per tenant
* Tracks AI-token usage and token costs
* Enforces monthly usage quotas
* Uses idempotency keys to prevent duplicate usage records
* Provides a usage endpoint
* Provides Stripe Checkout for upgrading tenants to Pro
* Processes Stripe webhooks to update subscription plans
* Verifies Stripe webhook signatures
* Deduplicates processed Stripe webhook events
* Supports multiple tenants with isolated usage and quotas

## Plans

| Feature           |    Free |       Pro |
| ----------------- | ------: | --------: |
| API calls / month |   1,000 |    50,000 |
| AI tokens / month | 100,000 | 5,000,000 |

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
              +----------------+---+---+----------------+
              |                |       |                |
              v                v       v                v
         /generate        /usage/:id  /checkout   /webhooks/stripe
              |                |       |                |
              v                v       v                v
       +-------------------------------------------------------+
       |                    PostgreSQL                         |
       |                                                       |
       |  tenants                                             |
       |  usage_events                                        |
       |  processed_webhook_events                            |
       +-------------------------------------------------------+
                                   ^
                                   |
                                   |
                              +----+----+
                              |  Stripe |
                              +---------+
```

## Database

The PostgreSQL database contains three main tables:

* `tenants`
* `usage_events`
* `processed_webhook_events`

### Usage Event Idempotency

The `usage_events` table enforces a unique constraint on:

```text
tenant_id + idempotency_key
```

This prevents the same tenant and idempotency key combination from creating duplicate usage records.

The application also handles duplicate requests by returning the existing usage event.

## Setup

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/billing
STRIPE_SECRET_KEY=your_stripe_test_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
PORT=3000
```

> Never commit real Stripe secret keys or webhook secrets to Git.

### 4. Start the Server

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

### Generate Usage Event

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

Returns the tenant's current monthly usage.

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

Processes Stripe subscription events and updates the tenant's subscription plan.

## Idempotency

Usage requests require an idempotency key.

When the same tenant sends the same idempotency key again, the existing usage event is returned instead of creating another event.

Example:

```text
First request:
wasDuplicate: false

Second identical request:
wasDuplicate: true
```

The database unique constraint provides an additional safety mechanism against concurrent duplicate requests.

## Quotas

Monthly usage is calculated from the `usage_events` table.

### Free Plan

The Free plan allows:

```text
1,000 API calls / month
100,000 AI tokens / month
```

The quota boundary was tested successfully:

```text
API call 999  → HTTP 200
API call 1000 → HTTP 200
API call 1001 → HTTP 402
```

The 1001st request returned:

```json
{
  "error": "quota_exceeded_upgrade_required",
  "message": "You've used 1000/1000 API calls this month. Upgrade to Pro to continue."
}
```

### Pro Plan

The Pro plan allows:

```text
50,000 API calls / month
5,000,000 AI tokens / month
```

The Pro quota boundary was tested successfully:

```text
API call 50,000 → HTTP 200
API call 50,001 → HTTP 429
```

The over-quota request returned:

```json
{
  "error": "quota_exceeded",
  "message": "You've used 50000/50000 API calls this month."
}
```

## AI Token Pricing

The service calculates AI-token costs using separate rates for:

* Input tokens
* Cached input tokens
* Output tokens
* Reasoning tokens

Example test:

```text
Input tokens:         1,000
Cached input tokens:    500
Output tokens:          200
Reasoning tokens:       300
```

Expected calculation:

```text
Input:
1000 / 1000 × $0.50 = $0.50

Cached input:
500 / 1000 × $0.10 = $0.05

Output + reasoning:
(200 + 300) / 1000 × $1.50 = $0.75

Total:
$0.50 + $0.05 + $0.75 = $1.30
```

The usage endpoint reports:

```json
{
  "ai_token_cost": {
    "cents": 130,
    "dollars": "1.30"
  }
}
```

## Stripe Test Mode

Stripe is configured in **Test/Sandbox Mode** for this project.

The Stripe CLI can forward webhook events to the local server:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Successful Stripe Checkout testing demonstrated the following flow:

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
Stripe webhook
      |
      v
Signature verification
      |
      v
Tenant identified using client_reference_id
      |
      v
Database updated
      |
      v
free → pro
```

## Stripe Webhook Security

Stripe webhook signatures are verified using:

```text
STRIPE_WEBHOOK_SECRET
```

A forged webhook using an invalid signature was rejected with HTTP `400`.

Example invalid signature:

```text
Stripe-Signature: t=123,v1=fake
```

Result:

```text
Webhook signature verification failed:
No signatures found matching the expected signature for payload.
```

This demonstrates that webhook signature verification is enabled.

## Webhook Deduplication

Processed Stripe webhook events are stored in:

```text
processed_webhook_events
```

The Stripe event ID is used to prevent the same webhook event from being processed more than once.

Duplicate events return:

```json
{
  "received": true,
  "duplicate": true
}
```

## Subscription Downgrade

The application handles Stripe subscription cancellation events.

When:

```text
customer.subscription.deleted
```

is received, the tenant associated with the Stripe subscription is changed from:

```text
pro → free
```

This behavior was tested successfully using the Stripe CLI.

## Multi-Tenant Isolation

Usage is stored and calculated per tenant.

Example verification:

```text
Acme / Free Tenant:
API calls: 2 / 1,000

Pro Test Tenant:
API calls: 50,000 / 50,000
AI tokens: 2,000 / 5,000,000
```

Usage from one tenant does not affect another tenant's quota.

## Testing

The system was tested with:

* PostgreSQL running through Docker
* Express server running locally
* API usage recording
* Idempotency handling
* Free-plan quota boundary
* Pro-plan quota boundary
* AI-token pricing
* Usage endpoint
* Stripe Checkout in Test Mode
* Stripe webhook forwarding
* Stripe webhook signature verification
* Stripe subscription cancellation
* Webhook event deduplication
* Multi-tenant usage isolation

## Evidence

Detailed test results and command outputs are documented in:

```text
EVIDENCE.md
```

The evidence includes:

* Idempotency test
* Free-plan quota boundary
* Pro-plan quota boundary
* AI-token pricing
* Stripe Checkout
* Stripe webhook processing
* Forged webhook rejection
* Subscription cancellation
* Multi-tenant isolation

## Limitations

This project does not implement:

* Proration
* Production invoicing
* Refund processing
* Tax calculation
* Production payment processing
* Advanced billing adjustments

Stripe is configured for **Test/Sandbox Mode only**.

## Tech Stack

* **Node.js**
* **Express**
* **PostgreSQL**
* **Docker**
* **Stripe**
* **Stripe CLI**
* **JavaScript**

## Project Status

The core metering, quota enforcement, token pricing, idempotency, multi-tenant isolation, Stripe Checkout, and Stripe webhook flows have been implemented and tested successfully.
