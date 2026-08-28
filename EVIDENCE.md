# Evidence

## 1. Idempotent Metering

Tenant ID:

`15247435-0fe5-48c7-9791-46ac6920fd13`

The same `POST /generate` request was sent twice using:

```text
Idempotency-Key: test-key-1
```

The first request returned:

```text
wasDuplicate: false
```

The second identical request returned:

```text
wasDuplicate: true
```

This demonstrates that the same tenant and idempotency key do not create a second usage event.

The database also enforces a unique constraint on:

```text
(tenant_id, idempotency_key)
```

This provides an additional database-level safeguard against duplicate usage records.

---

## 2. Free-Plan Quota Boundary

Quota-test tenant:

`bb916827-d5c7-4791-a201-4fa79732db9b`

Free-plan API-call limit:

```text
1000 calls/month
```

Results:

```text
999 : 200
1000 : 200
1001 : 402
```

The 1001st request returned:

```json
{
  "error": "quota_exceeded_upgrade_required",
  "message": "You've used 1000/1000 API calls this month. Upgrade to Pro to continue."
}
```

This demonstrates that the Free tenant can make 1000 API calls and that the 1001st call is rejected with HTTP 402 Payment Required.

---

## 3. Pro-Plan Quota Boundary

Pro test tenant:

`c89e0d9c-6ef3-4537-b03c-1831e3db212f`

The database was populated to exactly 49,999 API calls:

```text
INSERT 0 49999
```

Database verification:

```text
api_calls
---------
49999
```

The 50,000th API call succeeded:

```json
{
  "event": {
    "tenant_id": "c89e0d9c-6ef3-4537-b03c-1831e3db212f",
    "type": "api_call",
    "quantity": 1,
    "idempotency_key": "pro-boundary-50000"
  },
  "wasDuplicate": false
}
```

The next API call returned:

```text
HTTP/1.1 429 Too Many Requests
Content-Type: application/json; charset=utf-8
```

Response:

```json
{
  "error": "quota_exceeded",
  "message": "You've used 50000/50000 API calls this month."
}
```

This demonstrates correct Pro-tier quota enforcement.

---

## 4. Generate Endpoint Validation

The `/generate` endpoint was tested with invalid input.

### Missing Tenant ID / Idempotency Key

Request:

```text
POST /generate
Idempotency-Key: bv-1
Body: {}
```

Response:

```json
{
  "error": "tenantId and Idempotency-Key header are required"
}
```

### Invalid JSON

The endpoint was tested with malformed JSON and returned:

```json
{
  "error": "bad_request",
  "message": "Invalid JSON request body"
}
```

### Invalid Tenant UUID

An invalid tenant ID was rejected before querying PostgreSQL:

```json
{
  "error": "invalid tenantId",
  "message": "tenantId must be a valid UUID"
}
```

### Valid UUID but Nonexistent Tenant

A correctly formatted UUID that does not exist in the database returned:

```json
{
  "error": "tenant not found"
}
```

These tests demonstrate validation for required fields, malformed JSON, UUID format, and tenant existence.

---

## 5. Stripe Webhook Signature Verification

A forged webhook was sent with an invalid Stripe signature:

```text
curl.exe -X POST http://localhost:3000/webhooks/stripe `
  -H "Content-Type: application/json" `
  -H "Stripe-Signature: t=123,v1=fake" `
  -d '{"fake":"event"}'
```

The server rejected the request with:

```text
Webhook signature verification failed: No signatures found matching the expected signature for payload.
```

This demonstrates that Stripe webhook signature verification is enabled and invalid signatures are rejected.

---

## 6. Stripe Checkout and Pro Upgrade

A Stripe Checkout Session was created through:

```text
POST /checkout
```

The request used a tenant ID and returned a Stripe Checkout URL.

The checkout was completed successfully in Stripe Test Mode using a Stripe test card.

The browser displayed:

```text
Payment successful!

Your FlyRank Pro checkout was completed successfully.

You can close this page.
```

The Stripe CLI forwarded the webhook to:

```text
http://localhost:3000/webhooks/stripe
```

The Stripe CLI showed successful HTTP 200 responses, including:

```text
--> checkout.session.completed
<-- [200] POST http://localhost:3000/webhooks/stripe
```

The final database verification for the successfully upgraded tenant was:

```text
id                                    | name     | plan | stripe_customer_id | stripe_subscription_id
--------------------------------------+----------+------+--------------------+------------------------------
15247435-0fe5-48c7-9791-46ac6920fd13 | Acme Inc | pro  | cus_V9bfLnCYmFVqjD | sub_1U9ISYFqujTPnt3gBekO3LXY
```

This proves the:

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
Webhook verification
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

flow.

---

## 7. Stripe Subscription Cancellation and Downgrade

The Pro subscription was cancelled in Stripe Test Mode using:

```text
stripe subscriptions cancel sub_1U9ISYFqujTPnt3gBekO3LXY
```

Stripe returned the subscription with:

```text
status: "canceled"
```

The Stripe CLI webhook listener received:

```text
--> customer.subscription.deleted
<-- [200] POST http://localhost:3000/webhooks/stripe
```

The webhook handler changed the tenant plan from Pro back to Free.

This demonstrates automatic:

```text
Pro -> Free
```

plan synchronization when a Stripe subscription is deleted.

---

## 8. Stripe Webhook Deduplication

Stripe CLI delivered the same `checkout.session.completed` event multiple times.

Event ID:

```text
evt_1U9I2RFqujTPnt3gemzdTqXs
```

The application logged:

```text
[webhook] duplicate event ignored: evt_1U9I2RFqujTPnt3gemzdTqXs
```

The event ID is stored in:

```text
processed_webhook_events
```

The webhook handler checks whether the event ID has already been processed before applying the event.

This demonstrates idempotent Stripe webhook processing.

---

## 9. AI Token Metering and Pricing

Tenant:

`c89e0d9c-6ef3-4537-b03c-1831e3db212f`

An `ai_tokens` usage event was inserted with:

```text
quantity:             2000
input_tokens:         1000
cached_input_tokens:   500
output_tokens:         200
reasoning_tokens:      300
```

The database contained:

```text
type       | quantity | input_tokens | cached_input_tokens | output_tokens | reasoning_tokens
-----------+----------+--------------+---------------------+---------------+-----------------
ai_tokens  | 2000     | 1000         | 500                 | 200           | 300
```

Pricing calculation:

```text
Input:             1000 tokens
Cached input:       500 tokens
Output:             200 tokens
Reasoning:           300 tokens
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

The `/usage` endpoint reported:

```json
{
  "ai_token_cost": {
    "cents": 130,
    "dollars": "1.30"
  }
}
```

This confirms that the implemented token pricing matches the expected `$1.30`.

---

## 10. API-Call Cost Reporting

For the Free tenant:

```text
15247435-0fe5-48c7-9791-46ac6920fd13
```

The usage endpoint returned:

```json
{
  "plan": "free",
  "api_calls": {
    "used": 2,
    "limit": 1000,
    "cost_cents": 2,
    "cost_dollars": "0.02"
  },
  "ai_tokens": {
    "used": 0,
    "limit": 100000
  },
  "ai_token_cost": {
    "cents": 0,
    "dollars": "0.00"
  }
}
```

API-call pricing is:

```text
$0.01 per API call
```

Therefore:

```text
2 API calls × $0.01 = $0.02
```

This demonstrates that API usage is converted into a monthly monetary cost.

---

## 11. Usage Endpoint

For the Pro tenant:

```text
c89e0d9c-6ef3-4537-b03c-1831e3db212f
```

The request was:

```text
GET /usage/c89e0d9c-6ef3-4537-b03c-1831e3db212f
```

The endpoint returned:

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

The endpoint therefore reports:

- monthly API usage
- API-call quota
- monthly AI-token usage
- AI-token quota
- calculated AI-token cost

---

## 12. Tenant Data Isolation

Two different tenants were checked.

### Acme Inc

Tenant ID:

```text
15247435-0fe5-48c7-9791-46ac6920fd13
```

One API call was generated for Acme.

The resulting usage increased only for Acme.

### Pro Test Tenant

Tenant ID:

```text
c89e0d9c-6ef3-4537-b03c-1831e3db212f
```

Its usage remained:

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

The Acme request changed only Acme's usage while the Pro tenant remained at 50,000 API calls.

This demonstrates tenant-level usage isolation.

---

## 13. Stripe Raw-Body Handling

The Stripe webhook route is mounted before the application's normal JSON parser:

```text
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRoute);

app.use(express.json());
```

This allows the raw request body to be passed to:

```text
stripe.webhooks.constructEvent(...)
```

The successful Stripe CLI webhook delivery and forged-signature rejection demonstrate that Stripe webhook signature verification is functioning with the required raw request body.

---

## 14. Health Endpoint

The application successfully started with:

```text
Server running on http://localhost:3000
```

The health endpoint was tested with:

```text
GET /health
```

Response:

```json
{
  "ok": true
}
```

HTTP status:

```text
200 OK
```

---

## 15. Background Rollup Job

The scheduled background rollup job was started with the application.

The job queried all tenants, calculated monthly API-call usage and cost, and completed successfully:

```text
[rollup] tenant=Acme Inc api_calls=2 cost_cents=2
[rollup] tenant=Pro Test Tenant api_calls=50000 cost_cents=50000
[rollup] tenant=Quota Test Tenant api_calls=1000 cost_cents=1000
[rollup] succeeded on attempt 1, processed 3 tenants
```

This confirms that the rollup job can:

- connect to PostgreSQL
- process all three tenants
- calculate API usage
- calculate corresponding costs in cents
- complete successfully

---

## 16. Database Schema

The PostgreSQL database contains:

```text
tenants
usage_events
processed_webhook_events
```

The database was verified with:

```text
List of relations
Schema |           Name           | Type  | Owner
-------+--------------------------+-------+--------
public | processed_webhook_events | table | postgres
public | tenants                  | table | postgres
public | usage_events             | table | postgres
```

The `usage_events` table uses:

```text
UNIQUE (tenant_id, idempotency_key)
```

The `processed_webhook_events` table uses:

```text
stripe_event_id TEXT PRIMARY KEY
```

These constraints support request idempotency and webhook deduplication.

---

## 17. Final Tenant State

The database was verified with:

```text
SELECT id, name, plan FROM tenants ORDER BY name;
```

Result:

```text
id                                    | name                | plan
--------------------------------------+---------------------+------
15247435-0fe5-48c7-9791-46ac6920fd13 | Acme Inc            | pro
c89e0d9c-6ef3-4537-b03c-1831e3db212f | Pro Test Tenant     | pro
bb916827-d5c7-4791-a201-4fa79732db9b | Quota Test Tenant   | free
```

The final state confirms that Stripe checkout successfully upgraded Acme Inc to Pro while the other test tenants retained their expected plans.

---

## Summary

The completed system demonstrates:

- Database-backed usage metering
- Multi-tenant usage isolation
- Idempotency using a tenant-scoped unique key
- Free-plan quota enforcement
- Pro-plan quota enforcement
- HTTP 402 for Free-tier quota exhaustion
- HTTP 429 for Pro-tier quota exhaustion
- Stripe Checkout in Test Mode
- Stripe webhook signature verification
- Raw-body Stripe webhook handling
- Stripe webhook event deduplication
- Automatic Free → Pro upgrade
- Automatic Pro → Free downgrade
- AI-token metering
- Cached-input and reasoning-token pricing
- API-call cost reporting
- Monthly usage and cost reporting
- Tenant data isolation
- Request validation
- PostgreSQL persistence
- Background rollup processing
- Health monitoring
