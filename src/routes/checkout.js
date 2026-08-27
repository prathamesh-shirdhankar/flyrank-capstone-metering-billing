const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { pool } = require('../db');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create Stripe Checkout Session
router.post('/checkout', async (req, res) => {
  try {
    const { tenantId } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        error: 'tenantId is required',
      });
    }

    const tenantRes = await pool.query(
      'SELECT * FROM tenants WHERE id = $1',
      [tenantId]
    );

    const tenant = tenantRes.rows[0];

    if (!tenant) {
      return res.status(404).json({
        error: 'tenant not found',
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',

      line_items: [
        {
          price_data: {
            currency: 'usd',

            product_data: {
              name: 'FlyRank Pro',
            },

            unit_amount: 2000,

            recurring: {
              interval: 'month',
            },
          },

          quantity: 1,
        },
      ],

      // This lets the webhook know which tenant purchased Pro
      client_reference_id: tenant.id,

      success_url: 'http://localhost:3000/checkout/success',
      cancel_url: 'http://localhost:3000/checkout/cancel',
    });

    res.json({
      checkout_url: session.url,
      session_id: session.id,
    });

  } catch (err) {
    console.error('Checkout error:', err);

    res.status(500).json({
      error: 'failed_to_create_checkout_session',
      message: err.message,
    });
  }
});

// Stripe redirects here after successful checkout
router.get('/checkout/success', (req, res) => {
  res.send(`
    <h1>Payment successful!</h1>
    <p>Your FlyRank Pro checkout was completed successfully.</p>
    <p>You can close this page.</p>
  `);
});

// Stripe redirects here if checkout is cancelled
router.get('/checkout/cancel', (req, res) => {
  res.send(`
    <h1>Checkout cancelled</h1>
    <p>No payment was completed.</p>
    <p>You can close this page.</p>
  `);
});

module.exports = router;