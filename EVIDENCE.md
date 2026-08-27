# Evidence

## Probe 1 — Idempotency

Tenant ID:

`15247435-0fe5-48c7-9791-46ac6920fd13`

The same POST `/generate` request was sent twice using:

`Idempotency-Key: test-key-1`

First request:

```text
wasDuplicate: false
```

Second identical request:

wasDuplicate: true

This demonstrates that the same tenant and idempotency key do not create a second usage event.

The database also enforces:

UNIQUE (tenant_id, idempotency_key)
Probe 2 — Free-plan quota boundary

Quota-test tenant:

bb916827-d5c7-4791-a201-4fa79732db9b

Free plan API-call limit:

1000 calls/month

Results:

999 : 200
1000 : 200
1001 : 402

The 1001st request returned:

{
"error": "quota_exceeded_upgrade_required",
"message": "You've used 1000/1000 API calls this month. Upgrade to Pro to continue."
}

Usage endpoint after the test:

{
"plan": "free",
"api_calls": {
"used": 1000,
"limit": 1000
},
"ai_tokens": {
"used": 0,
"limit": 100000
}
}

This demonstrates that the free tenant can make 1000 API calls and that the 1001st call is rejected.

Excellent. ✅ **That is exactly what we wanted.**

Your database now shows:

```text
Quota Test Tenant | pro | cus_... | sub_...
```

So your complete Stripe upgrade flow is working:

```text
POST /checkout
      ↓
Stripe Test Checkout
      ↓
Payment completed
      ↓
checkout.session.completed webhook
      ↓
Stripe signature verified
      ↓
Tenant found using client_reference_id
      ↓
Database updated
      ↓
free → pro
```

## Stripe Checkout and Webhook Evidence

### Successful Checkout

A test Stripe Checkout Session was created using:

- Tenant ID: `bb916827-d5c7-4791-a201-4fa79732db9b`
- Stripe Checkout Session: `cs_test_...`
- Stripe Test Mode: Yes

The browser successfully redirected to:

`http://localhost:3000/checkout/success`

The success page displayed:

> Payment successful!
> Your FlyRank Pro checkout was completed successfully.

### Stripe Webhook

The Stripe CLI forwarded the webhook to:

`http://localhost:3000/webhooks/stripe`

The `checkout.session.completed` event was successfully received with HTTP status `200`.

### Database Verification

After completing the test checkout, PostgreSQL showed:

```text
id                  | name               | plan | stripe_customer_id | stripe_subscription_id
--------------------+--------------------+------+--------------------+-----------------------
bb916827-d5c7-4791-a201-4fa79732db9b | Quota Test Tenant | pro | cus_... | sub_...
```

The tenant plan changed from `free` to `pro`.

### Forged Webhook Test

A request using a fake Stripe signature was rejected:

```text
Webhook signature verification failed:
No signatures found matching the expected signature for payload.
```

This demonstrates that Stripe webhook signature verification is enabled.

```

**Don't put your actual Stripe secret key or webhook secret into `EVIDENCE.md`.**

After saving that, **Part 10 is essentially complete**.
```

# Evidence

## Idempotent metering

First request:

[paste your first successful /generate output here]

Second identical request:

[paste the second output showing "wasDuplicate": true here]

## Quota boundary (402)

The quota test reached:

1000 : 200

1001 : 402 {"error":"quota_exceeded_upgrade_required","message":"You've used 1000/1000 API calls this month. Upgrade to Pro to continue."}

## Forged webhook rejected

Command:

curl.exe -X POST http://localhost:3000/webhooks/stripe `  -H "Content-Type: application/json"`
-H "Stripe-Signature: t=123,v1=fake" `
-d '{"fake":"event"}'

Result:

Webhook signature verification failed: No signatures found matching the expected signature for payload.

## Stripe webhook

Stripe CLI successfully forwarded checkout.session.completed and received HTTP 200.

## Stripe checkout

Checkout session was successfully created and completed in Stripe test mode.

Tenant was upgraded from free to pro.

## Token pricing worked example

Input: 1000 tokens
Cached input: 500
Output: 200
Reasoning: 300

Expected:

(1000/1000*0.5) + (500/1000*0.1) + (500/1000\*1.5)
= 0.5 + 0.05 + 0.75
= 1.30
= 130 cents

Actual:
[add actual token-pricing test output here]
