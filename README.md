\# Metering \& Billing Service



\## What the system does



This project is a multi-tenant metering and billing service built with Node.js, Express, PostgreSQL, and Stripe test mode.



The system:



\- Tracks API usage per tenant.

\- Enforces monthly usage quotas.

\- Uses idempotency keys to prevent duplicate usage records.

\- Provides a usage endpoint.

\- Provides Stripe Checkout for upgrading a tenant to Pro.

\- Processes Stripe webhooks to update a tenant's subscription plan.

\- Verifies Stripe webhook signatures.

\- Deduplicates processed Stripe webhook events.



\## Plans



\### Free Plan



\- 1,000 API calls per month

\- 100,000 AI tokens per month



\### Pro Plan



\- 50,000 API calls per month

\- 5,000,000 AI tokens per month



\## Architecture



```text

&#x20;                   +-------------------+

&#x20;                   |      Client       |

&#x20;                   +---------+---------+

&#x20;                             |

&#x20;                             v

&#x20;                   +-------------------+

&#x20;                   |   Express Server  |

&#x20;                   +---------+---------+

&#x20;                             |

&#x20;             +---------------+---------------+

&#x20;             |               |               |

&#x20;             v               v               v

&#x20;       /generate         /usage/:id      /checkout

&#x20;             |                               |

&#x20;             v                               v

&#x20;      +-------------+                  +-----------+

&#x20;      | PostgreSQL  |                  |  Stripe   |

&#x20;      +-------------+                  +-----+-----+

&#x20;             ^                               |

&#x20;             |                               |

&#x20;             +---------- Webhook <-----------+









Database



The PostgreSQL database contains:



tenants

usage\_events

processed\_webhook\_events



The usage\_events table has a unique constraint on:



tenant\_id + idempotency\_key



This prevents the same request from being counted more than once.



Setup

1\. Start PostgreSQL

docker compose up -d

2\. Install dependencies

npm install

3\. Configure environment variables



Create a .env file containing:



DATABASE\_URL=postgres://postgres:postgres@localhost:5432/billing

STRIPE\_SECRET\_KEY=your\_stripe\_test\_secret\_key

STRIPE\_WEBHOOK\_SECRET=your\_stripe\_webhook\_secret

PORT=3000

4\. Start the server

npm run dev



The server runs at:



http://localhost:3000



Health check:



GET /health

API Endpoints

Generate

POST /generate



Records one API call for a tenant.



Requires an Idempotency-Key header.



Usage

GET /usage/:tenantId



Returns the tenant's monthly API-call and AI-token usage.



Checkout

POST /checkout



Creates a Stripe Checkout Session for upgrading a tenant to Pro.



Stripe Webhook

POST /webhooks/stripe



Processes Stripe subscription events and updates the tenant's plan.



Idempotency



Usage requests require an idempotency key.



If the same tenant sends the same idempotency key again, the existing usage event is returned instead of creating another usage event.



The database unique constraint provides an additional safety mechanism for concurrent requests.



Quotas



Monthly API-call usage is calculated from the usage\_events table.



For the Free plan, the API-call limit is 1,000 calls per month.



During testing:



API call 1000 returned HTTP 200.

API call 1001 returned HTTP 402 with quota\_exceeded\_upgrade\_required.

Stripe Test Mode



Stripe is used in test/sandbox mode for this project.



The Stripe CLI can forward webhook events to the local server:



stripe listen --forward-to localhost:3000/webhooks/stripe



Stripe Checkout was tested successfully and the tenant was upgraded from free to pro.



Stripe Webhook Security



Stripe webhook signatures are verified using the STRIPE\_WEBHOOK\_SECRET environment variable.



A forged webhook using:



Stripe-Signature: t=123,v1=fake



was rejected with HTTP 400 and a webhook signature verification error.



Testing



The project was tested with:



PostgreSQL running through Docker.

Express server running locally.

API usage and quota tests.

Idempotency tests.

Stripe CLI webhook forwarding.

Stripe Checkout in test mode.

Forged webhook signature rejection.

Limitations



This project does not implement proration, invoicing, refunds, taxes, production payment processing, or other advanced billing functionality.



Stripe is configured for test/sandbox mode only.





\### 3. Save it



Press:



\*\*Ctrl + S\*\*



Then close Notepad.



\### 4. Verify the file isn't empty



Run:



```powershell

(Get-Item .\\README.md).Length



You should see a number greater than 0, probably several thousand bytes.



Then run:



dir README.md



You should see its size listed.

