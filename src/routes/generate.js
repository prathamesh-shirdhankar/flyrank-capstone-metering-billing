const express = require('express');

const router = express.Router();

const { pool } = require('../db');
const { checkQuota } = require('../services/quotaService');
const { recordUsage } = require('../services/meterService');

router.post('/generate', async (req, res) => {
  try {
    const { tenantId } = req.body;
    const idempotencyKey = req.header('Idempotency-Key');

    if (!tenantId || !idempotencyKey) {
      return res.status(400).json({
        error: 'tenantId and Idempotency-Key header are required',
      });
    }

    // Validate UUID before sending tenantId to PostgreSQL.
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(tenantId)) {
      return res.status(400).json({
        error: 'invalid tenantId',
        message: 'tenantId must be a valid UUID',
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

    // Simulated token usage for this "generation"
    const requestedQty = 1;

    const quota = await checkQuota(
      pool,
      tenant.id,
      tenant.plan,
      'api_call',
      requestedQty
    );

    if (!quota.allowed) {
      if (tenant.plan === 'free') {
        return res.status(402).json({
          error: 'quota_exceeded_upgrade_required',
          message: `You've used ${quota.used}/${quota.limit} API calls this month. Upgrade to Pro to continue.`,
        });
      }

      return res.status(429).json({
        error: 'quota_exceeded',
        message: `You've used ${quota.used}/${quota.limit} API calls this month.`,
      });
    }

    const { event, wasDuplicate } = await recordUsage(pool, {
      tenantId: tenant.id,
      type: 'api_call',
      quantity: requestedQty,
      idempotencyKey,
    });

    return res.status(200).json({
      event,
      wasDuplicate,
    });
  } catch (err) {
    console.error('Request error:', err);

    return res.status(500).json({
      error: 'internal_server_error',
    });
  }
});

module.exports = router;