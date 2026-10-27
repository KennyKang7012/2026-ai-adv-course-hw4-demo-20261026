// Coupon rules live here so the checkout route stays free of pricing details.
const COUPONS = Object.freeze({
  FLOWER100: Object.freeze({ type: 'fixed', amount: 100, minSubtotal: 800 }),
  SPRING10: Object.freeze({ type: 'percentage', percentOff: 10, maxDiscount: 300, minSubtotal: 0 }),
  SUMMER50: Object.freeze({ type: 'expired' })
});

class CouponError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CouponError';
    this.code = 'INVALID_COUPON';
  }
}

/**
 * Normalize a raw coupon code. Returns null when no code was supplied.
 * Throws CouponError for non-string input so callers can answer 400.
 */
function normalizeCouponCode(code) {
  if (code === undefined || code === null || code === '') return null;
  if (typeof code !== 'string') {
    throw new CouponError('優惠碼格式不正確');
  }

  const normalized = code.trim().toUpperCase();
  return normalized === '' ? null : normalized;
}

/**
 * Resolve a coupon against the cart subtotal.
 * Returns { couponCode, discount }; couponCode is null and discount 0 when unused.
 * Throws CouponError when the code is unknown, expired, or below its threshold.
 */
function calculateDiscount(rawCode, subtotal) {
  const couponCode = normalizeCouponCode(rawCode);
  if (couponCode === null) {
    return { couponCode: null, discount: 0 };
  }

  if (!Object.prototype.hasOwnProperty.call(COUPONS, couponCode)) {
    throw new CouponError('優惠碼不存在');
  }

  const rule = COUPONS[couponCode];

  if (rule.type === 'expired') {
    throw new CouponError('優惠碼已失效');
  }

  if (subtotal < rule.minSubtotal) {
    throw new CouponError(`優惠碼需商品小計滿 ${rule.minSubtotal} 元`);
  }

  const rawDiscount = rule.type === 'fixed'
    ? rule.amount
    : Math.round(subtotal * rule.percentOff / 100);

  const discount = Math.min(rawDiscount, rule.maxDiscount ?? rawDiscount, subtotal);

  return { couponCode, discount };
}

module.exports = {
  COUPONS,
  CouponError,
  normalizeCouponCode,
  calculateDiscount
};
