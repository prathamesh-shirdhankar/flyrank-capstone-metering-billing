const PLAN_LIMITS = {
  free: { api_call: 1000, ai_tokens: 100000 },
  pro:  { api_call: 50000, ai_tokens: 5000000 }, // pick your own Pro numbers, document them in README
};

async function getMonthlyUsage(pool, tenantId, type) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(quantity), 0) AS total
     FROM usage_events
     WHERE tenant_id = $1 AND type = $2
       AND created_at >= date_trunc('month', now())`,
    [tenantId, type]
  );
  return parseInt(rows[0].total, 10);
}

async function checkQuota(pool, tenantId, plan, type, requestedQty) {
  const limit = PLAN_LIMITS[plan][type];
  const used = await getMonthlyUsage(pool, tenantId, type);
  const wouldBe = used + requestedQty;
  return {
    allowed: wouldBe <= limit,
    used,
    limit,
    wouldBe,
  };
}

module.exports = { checkQuota, getMonthlyUsage, PLAN_LIMITS };