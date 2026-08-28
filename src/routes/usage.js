const express = require('express');

const router = express.Router();

const { pool } = require('../db');
const { getMonthlyUsage, PLAN_LIMITS } = require('../services/quotaService');
const {
  calculateTokenCostCents,
  calculateApiCallCostCents,
} = require('../services/costService');

router.get('/usage/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenantRes = await pool.query(
      'SELECT * FROM tenants WHERE id = $1',
      [tenantId]
    );

    const tenant = tenantRes.rows[0];

    if (!tenant) {
      return res.status(404).json({ error: 'tenant not found' });
    }

    const apiUsed = await getMonthlyUsage(pool, tenantId, 'api_call');
    const tokensUsed = await getMonthlyUsage(pool, tenantId, 'ai_tokens');

    const apiCallCostCents = calculateApiCallCostCents(apiUsed);

    const tokenRes = await pool.query(
      `SELECT
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens
       FROM usage_events
       WHERE tenant_id = $1
         AND type = 'ai_tokens'
         AND created_at >= date_trunc('month', now())`,
      [tenantId]
    );

    const tokenUsage = tokenRes.rows[0];

    const tokenCostCents = calculateTokenCostCents({
      input: parseInt(tokenUsage.input_tokens, 10),
      cachedInput: parseInt(tokenUsage.cached_input_tokens, 10),
      output: parseInt(tokenUsage.output_tokens, 10),
      reasoning: parseInt(tokenUsage.reasoning_tokens, 10),
    });

    res.json({
      plan: tenant.plan,

      api_calls: {
        used: apiUsed,
        limit: PLAN_LIMITS[tenant.plan].api_call,
        cost_cents: apiCallCostCents,
        cost_dollars: (apiCallCostCents / 100).toFixed(2),
      },

      ai_tokens: {
        used: tokensUsed,
        limit: PLAN_LIMITS[tenant.plan].ai_tokens,
      },

      ai_token_cost: {
        cents: tokenCostCents,
        dollars: (tokenCostCents / 100).toFixed(2),
      },
    });
  } catch (err) {
    console.error('Usage error:', err);

    res.status(500).json({
      error: 'failed_to_get_usage',
      message: err.message,
    });
  }
});

module.exports = router;