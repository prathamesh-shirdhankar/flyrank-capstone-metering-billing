const express = require('express');
require('dotenv').config();

const generateRoute = require('./routes/generate');
const usageRoute = require('./routes/usage');
const webhookRoute = require('./routes/webhooks');
const checkoutRoute = require('./routes/checkout');

const app = express();

// Stripe webhooks need the raw body.
// This MUST come before express.json().
app.use(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  webhookRoute
);

// Normal JSON requests
app.use(express.json());

// Application routes
app.use(generateRoute);
app.use(usageRoute);
app.use(checkoutRoute);

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});