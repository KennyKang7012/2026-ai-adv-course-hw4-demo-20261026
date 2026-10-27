const {
  CouponError,
  normalizeCouponCode,
  calculateDiscount
} = require('../src/utils/coupon');

describe('Coupon module', () => {
  describe('normalizeCouponCode', () => {
    it('未提供優惠碼時回傳 null', () => {
      expect(normalizeCouponCode(undefined)).toBeNull();
      expect(normalizeCouponCode(null)).toBeNull();
      expect(normalizeCouponCode('')).toBeNull();
      expect(normalizeCouponCode('   ')).toBeNull();
    });

    it('去除前後空白並轉為大寫', () => {
      expect(normalizeCouponCode(' flower100 ')).toBe('FLOWER100');
    });

    it('非字串視為格式錯誤', () => {
      expect(() => normalizeCouponCode(123)).toThrow(CouponError);
    });
  });

  describe('calculateDiscount', () => {
    it('未使用優惠碼時折扣為 0', () => {
      expect(calculateDiscount(undefined, 800)).toEqual({ couponCode: null, discount: 0 });
    });

    it('FLOWER100：小計 800 元折 100 元', () => {
      expect(calculateDiscount('FLOWER100', 800)).toEqual({
        couponCode: 'FLOWER100',
        discount: 100
      });
    });

    it('FLOWER100：小計 799 元未達門檻', () => {
      expect(() => calculateDiscount('FLOWER100', 799)).toThrow('優惠碼需商品小計滿 800 元');
    });

    it.each([
      [1000, 100],
      [1234, 123],
      [1235, 124],
      [3500, 300]
    ])('SPRING10：小計 %i 元折 %i 元（四捨五入、上限 300）', (subtotal, discount) => {
      expect(calculateDiscount('SPRING10', subtotal).discount).toBe(discount);
    });

    it('SPRING10 無門檻，極小金額也可使用', () => {
      expect(calculateDiscount('SPRING10', 1).discount).toBe(0);
    });

    it('SUMMER50 已失效', () => {
      expect(() => calculateDiscount('SUMMER50', 1000)).toThrow('優惠碼已失效');
    });

    it('未知優惠碼視為無效', () => {
      expect(() => calculateDiscount('NOT-A-COUPON', 1000)).toThrow('優惠碼不存在');
    });

    it('優惠碼不分大小寫', () => {
      expect(calculateDiscount('flower100', 800).couponCode).toBe('FLOWER100');
    });
  });
});
