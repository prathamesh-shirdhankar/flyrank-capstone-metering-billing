# Metering & Billing Service — Design

## 1. Problem

SaaS applications need to know how much each customer has used, whether that customer has reached the limits of their subscription plan, and what that usage costs.

This service provides multi-tenant usage metering, monthly quota enforcement, AI-token cost calculation, and Stripe Test Mode subscription synchronization.

The primary correctness goals are:

- A retried billable request must not create duplicate usage.
- Quota limits must be enforced before allowing additional usage.
- Usage and costs must remain isolated between tenants.
- Stripe webhook events must be signature-verified and processed idempotently.

## 2. Data Model

The PostgreSQL database contains three main tables.

### `tenants`

Stores each customer organization and its current subscription information.

Important fields include:

- Tenant ID
- Tenant name
- Plan
- Stripe customer ID
- Stripe subscription ID

### `usage_events`

Stores billable activity belonging to a tenant.

Each event contains:

- Tenant ID
- Usage type
- Quantity
- Input tokens
- Cached input tokens
- Output tokens
- Reasoning tokens
- Idempotency key
- Timestamp

A unique constraint on `(tenant_id, idempotency_key)` prevents duplicate usage records for the same tenant and request.

### `processed_webhook_events`

Stores Stripe event IDs that have already been processed.

This prevents a Stripe webhook replay from applying the same state change twice.

## 3. API Surface

### `POST /generate`

The dummy billable endpoint.

Request:

- `tenantId` in the JSON body
- `Idempotency-Key` header

The endpoint validates the tenant, checks the monthly quota, and records one API-call usage event.

### `GET /usage/:tenantId`

Returns the tenant's monthly usage, plan limits, and calculated AI-token cost.

### `POST /checkout`

Creates a Stripe Checkout Session for upgrading a tenant to Pro.

### `POST /webhooks/stripe`

Receives Stripe events using the raw request body, verifies the Stripe webhook signature, deduplicates events, and synchronizes the tenant's subscription plan.

### `GET /health`

Returns the health status of the service.

## 4. Layer Sketch

```text
Client
  |
  v
Express HTTP Routes
  |
  +-------------------------+
  |                         |
  v                         v
Generate / Usage        Checkout / Webhook
  |                         |
  v                         v
Business Services       Stripe Integration
  |                         |
  +------------+------------+
               |
               v
          PostgreSQL
```

The application separates HTTP handling from business logic and persistence.

Metering path
POST /generate
|
v
Validate request
|
v
Find tenant
|
v
Check quota
|
+---- exceeded ----> 402 / 429
|
v
Record usage event
|
+---- duplicate ----> return existing event
|
v
Return result
Stripe synchronization path
Stripe Checkout
|
v
checkout.session.completed
|
v
Verify webhook signature
|
v
Deduplicate event ID
|
v
Update tenant plan 5. Plans and Quotas
Plan API Calls / Month AI Tokens / Month
Free 1,000 100,000
Pro 50,000 5,000,000

Quota enforcement occurs before recording additional billable usage.

Free-plan quota exhaustion returns 402 Payment Required, while the Pro over-quota condition returns 429 Too Many Requests.

6. Explicit Non-Goal

Production-grade invoicing, proration, refund processing, tax calculation, and overage billing are outside the core scope of this capstone.

Stripe is used in Test/Sandbox Mode only.

7. Reliability Decisions
   API idempotency

The same tenant and idempotency key must result in one usage event only.

Webhook idempotency

Stripe event IDs are stored in processed_webhook_events. A replayed event is acknowledged without being processed again.

Money representation

Costs are represented as integer cents rather than floating-point currency values.

Background processing

The rollup job processes usage summaries separately from the request path and includes retry handling.
