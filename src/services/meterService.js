async function recordUsage(pool, { tenantId, type, quantity, idempotencyKey, tokenBreakdown = {} }) {
  // Step 1: has this exact request already been recorded?
  const existing = await pool.query(
    `SELECT * FROM usage_events WHERE tenant_id = $1 AND idempotency_key = $2`,
    [tenantId, idempotencyKey]
  );
  if (existing.rows.length > 0) {
    return { event: existing.rows[0], wasDuplicate: true };
  }

  // Step 2: insert. The UNIQUE constraint is our safety net if two requests
  // race each other at the exact same millisecond.
  try {
    const { rows } = await pool.query(
      `INSERT INTO usage_events
        (tenant_id, type, quantity, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        tenantId, type, quantity,
        tokenBreakdown.input || 0,
        tokenBreakdown.cachedInput || 0,
        tokenBreakdown.output || 0,
        tokenBreakdown.reasoning || 0,
        idempotencyKey,
      ]
    );
    return { event: rows[0], wasDuplicate: false };
  } catch (err) {
    if (err.code === '23505') { // unique_violation — a race condition beat us to it
      const { rows } = await pool.query(
        `SELECT * FROM usage_events WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, idempotencyKey]
      );
      return { event: rows[0], wasDuplicate: true };
    }
    throw err;
  }
}

module.exports = { recordUsage };