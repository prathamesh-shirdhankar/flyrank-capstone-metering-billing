const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { pool } = require('../db');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  // 1. Verify Stripe webhook signature using the RAW request body.
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[webhook] signature verification failed:', err.message);

    return res.status(400).send(
      `Webhook signature verification failed: ${err.message}`
    );
  }

  console.log(`[webhook] received ${event.type}: ${event.id}`);

  // 2. Check whether this Stripe event was already processed.
  const already = await pool.query(
    'SELECT 1 FROM processed_webhook_events WHERE stripe_event_id = $1',
    [event.id]
  );

  if (already.rows.length > 0) {
    console.log(`[webhook] duplicate event ignored: ${event.id}`);

    return res.status(200).json({
      received: true,
      duplicate: true
    });
  }

  try {
    // 3. Process the event.
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

        console.log('[webhook] checkout.session.completed');
        console.log('[webhook] tenant:', session.client_reference_id);
        console.log('[webhook] customer:', session.customer);
        console.log('[webhook] subscription:', session.subscription);

        if (!session.client_reference_id) {
          console.error(
            '[webhook] ERROR: checkout session has no client_reference_id'
          );

          return res.status(400).json({
            error: 'missing_client_reference_id'
          });
        }

        const updateResult = await pool.query(
          `UPDATE tenants
           SET plan = 'pro',
               stripe_customer_id = $1,
               stripe_subscription_id = $2
           WHERE id = $3`,
          [
            session.customer,
            session.subscription,
            session.client_reference_id
          ]
        );

        console.log(
          `[webhook] tenant rows updated: ${updateResult.rowCount}`
        );

        if (updateResult.rowCount === 0) {
          console.error(
            `[webhook] ERROR: tenant not found: ${session.client_reference_id}`
          );

          return res.status(404).json({
            error: 'tenant_not_found'
          });
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;

        console.log(
          `[webhook] subscription deleted: ${sub.id}`
        );

        await pool.query(
          `UPDATE tenants
           SET plan = 'free'
           WHERE stripe_subscription_id = $1`,
          [sub.id]
        );

        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;

        const plan =
          sub.status === 'active' ? 'pro' : 'free';

        console.log(
          `[webhook] subscription ${sub.id} status=${sub.status} plan=${plan}`
        );

        await pool.query(
          `UPDATE tenants
           SET plan = $1
           WHERE stripe_subscription_id = $2`,
          [plan, sub.id]
        );

        break;
      }

      default:
        console.log(
          `[webhook] event type ignored: ${event.type}`
        );
    }

    // 4. Only mark the event processed AFTER successful handling.
    await pool.query(
      `INSERT INTO processed_webhook_events (stripe_event_id)
       VALUES ($1)
       ON CONFLICT (stripe_event_id) DO NOTHING`,
      [event.id]
    );

    console.log(`[webhook] processed successfully: ${event.id}`);

    return res.status(200).json({
      received: true
    });

  } catch (err) {
    console.error(
      `[webhook] processing error for ${event.id}:`,
      err
    );

    return res.status(500).json({
      error: 'webhook_processing_failed',
      message: err.message
    });
  }
});

module.exports = router;