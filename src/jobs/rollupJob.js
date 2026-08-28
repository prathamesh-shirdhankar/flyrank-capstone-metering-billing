const { pool } = require('../db');
const { getMonthlyUsage } = require('../services/quotaService');
const { calculateApiCallCostCents } = require('../services/costService');

async function runRollupOnce() {
  const { rows: tenants } = await pool.query(
    'SELECT id, name FROM tenants'
  );

  for (const tenant of tenants) {
    const apiUsed = await getMonthlyUsage(
      pool,
      tenant.id,
      'api_call'
    );

    const costCents = calculateApiCallCostCents(apiUsed);

    console.log(
      `[rollup] tenant=${tenant.name} api_calls=${apiUsed} cost_cents=${costCents}`
    );
  }

  return tenants.length;
}

async function runRollupWithRetries(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const count = await runRollupOnce();

      console.log(
        `[rollup] succeeded on attempt ${attempt}, processed ${count} tenants`
      );

      return;
    } catch (err) {
      console.error(
        `[rollup] attempt ${attempt} failed:`,
        err
      );

      if (attempt === maxAttempts) {
        console.error(
          `[ALERT] rollup job failed after ${maxAttempts} attempts:`,
          err
        );
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * attempt)
        );
      }
    }
  }
}

function startRollupSchedule(
  intervalMs = 24 * 60 * 60 * 1000
) {
  runRollupWithRetries();

  setInterval(runRollupWithRetries, intervalMs);
}

module.exports = {
  runRollupOnce,
  runRollupWithRetries,
  startRollupSchedule,
};