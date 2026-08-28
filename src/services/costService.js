// Prices are per-1000-tokens, in cents.
const PRICING = {
  input_per_1k: 0.5,
  cached_input_per_1k: 0.1,
  output_per_1k: 1.5,
  // reasoning tokens are billed at the OUTPUT rate
};

// API calls are billed at $0.01 per call.
const API_CALL_PRICE_CENTS = 1;

function calculateApiCallCostCents(callCount) {
  return callCount * API_CALL_PRICE_CENTS;
}

function calculateTokenCostCents({
  input = 0,
  cachedInput = 0,
  output = 0,
  reasoning = 0,
}) {
  const outputTotal = output + reasoning;

  const cost =
    (input / 1000) * PRICING.input_per_1k +
    (cachedInput / 1000) * PRICING.cached_input_per_1k +
    (outputTotal / 1000) * PRICING.output_per_1k;

  return Math.round(cost * 100);
}

module.exports = {
  calculateTokenCostCents,
  calculateApiCallCostCents,
  PRICING,
  API_CALL_PRICE_CENTS,
};