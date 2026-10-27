# AI Review — 訂單／付款／運費／購物車

- 日期：2026-10-26
- 版本：`9af6f29`
- 範圍：`src/routes/`（order、cart）、`src/services/`（order、payment）、`src/utils/`（shipping、ecpay、validators）、`src/middleware/`、相關測試
- 方法：`security-reviewer` 與 `code-reviewer` 兩個唯讀 subagent 靜態審查，再由主 session 逐項複核；`test-runner` 實跑 `test:unit` 與 `test:integration`
- 本文件只記錄問題，**未修改任何程式碼**

## 驗證標記

| 標記 | 意義 |
|------|------|
| ✅ | 主 session 親自讀過程式碼並確認 |
| ⚠️ | 僅來自 subagent 報告，主 session 未複核 |

## 修正狀態（2026-10-27）

本輪修正 15 項。修正後 `npm run test:unit` 為 58 passed / 0 skipped，`npm run test:integration` 為 10 passed。後續 Issue #1（優惠碼）合併後，兩者分別為 72 與 15。

> 下方各問題標示的行號是修正前 `9af6f29` 的位置，修正後已位移。

| 編號 | 項目 | 修正內容 | 回歸驗證 |
|------|------|----------|----------|
| C1 | 訂單詳情 IDOR | 改用 `findOrderForUser`，非本人一律 404 | 新增跨會員 404 測試 |
| C2 | 預設管理員密碼 | production 缺少或沿用 `12345678` 時啟動失敗 | 啟動防護實測，exit 1 |
| C3 | 弱 `JWT_SECRET` | production 要求 32 字元以上且非已知預設值 | 啟動防護實測，exit 1 |
| H1 | 免運門檻 | 改為 `subtotal >= 1500`，取消 `it.skip` | 1,500 邊界測試轉綠 |
| H2 | PATCH 數量驗證 | 改用 `parsePositiveInteger`，非正整數回 400 | 新增 0／-1／1.5／"3abc"／true 測試 |
| H3 | 缺 `CheckMacValue` fail-open | 缺少簽章即視為驗證失敗 | 整合測試新增缺簽章案例 |
| H4 | 綠界金鑰 fallback | production 缺設定或 `ECPAY_ENV` 非 production 時啟動失敗 | 啟動防護實測，exit 1 |
| M2 | 模擬付款開關 | 需同時 `NODE_ENV=test` 與 `ENABLE_MOCK_PAYMENT=true`；production 開啟即拒絕啟動 | 既有 404 測試＋啟動防護實測 |
| M3 | 原型鍵繞過 | 改用 `Object.prototype.hasOwnProperty.call` | 新增 `action: "constructor"` 測試 |
| M5 | 庫存競態 | transaction 內改用 `WHERE stock >= ?`，`changes === 0` 即回滾並回 400 | 既有庫存不足測試（併發未實測） |
| L3 | 頁面錯誤外洩 | 只回通用訊息，細節寫入伺服器日誌 | 無自動測試 |
| L4 | 角色取自 token | `authMiddleware` 改從資料庫讀取 role | 既有管理員測試 |
| L5 | 模擬付款繞過服務層 | 改用 `markOrderPaid` / `markOrderFailed` | 既有付款測試 |
| L6 | 收件欄位無上限 | name 100／email 254／address 255 | 無自動測試 |
| L7 | 單號碰撞 | UNIQUE 碰撞時重試最多 5 次 | 無自動測試 |

### 仍未修正（需產品決策或新設計）

| 編號 | 項目 | 原因 |
|------|------|------|
| H5 | 運費附加條件信任前端 | 需先決定偏遠地區判定來源（地址或郵遞區號白名單），專案目前沒有 |
| M1 | `X-Session-Id` 未簽章 | 會改變購物車 API 契約，前端需同步修改 |
| M4 | 無 `/ecpay/notify` | 新增回呼處理與對帳流程，屬功能開發 |
| M6 | 三個驗收 Issue 未實作 | 優惠碼已由 PR #2 實作（計畫見 `docs/plans/issue-1-結帳優惠碼.md`）；取消訂單與列表分頁仍未實作 |
| M7 | failed／pending 不釋放庫存 | 業務規則未定（是否逾時取消、失敗是否回補） |
| L1 | 無速率限制 | 需新增依賴 |
| L2 | 後台頁面無伺服器端權限 | 需先決定 HTML 頁面的 cookie／session 驗證方案 |

### 已知限制

- H2 只修了 API 層。`cart_items` 的 `CHECK(quantity > 0)` 未加入整數條件，因為 SQLite 的 `CREATE TABLE IF NOT EXISTS` 不會修改既有表，需另外寫 migration。
- M5 的競態防護在 transaction 內以條件式 UPDATE 實作，但本次沒有多 process 併發實測。
- 啟動防護（C2、C3、H4、M2）只驗證了「拒絕啟動」，未驗證正式部署的完整啟動流程。

## 測試實跑結果（修正前，`9af6f29`）

| 指令 | 結果 | 耗時 |
|------|------|------|
| `npm run test:unit` | 54 passed / 1 skipped（7 files） | 4.06s |
| `npm run test:integration` | 10 passed / 0 failed（1 file） | 0.91s |

兩次執行（subagent 與主 session 各一次）數字一致。`test:integration` 只涵蓋 `tests/integration/order-checkout.integration.test.js`，輸出中沒有綠界 staging 或網路錯誤。

**結論：測試全綠，但抓不到下列多數缺陷。** 這不是測試寫壞，是缺口（見「測試缺口」）。

未執行：`test:acceptance`、`test:e2e`。

---

## Critical

### C1. 訂單詳情缺少所有權檢查（IDOR）✅

- 位置：`src/routes/orderRoutes.js:350-355`、`src/services/orderService.js:21-23`
- 規格：`docs/FEATURES.md:288-299` 明寫「僅能查看自己的訂單」「查詢條件含 `user_id`，他人訂單視為 404」

```js
router.get('/:id', (req, res) => {
  const order = findOrderById(req.params.id);   // 只查 id，沒有 user_id
```

`findOrderForUser`（`orderService.js:25-27`）已存在但這條路由沒用。

**失敗情境**：任何已登入會員持有他人訂單 UUID，`GET /api/orders/<他人 id>` 回 200，可取得 `recipient_name`、`recipient_email`、`recipient_address`、品項與金額。路由有 `router.use(authMiddleware)`（`orderRoutes.js:22`），所以只需要一個免費註冊帳號。

**修法方向**：改用 `findOrderForUser(req.params.id, req.user.userId)`，非本人一律 404；補「A 讀 B 訂單」測試。

### C2. 未設定 `ADMIN_PASSWORD` 時使用固定預設密碼 ✅

- 位置：`src/database.js:111-126`（`ADMIN_EMAIL || 'admin@hexschool.com'`、`ADMIN_PASSWORD || '12345678'`）
- `.env.example` 本身就把 `12345678` 當範例值

**失敗情境**：部署時漏設 `ADMIN_PASSWORD`，或直接照 `.env.example` 填寫，任何人都能以已知帳密登入管理員，讀取全部訂單 PII、改價格與庫存。`server.js:6-9` 只檢查 `JWT_SECRET`，不會因此拒絕啟動。

**修法方向**：正式環境強制要求 `ADMIN_PASSWORD` 且非預設值，缺少就啟動失敗；測試環境才允許 fallback。

### C3. `JWT_SECRET` 只檢查存在，範例值是公開可猜字串 ✅

- 位置：`server.js:6-9`（只檢查非空）、`.env.example:6`（`your-jwt-secret-key-here`）

**失敗情境**：沿用範例值時，任何人可自行簽發 `role: 'admin'` 的 HS256 token，直接取得管理員權限。

**修法方向**：production 拒絕範例值與過短 secret；啟動時檢查長度。

---

## High

### H1. 滿額免運門檻差 1 元，邊界測試被 `it.skip` ✅

- 伺服器：`src/utils/shipping.js:39-41` → `subtotal > 1500`
- 前端：`public/js/pages/checkout.js:28` → `if (cartTotal.value >= 1500) baseFee = 0`
- 文件：`docs/FEATURES.md:232`、`docs/README.md:70` 都是「滿 1,500 元」
- 測試：`tests/shipping.test.js:29` 的 1,500 案例是 `it.skip`

**失敗情境**：小計剛好 1500（例如 750 元商品 ×2）。前端顯示免運、總額 1500；伺服器收宅配 120／超商 60，建單後 `total_amount` 變成 1620／1560。

**修法方向**：確認商業規則後三方統一（目前文件與前端都是 `>=`）；移除 skip，補 1499／1500／1501。

### H2. `PATCH /api/cart/:itemId` 只擋 `NaN` ✅

- 位置：`src/routes/cartRoutes.js:292-315`
- DB：`src/database.js:48` `CHECK(quantity > 0)`；`orders.subtotal`、`order_items.quantity` 無整數限制
- 對照：`POST` 用嚴格的 `parsePositiveInteger`（`src/utils/validators.js:15-18`）

**失敗情境**：

| 輸入 | 目前行為 | 規格要求 |
|------|----------|----------|
| `0`、`-3` | UPDATE 觸發 CHECK → SqliteError 未捕捉 → 500 `INTERNAL_ERROR` | 400 `VALIDATION_ERROR` |
| `1.5` | 200，寫入小數 | 400 |
| `"3abc"`、`true` | `Number()` 轉成 `NaN` 或 `1`，前者 400、後者通過 | 400 |

小數數量的下游影響：建單時 `subtotal = price × 1.5`、庫存扣 1.5、綠界 `TotalAmount` 可能送出非整數而被拒。

**修法方向**：改用 `parsePositiveInteger`，非正整數一律 400；DB 可再加整數檢查作第二道防線。

### H3. `QueryTradeInfo` 回應缺少 `CheckMacValue` 時跳過驗證（fail-open）✅

- 位置：`src/services/paymentService.js:15-17`

```js
if (tradeInfo.CheckMacValue && !verifyCheckMacValue(...)) {
  throw new Error('QueryTradeInfo CheckMacValue mismatch');
}
```

只要 `TradeStatus === '1'`、單號與金額相符，**沒有簽章**也會回 `true`，訂單被改為 paid。

**失敗情境**：回應被代理／中間人替換，或測試 mock 漏帶欄位。目前查詢走伺服器端 HTTPS，實際可達性低，但這是防禦失效。

**修法方向**：付款成功路徑強制要求 `CheckMacValue` 存在且驗證通過；補「缺少簽章」與「單號不符」測試。

### H4. 綠界金鑰未設定時 fallback 到公開測試值 ✅

- 位置：`src/utils/ecpay.js:3-12`（`3002607`／`pwFHCqoQZGmho4w6`／`EkRm7iFT261dpevs`）

**失敗情境**：正式部署漏設變數時不會失敗，而是安靜使用綠界公開測試金鑰與 staging URL。目前專案沒有 `/ecpay/notify` handler，所以不是立即的偽造路徑；但一旦補上回呼，公開金鑰等於可被用來偽造簽章。

**修法方向**：production 強制要求四項設定，缺少即啟動失敗；fallback 僅限 `NODE_ENV=test`。

### H5. 運費附加條件完全信任前端宣告 ✅

- 位置：`src/routes/orderRoutes.js:149-155`（只驗 boolean）、`src/utils/shipping.js:20-23`、`43-48`

**失敗情境**：前端傳 `isRemoteArea: false, isExpress: false` 即可少付 200 + 250 元。伺服器確實有重算金額（這點正確），但計價依據是未經驗證的自述旗標。

**修法方向**：由伺服器依地址／郵遞區號判定偏遠地區；若產品決定維持自述，需在文件列為已知風險。

---

## Medium

### M1. `X-Session-Id` 是無簽章、無到期的 bearer 身分 ✅

- 位置：`src/middleware/sessionMiddleware.js:1-7` —— 直接信任 header 任意字串

**失敗情境**：持有他人 session ID 可讀寫其訪客購物車；`login`／`register` 的 `mergeGuestCart` 會把該 session 購物車併入登入者帳號並刪除原資料。需先取得 UUID（122 bits），不是可直接枚舉，但從 localStorage、XSS、共用裝置或日誌洩漏即可越權。不會升級為管理員權限。

**修法方向**：伺服器簽發有到期的 session token；至少驗證格式與長度並在文件標明為 bearer 憑證。

### M2. 模擬付款端點僅以 `NODE_ENV === 'test'` 把關 ✅

- 位置：`src/routes/orderRoutes.js:24-30`、`433-470`

**失敗情境**：部署環境誤設 `NODE_ENV=test`，任何會員可把自己的 pending 訂單直接改 paid。

**修法方向**：改用獨立且預設關閉的開關（如 `ENABLE_MOCK_PAYMENT`），或在測試建構 app 時才掛載。

### M3. 模擬付款用物件查表，原型鍵可繞過驗證 ✅

- 位置：`src/routes/orderRoutes.js:437-444`

```js
const actionMap = { success: 'paid', fail: 'failed' };
if (!action || !actionMap[action]) { ... }
```

`action: "constructor"` 會取到函式（truthy）通過檢查，`newStatus` 變成函式，綁定時 500。端點僅測試環境開放，故列 Medium。

**修法方向**：`Object.prototype.hasOwnProperty.call(actionMap, action)` 或直接列舉字串比對。

### M4. 沒有 `/ecpay/notify` handler，付款結果只靠客戶端查詢 ✅

- 位置：`src/utils/ecpay.js:114` 設定 `ReturnURL: baseUrl + '/ecpay/notify'`；`src/` 內無對應路由

**失敗情境**：綠界 server-to-server 通知打到 404。使用者付款後直接關閉瀏覽器，訂單永遠停在 pending，沒有對帳機制。

**修法方向**：實作 handler（驗 `CheckMacValue`、核對單號與金額、狀態更新保持冪等、回 `1|OK`），或明確由部署層處理並寫進文件。

### M5. 庫存檢查在 transaction 外，扣減沒有 `stock >= ?` 條件 ⚠️

- 位置：`src/routes/orderRoutes.js:167-175`（檢查）、`:188`（進入 transaction）、`src/services/orderService.js:83-109`
- DB：`src/database.js:37` `CHECK(stock >= 0)`

**失敗情境**：單一 Node process 內，better-sqlite3 同步 API 且 handler 無 await，檢查與 transaction 之間不會插入其他請求，目前安全。但兩個 process 共用同一 SQLite 檔時，兩邊都可能讀到 `stock=1`：第二筆觸發 CHECK → 500（而非規格要求的 400），若移除 CHECK 就是超賣。

**修法方向**：transaction 內重讀庫存，並用 `WHERE id = ? AND stock >= ?`，依 `changes === 0` 回 400 `STOCK_INSUFFICIENT`。

### M6. 三個驗收 Issue 未實作，`docs/plans/` 也沒有計畫文件 ✅

- 優惠碼：`src/` 內無 coupon 相關程式；schema 無 `coupon_code`／`discount`
- 取消訂單：`src/routes/orderRoutes.js` 無 cancel 路由；`status` CHECK 只有 `pending/paid/failed`（`src/database.js:66`）
- 訂單列表分頁／篩選：`src/routes/orderRoutes.js:265-273` 只回全部訂單，未處理 query
- 對應驗收測試：`tests/acceptance/coupon.test.js`、`cancel-order.test.js`、`order-filter.test.js`
- `docs/plans/` 只有 `.gitkeep`

**說明**：README 記載 starter 的 main 上驗收測試預期失敗，所以這可能是刻意狀態。但若此 repo 是交付版本，等於三個 Issue 未完成且無計畫文件。

> 2026-10-28 更新：優惠碼已由 PR #2 完成並合併，計畫文件見 `docs/plans/archive/issue-1-結帳優惠碼.md`；取消訂單與列表分頁仍未實作。

**待確認**：交付範圍。

### M7. `failed`／`pending` 訂單永久佔用庫存 ⚠️

- 位置：`src/routes/orderRoutes.js:459-460`（fail 只改狀態）、`src/services/orderService.js:103-106`（建單即扣庫存）

**失敗情境**：使用者進綠界後放棄付款，庫存永久保留；付款失敗後也不回補，且狀態不可逆。

**待確認**：業務規則是否要求逾時取消或失敗回補。

---

## Low

| # | 問題 | 位置 | 驗證 |
|---|------|------|------|
| L1 | 登入／註冊無速率限制，可暴力破解 | `app.js:21-27`、`package.json` 無 limiter | ⚠️ |
| L2 | 後台 HTML 頁面無伺服器端權限檢查，只有前端導頁 | `src/routes/pageRoutes.js:75-89` | ✅ |
| L3 | 頁面渲染失敗直接回 `err.message` | `src/routes/pageRoutes.js:8-11`、`16-19` | ✅ |
| L4 | 角色取自 JWT claim，降權後最長 7 天仍有效 | `src/middleware/authMiddleware.js`、`adminMiddleware.js` | ✅（機制） |
| L5 | 模擬付款直接寫 SQL，未走 `markOrderPaid` | `src/routes/orderRoutes.js:460` | ✅ |
| L6 | 收件欄位無長度上限 | `src/routes/orderRoutes.js:124-139` | ✅ |
| L7 | `order_no` 只有 5 碼 hex，碰撞無重試 | `src/services/orderService.js:4-11` | ⚠️ |

---

## 已確認沒有問題（附依據）

- **建單 transaction 順序正確**：INSERT order → INSERT 快照 → UPDATE stock → DELETE cart_items，失敗完整回滾（`src/services/orderService.js:86-109`；整合測試以 trigger 強制中途失敗驗證 rollback）。✅
- **金額伺服器端重算**：建單只用 DB 價格與數量，運費由 `calculateShipping` 計算，不接受前端金額（`src/routes/orderRoutes.js:177-195`）。✅
- **訂單品項為快照**：`order_items` 存 `product_name`／`product_price`，`product_id` 無 FK（`src/database.js:72-80`）。✅
- **建單只接受 JWT**：`orderRoutes.js:22` `router.use(authMiddleware)`，取車只查 `user_id`。✅
- **管理員 API 有權限檢查**：`adminOrderRoutes.js:9`、`adminProductRoutes.js:11`。⚠️（未逐行複核）
- **付款狀態冪等**：`markOrderPaid` 只允許 `pending → paid`（`paymentService.js:31-36`）。✅
- **SQL 全參數綁定**：抽查 `cartRoutes`、`orderService`、`adminOrderRoutes` 未見拼接使用者輸入。⚠️
- **密碼用 bcrypt**、JWT 限定 HS256：⚠️
- **API 錯誤格式統一**且不洩漏堆疊（頁面路由例外，見 L3）。✅
- **測試使用記憶體 SQLite**，整合測試另有 `database.sqlite` 雜湊守衛。⚠️

## 測試缺口

1. 沒有「A 讀 B 訂單詳情」測試 → C1 不會被發現（`tests/orders.test.js:110-130` 只測本人與不存在 ID）
2. 沒有 PATCH 非法數量測試 → H2（`tests/cart.test.js:46-56` 只測合法值）
3. 1,500 邊界被 `it.skip` → H1
4. 沒有「已付款回應缺 `CheckMacValue`」與「`MerchantTradeNo` 不符」測試 → H3
5. 沒有快照不變性測試（改價／刪商品後訂單明細不變）
6. 沒有重複送出建單的測試
7. 測試硬編碼預設管理員帳密（`tests/setup.js:7-11`），所以綠燈不反映 C2 風險
8. 管理員拒絕測試只覆蓋 GET，未逐一測 POST／PUT／DELETE

## 待確認（需 runtime 或部署資訊）

- 實際 `.env` 是否設定 `ADMIN_PASSWORD`、`JWT_SECRET` 強度、`ECPAY_ENV` 與三把金鑰（本次未讀取 `.env`）
- 正式部署是否有本 repo 以外的 `/ecpay/notify` handler
- 綠界 `QueryTradeInfo` 是否保證一定回傳 `CheckMacValue`（程式未強制）
- 小數數量的實際財務影響（出貨端如何解讀）
- `tests/acceptance` 是否預期在目前狀態通過
- 併發結論基於 better-sqlite3 同步特性推論，未做多 process 實測

## 未涵蓋範圍

- EJS 模板與 `public/js` 的完整 XSS 審查（只抽查訂單詳情頁的轉義）
- `tests/e2e`、`tests/acceptance` 的實跑（本次只跑 unit 與 integration）
- 依賴套件 CVE 掃描
- TLS、反向代理、WAF、速率限制等部署層控制
- git 歷史（無法確認測試是否在歷史中被刪除或改弱）

## 建議處理順序

1. **C1 IDOR** — 改一行查詢並補測試，影響最大、成本最低
2. **C2／C3 預設憑證** — 啟動時強制檢查，避免部署事故
3. **H1 免運門檻** — 先確認商業規則，再三方同步並取消 skip
4. **H2 數量驗證** — 換成既有 `parsePositiveInteger`，補非法值測試
5. **H3 簽章 fail-open** — 改成缺簽章即失敗
6. 其餘 High／Medium 依交付範圍排入

修正後的回歸驗證：`npm run test:unit`、`npm run test:integration`，並補上「測試缺口」列的案例。
