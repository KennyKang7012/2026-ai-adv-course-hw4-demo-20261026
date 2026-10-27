# Issue #1 結帳優惠碼 — 開發計畫

- Issue：`#1 結帳優惠碼`
- 分支：`issue-1-結帳優惠碼`
- PR：`#2`
- 狀態：已合併（PR #2，merge commit `6381b1f`）
- 文件撰寫時間：2026-10-28

> 流程說明：本文件是在實作完成後補寫，並非開發前的計畫。專案規範要求功能開發先在 `docs/plans/` 留下計畫，本次遺漏，事後補正。驗收條件取自 Issue #1 原文，未自行增減。

## 1. 目標

結帳時可選擇性輸入優惠碼折抵商品小計，折扣規則集中在 `src/utils/` 的 Coupon 模組，比照既有的 Shipping 模組以純函式實作。訂單需保存使用的優惠碼與折扣金額快照。

## 2. 範圍

### 納入

- 新增 `src/utils/coupon.js`：三組優惠碼規則與折扣計算
- `POST /api/orders` 接受選填 `couponCode`
- orders 資料表新增 `coupon_code`、`discount`
- `GET /api/orders/:id` 回傳 `coupon_code` 與 `discount`
- 無效優惠碼的失敗路徑：不建單、不扣庫存、不清空購物車
- 單元測試、整合測試、文件與 `openapi.json`

### 不納入

- 後台優惠碼管理（新增、停用、修改）
- 使用次數上限、每人限用次數
- 前端結帳頁的優惠碼輸入欄位（Issue 列為選做，本次未做）
- 優惠碼疊加（每單最多一組）

## 3. 驗收條件

| 情境 | 預期 |
|------|------|
| 未使用優惠碼 | `discount = 0`，其餘金額與原本相同 |
| `FLOWER100`，小計 800 | 折 100 |
| `FLOWER100`，小計 799 | 400 |
| `SPRING10`，小計 1000 / 1234 / 3500 | 折 100 / 123 / 300 |
| `SUMMER50` | 400 |
| `FLOWER100`，小計 1550 | 折扣後 1450，宅配運費 120 |
| `FLOWER100`，小計 1600 | 折扣後 1500，免基本運費 |
| `flower100`（小寫） | 可正常使用，記錄為大寫 |
| `GET /api/orders/:id` | 回傳 `coupon_code`、`discount` |
| 無效優惠碼 | 訂單數、庫存、購物車皆不變 |

自動驗收：`tests/acceptance/coupon.test.js`（不得修改）。

## 4. 設計

### 4.1 Coupon 模組

`calculateDiscount(rawCode, subtotal)` 回傳 `{ couponCode, discount }`：

- 未提供（`undefined`、`null`、空字串、全空白）→ `{ couponCode: null, discount: 0 }`
- 非字串 → 拋 `CouponError`（`code = 'INVALID_COUPON'`）
- 去空白、轉大寫後查表；未知 → 拋錯
- `SUMMER50` 標記為 `expired` → 拋錯
- 未達 `minSubtotal` → 拋錯
- 固定折抵：`amount`
- 百分比：`Math.round(subtotal × percentOff / 100)`，再套 `maxDiscount`
- 最後以 `Math.min(discount, subtotal)` 保證折扣不超過小計

### 4.2 計算順序

```
購物車非空 → 庫存足夠 → subtotal
  → 解析優惠碼（失敗即 400，尚未寫入）
  → shipping = calculateShipping(折扣後小計)
  → totalAmount = subtotal - discount + shippingFee
  → transaction：INSERT order（含 coupon_code/discount）→ 快照 → 扣庫存 → 清購物車
```

關鍵：免運門檻必須用折扣後小計判斷，因此優惠碼解析必須在運費計算之前。

### 4.3 資料庫

`orders` 新增：

| 欄位 | 型別 | 約束 |
|------|------|------|
| `coupon_code` | TEXT | NULL 允許；記錄大寫 |
| `discount` | INTEGER | NOT NULL DEFAULT 0 |

既有資料庫以 `PRAGMA table_info` 偵測後 `ALTER TABLE` 補欄位，舊資料 `discount` 為 0、`coupon_code` 為 NULL。

### 4.4 API 契約

`POST /api/orders` 新增選填 `couponCode`；回應 `data` 新增 `discount`、`coupon_code`。

錯誤：`400 INVALID_COUPON`，沿用 `{ data: null, error, message }` 格式。

## 5. 檔案變更

| 檔案 | 變更 |
|------|------|
| `src/utils/coupon.js` | 新增 |
| `src/database.js` | schema 與 migration |
| `src/routes/orderRoutes.js` | 輸入、計算順序、回應、JSDoc |
| `src/services/orderService.js` | INSERT 新欄位 |
| `tests/coupon.test.js` | 新增 |
| `tests/integration/order-checkout.integration.test.js` | 新增 2 項 |
| `docs/*`、`openapi.json` | 同步 |

## 6. 測試計畫

| 層級 | 指令 | 涵蓋 |
|------|------|------|
| 單元 | `npm run test:unit` | 正規化、三組規則、門檻、上限、四捨五入 |
| 整合 | `npm run test:integration` | 折扣落庫、優惠碼失敗時不寫入 |
| 驗收 | `npm run test:acceptance -- coupon` | Issue 全部驗收條件 |

回歸：前兩套必須維持既有測試全綠。

## 7. 失敗模式與排查

| 症狀 | 可能原因 | 排查 |
|------|----------|------|
| 折扣後運費仍以原小計計算 | 優惠碼在 `calculateShipping` 之後才解析 | 確認計算順序 |
| 無效優惠碼仍扣庫存 | 驗證被放進 transaction 內 | 確認 400 發生在 `createOrderFromCart` 之前 |
| 舊資料庫啟動失敗 | migration 未加欄位或重複加欄位 | 檢查 `PRAGMA table_info(orders)` |
| 折扣小數 | 百分比折扣未四捨五入 | 檢查 `Math.round` |

## 8. 已知限制

- 前端沒有優惠碼輸入欄位，目前只能透過 API 使用。
- 三組優惠碼寫死在模組中，調整需改程式並部署。
- 沒有使用次數或身分限制。

## 9. 實作結果與落差

- 測試結果：unit 72 passed、integration 15 passed、acceptance（coupon）10 passed。
- 已修正落差：`listOrdersForUser()` 原本未選 `coupon_code`／`discount`，與 OpenAPI 列表 schema 不一致；已補上欄位，並在整合測試斷言列表回應。
- Review 後補強：整合測試新增「折扣後小計決定免運」的 1,550／1,600 兩案與非字串優惠碼案例；單元測試補 1,235 元的四捨五入邊界；JSDoc 與 OpenAPI 補上 `INVALID_COUPON`。
