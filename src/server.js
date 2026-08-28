const express = require('express');
require('dotenv').config();

const generateRoute = require('./routes/generate');
const usageRoute = require('./routes/usage');
const webhookRoute = require('./routes/webhooks');
const checkoutRoute = require('./routes/checkout');
const { startRollupSchedule } = require('./jobs/rollupJob');

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

// Handle malformed JSON and other request errors.
app.use((err, req, res, next) => {
  console.error('Request error:', err.message);

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Invalid JSON request body',
    });
  }

  res.status(500).json({
    error: 'internal_server_error',
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

startRollupSchedule();