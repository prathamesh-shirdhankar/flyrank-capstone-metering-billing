\# Build Log



\- Set up PostgreSQL 16 using Docker Compose.

\- Created the tenants, usage\_events, and processed\_webhook\_events tables.

\- Implemented monthly API-call quotas and usage tracking.

\- Implemented idempotent usage recording using a unique tenant\_id + idempotency\_key constraint.

\- Tested the quota boundary with a free tenant. The 1000th API call succeeded and the 1001st returned HTTP 402.

\- Installed and authenticated the Stripe CLI in Stripe test mode.

\- Configured Stripe webhook forwarding to the local Express server.

\- Fixed the Stripe raw-body middleware ordering so webhook signature verification works.

\- Tested a forged webhook and confirmed that signature verification rejects it.

\- Added a Stripe Checkout route using client\_reference\_id to associate the checkout with a tenant.

\- Successfully completed a Stripe test-mode checkout and confirmed the tenant changed from free to pro.

