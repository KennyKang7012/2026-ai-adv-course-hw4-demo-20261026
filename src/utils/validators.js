// Shared input validators for request bodies

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isOptionalString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

/**
 * Parse a positive integer from a number or an integer string.
 * Returns null for anything else ("3abc", 1.9, [5], 0, -1) and for values
 * outside the safe-integer range, which SQLite cannot bind as LIMIT/OFFSET.
 */
function parsePositiveInteger(value) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

module.exports = {
  isNonEmptyString,
  isOptionalString,
  parsePositiveInteger
};
