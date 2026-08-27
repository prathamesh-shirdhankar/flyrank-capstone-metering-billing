const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { pool } = require('../db');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// IMPORTANT: this route needs the RAW body, not JSON-parsed —
// that's why express.raw() is applied only here, in server.js.
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  // Deduplicate: has this event ID been processed before?
  const already = await pool.query(
    'SELECT 1 FROM processed_webhook_events WHERE stripe_event_id = $1',
    [event.id]
  );
  if (already.rows.length > 0) {
    return res.status(200).json({ received: true, duplicate: true });
  }
  await pool.query('INSERT INTO processed_webhook_events (stripe_event_id) VALUES ($1)', [event.id]);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await pool.query(
        `UPDATE tenants SET plan = 'pro', stripe_customer_id = $1, stripe_subscription_id = $2 WHERE id = $3`,
        [session.customer, session.subscription, session.client_reference_id]
      );
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await pool.query(`UPDATE tenants SET plan = 'free' WHERE stripe_subscription_id = $1`, [sub.id]);
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const plan = sub.status === 'active' ? 'pro' : 'free';
      await pool.query(`UPDATE tenants SET plan = $1 WHERE stripe_subscription_id = $2`, [plan, sub.id]);
      break;
    }
  }

  res.status(200).json({ received: true });
});

module.exports = router;