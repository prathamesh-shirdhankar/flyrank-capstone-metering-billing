const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { getMonthlyUsage, PLAN_LIMITS } = require('../services/quotaService');

router.get('/usage/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const tenantRes = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  const tenant = tenantRes.rows[0];
  if (!tenant) return res.status(404).json({ error: 'tenant not found' });

  const apiUsed = await getMonthlyUsage(pool, tenantId, 'api_call');
  const tokensUsed = await getMonthlyUsage(pool, tenantId, 'ai_tokens');

  res.json({
    plan: tenant.plan,
    api_calls: { used: apiUsed, limit: PLAN_LIMITS[tenant.plan].api_call },
    ai_tokens: { used: tokensUsed, limit: PLAN_LIMITS[tenant.plan].ai_tokens },
  });
});

module.exports = router;