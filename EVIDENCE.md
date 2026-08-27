# Evidence

## 1. Idempotent metering

Tenant ID:

`15247435-0fe5-48c7-9791-46ac6920fd13`

The same `POST /generate` request was sent twice using:

`Idempotency-Key: test-key-1`

First request returned:

```text
wasDuplicate: false
```

Second identical request returned:

```text
wasDuplicate: true
```

This demonstrates that the same tenant and idempotency key do not create a second usage event.

The database also enforces a unique constraint on:

```text
(tenant_id, idempotency_key)
```

---

## 2. Free-plan quota boundary (402)

Quota-test tenant:

`bb916827-d5c7-4791-a201-4fa79732db9b`

Free-plan API-call limit:

`1000 calls/month`

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

This demonstrates that the free tenant can make 1000 API calls and that the 1001st call is rejected with HTTP 402.

---

## 3. Pro-plan quota boundary (429)

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

The next API call returned HTTP 429:

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

## 4. Forged Stripe webhook rejected

A forged webhook was sent with an invalid Stripe signature:

```text
curl.exe -X POST http://localhost:3000/webhooks/stripe `
  -H "Content-Type: application/json" `
  -H "Stripe-Signature: t=123,v1=fake" `
  -d '{"fake":"event"}'
```

The server rejected the request:

```text
Webhook signature verification failed: No signatures found matching the expected signature for payload.
```

This demonstrates that Stripe webhook signature verification is enabled and invalid signatures are rejected.

---

## 5. Stripe Checkout and Pro upgrade

A Checkout Session was created for tenant:

`bb916827-d5c7-4791-a201-4fa79732db9b`

The checkout was completed successfully in Stripe test mode.

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

The webhook listener showed successful HTTP 200 responses, including:

```text
<-- [200] POST http://localhost:3000/webhooks/stripe
```

Database verification after checkout:

```text
id                                    | name               | plan | stripe_customer_id | stripe_subscription_id
--------------------------------------+--------------------+------+--------------------+------------------------------
bb916827-d5c7-4791-a201-4fa79732db9b | Quota Test Tenant  | pro  | cus_V9QR3IJmTXMTZA  | sub_1U97aXFqujTPnt3gcCKJjk2p
```

This proves the Stripe Checkout → `checkout.session.completed` webhook → tenant upgrade flow.

---

## 6. Stripe subscription cancellation and downgrade

The Pro subscription was cancelled in Stripe test mode using:

```text
stripe subscriptions cancel sub_1U97aXFqujTPnt3gcCKJjk2p
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

Database verification afterward:

```text
id                                    | name               | plan | stripe_customer_id | stripe_subscription_id
--------------------------------------+--------------------+------+--------------------+------------------------------
bb916827-d5c7-4791-a201-4fa79732db9b | Quota Test Tenant  | free | cus_V9QR3IJmTXMTZA  | sub_1U97aXFqujTPnt3gcCKJjk2p
```

This proves that the `customer.subscription.deleted` webhook changes the tenant from Pro back to Free.

---

## 7. AI token metering and pricing

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

The `/usage` endpoint returned:

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

This confirms that the implemented token pricing matches the expected `$1.30`.

---

## 8. Usage endpoint reports monthly usage and cost

For the Pro tenant:

```text
curl.exe http://localhost:3000/usage/c89e0d9c-6ef3-4537-b03c-1831e3db212f
```

Response:

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

The endpoint therefore reports API usage, AI-token usage, quota limits, and calculated token cost for the tenant.

---

## 9. Tenant data isolation

Two different tenants were checked:

### Acme Inc.

Tenant ID:

`15247435-0fe5-48c7-9791-46ac6920fd13`

Usage before the isolation test:

```json
{
  "plan": "free",
  "api_calls": {
    "used": 1,
    "limit": 1000
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

One API call was then generated for Acme.

The resulting usage was:

```json
{
  "plan": "free",
  "api_calls": {
    "used": 2,
    "limit": 1000
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

### Pro Test Tenant

Tenant ID:

`c89e0d9c-6ef3-4537-b03c-1831e3db212f`

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

The Acme request increased only Acme's usage from 1 to 2 while the Pro tenant remained at 50,000 API calls.

This demonstrates tenant-level usage isolation.

---

## 10. Stripe webhook raw-body handling

The Stripe webhook route is mounted before `express.json()`:

```text
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRoute);

app.use(express.json());
```

This allows Stripe's raw request body to be passed to:

```text
stripe.webhooks.constructEvent(...)
```

The forged-signature test and successful Stripe CLI webhook delivery both confirm that raw-body signature verification is functioning.

---

## 11. Health endpoint

The application exposes:

```text
GET /health
```

The server starts successfully with:

```text
Server running on http://localhost:3000
```

---

## Summary

The completed system demonstrates:

- Database-backed usage metering
- Idempotency using a tenant-scoped unique key
- Free and Pro quota enforcement
- HTTP 402 for Free-tier quota exhaustion
- HTTP 429 for Pro-tier quota exhaustion
- Stripe Checkout in test mode
- Stripe webhook signature verification
- Webhook event deduplication
- Automatic Free → Pro upgrade
- Automatic Pro → Free downgrade
- AI token metering
- Cached-input and reasoning-token pricing
- Monthly usage and cost reporting
- Tenant data isolation
