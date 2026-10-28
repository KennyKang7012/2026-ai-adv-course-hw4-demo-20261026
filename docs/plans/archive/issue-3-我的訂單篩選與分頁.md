# Issue #3 我的訂單篩選與分頁 — 開發計畫

- Issue：`#3 我的訂單篩選與分頁`
- 分支：`issue-3-我的訂單篩選與分頁`
- 狀態：已完成（PR #4 合併 `128b6a6`；頁碼上限與前端提示由 follow-up PR 補強）
- 撰寫時間：2026-10-29

## 1. 目標

讓會員查詢自己的訂單時，可以依狀態篩選並分頁。回應格式沿用 `GET /api/admin/orders` 的 `pagination` 結構，前端既有訂單頁不需改動即可繼續運作。

## 2. 範圍

### 納入

- `GET /api/orders` 支援 `status`、`page`、`limit` 三個 query 參數
- 嚴格驗證：非法 `status`、非正整數的 `page`／`limit` 回 400
- `limit` 上限 50，超過以 50 計
- 只回傳自己的訂單，依建立時間由新到舊
- 回應加入 `pagination: { page, limit, total, totalPages }`
- JSDoc／OpenAPI、文件、測試同步

### 不納入（引用 Issue 原文）

- 後台訂單列表（`GET /api/admin/orders`）的調整
- 依日期區間或關鍵字搜尋
- 前端訂單頁的篩選與分頁 UI（選做）

## 3. 驗收條件

- [x] 不帶參數時回傳第 1 頁、每頁 10 筆，依建立時間由新到舊
- [x] `status=paid` 只回傳已付款訂單
- [x] 12 筆訂單、`limit=5` 時，第 3 頁有 2 筆，`totalPages` 為 3
- [x] `limit=100` 時以 50 計
- [x] `status=unknown`、`page=0`、`limit=-1` 回傳 400
- [x] 不會回傳其他會員的訂單
- [x] 不同時間建立的訂單，較新的排在前面

自動驗收：`tests/acceptance/order-filter.test.js`（不得修改）。

## 4. 設計

### 4.1 參數解析

| 參數 | 未提供 | 合法值 | 非法值 |
|------|--------|--------|--------|
| `status` | 不篩選 | `pending` / `paid` / `failed` | 400 `VALIDATION_ERROR` |
| `page` | 1 | 正整數 | 400 `VALIDATION_ERROR` |
| `limit` | 10 | 正整數，> 50 以 50 計 | 400 `VALIDATION_ERROR` |

- 一律使用既有的 `parsePositiveInteger`，避免出現 `parseInt('3abc')` 這種截斷後放行。
- `status` 先轉字串再比對白名單；空字串視為非法。

### 4.2 Service 層

`listOrdersForUser(userId)` 改為 `listOrdersForUser({ userId, status, limit, offset })`，回傳 `{ orders, total }`：

```sql
SELECT ... FROM orders
WHERE user_id = ? [AND status = ?]
ORDER BY created_at DESC, rowid DESC
LIMIT ? OFFSET ?

SELECT COUNT(*) FROM orders
WHERE user_id = ? [AND status = ?]
```

- 加上 `rowid DESC` 作為同秒建立的次要排序，避免分頁順序不穩定。
- `status` 使用參數綁定，不拼接字串；條件子句由程式組合固定片段。

### 4.3 路由層

```js
GET /api/orders?status=&page=&limit=
→ 驗證 → service → 200
data: { orders: [...], pagination: { page, limit, total, totalPages } }
```

`totalPages = Math.ceil(total / limit)`；`total = 0` 時為 0。

### 4.4 前端相容性

`public/js/pages/orders.js` 目前只讀 `res.data.orders`，新增 `pagination` 不影響既有行為。本次不新增 UI。

## 5. 檔案變更

| 檔案 | 變更 |
|------|------|
| `src/services/orderService.js` | `listOrdersForUser` 改為分頁／篩選版本 |
| `src/routes/orderRoutes.js` | query 驗證、回應加 `pagination`、JSDoc |
| `tests/integration/order-checkout.integration.test.js` | 新增分頁、篩選、隔離、非法參數案例 |
| `docs/FEATURES.md`、`docs/ARCHITECTURE.md` | 行為與回應格式 |
| `docs/README.md`、`docs/TESTING.md` | 測試數量 |
| `docs/CHANGELOG.md` | Unreleased 條目 |
| `openapi.json` | 重新產生 |

## 6. 測試計畫

| 層級 | 指令 | 驗證重點 |
|------|------|----------|
| 單元 | `npm run test:unit` | 既有測試不得回歸（`listOrdersForUser` 簽名變更需確認呼叫端） |
| 整合 | `npm run test:integration` | 預設分頁、`status` 篩選、`limit` 上限、非法參數 400、跨會員隔離 |
| 驗收 | `npm run test:acceptance -- order-filter` | Issue 全部驗收條件 |

## 7. 失敗模式與排查

| 症狀 | 可能原因 | 排查 |
|------|----------|------|
| `limit=100` 回 400 | 把上限做成驗證而非 clamp | 上限應 clamp，非拒絕 |
| `page=0` 回 200 | 用了 `parseInt(x) || defaultValue` | 改用 `parsePositiveInteger` |
| 第 3 頁筆數錯 | offset 計算或 total 未套篩選條件 | 確認 COUNT 與 SELECT 條件一致 |
| 同秒訂單順序跳動 | 只按 `created_at` 排序 | 加 `rowid DESC` |
| 前端訂單頁空白 | 回應結構被改成 `data` 直接是陣列 | 保持 `data.orders` |

## 8. 已知限制

- `created_at` 只有秒級精度；同秒訂單的「新到舊」以 `rowid` 為準，不是真正的毫秒順序。
- `page` 超過 `totalPages` 時回空陣列與正確 `pagination`，不視為錯誤。
- 未實作前端篩選與分頁 UI（Issue 列為選做）。

## 9. 實作結果與落差

- 三套測試：`test:unit` 72 passed、`test:integration` 18 passed、`test:acceptance -- order-filter` 7 passed。
- 與計畫的差異：
  - 排序加上 `rowid DESC` 作為同秒次要排序（計畫已列為設計）。
  - `?status=`（空字串）視為非法，回 400；計畫未明列，實作採嚴格解讀。
  - `page` 超過總頁數回空陣列，維持 200。
- Review 結果（PR #4）：無 Critical／High。兩項 Medium 已於 follow-up 處理：
  - `page` 超大（18 位數）導致 SQLite `datatype mismatch` 回 500 → 改為 `Number.isSafeInteger` 驗證與 offset 上限，實測四種輸入皆回 400。
  - 前端超過 10 筆時靜默截斷 → 訂單頁顯示「僅顯示最近 N 筆，共 M 筆」提示。
  - 另補：排序測試改為比對 id 順序（原本同秒情境是空斷言）、非法參數涵蓋重複參數與 `limit=0`。
- 未實作：前端篩選與分頁 UI（Issue 列為選做）。
