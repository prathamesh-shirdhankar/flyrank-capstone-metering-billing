// Prices are per-1000-tokens, in cents. Pin these constants and reference
// them in EVIDENCE.md with a worked example.
const PRICING = {
  input_per_1k: 0.5,          // regular input tokens
  cached_input_per_1k: 0.1,   // cached input — cheaper
  output_per_1k: 1.5,         // output tokens
  // reasoning tokens are billed at the OUTPUT rate, not a separate rate
};

function calculateTokenCostCents({ input = 0, cachedInput = 0, output = 0, reasoning = 0 }) {
  const outputTotal = output + reasoning; // reasoning counts as output — do not add a third bucket
  const cost =
    (input / 1000) * PRICING.input_per_1k +
    (cachedInput / 1000) * PRICING.cached_input_per_1k +
    (outputTotal / 1000) * PRICING.output_per_1k;
  return Math.round(cost * 100); // cents, always integer, never a float in storage
}

module.exports = { calculateTokenCostCents, PRICING };