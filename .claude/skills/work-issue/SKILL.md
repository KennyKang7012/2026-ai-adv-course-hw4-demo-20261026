---
name: work-issue
description: 依固定流程處理 GitHub Issue：驗證標籤與作者、改 in-progress、從 main 開分支、先寫計畫、實作與測試、開 PR、派 reviewer 審查、最後改 in-review。當使用者說「處理 Issue」「work issue」或輸入 /work-issue <編號> 時使用。
when_to_use: 使用者要求處理某個 GitHub Issue、跑完整 Issue 流程，或輸入 /work-issue <編號> 時。
argument-hint: '<Issue 編號>'
---

# work-issue 技能

把一個 GitHub Issue 從 `ready` 推進到 `in-review`。**流程終點是開好 PR 並等人合併，技能本身不合併 PR。**

## 參數

`$ARGUMENTS` 是 Issue 編號（純數字）。沒有帶編號、或不是數字時，先問使用者，不要猜。

## 完成定義

- Issue 標籤為 `in-review`
- 分支已推送，PR 已開且描述含 `Closes #<編號>`
- `test:unit`、`test:integration`、該 Issue 的驗收測試全綠
- reviewer 沒有未處理的「高」嚴重度問題
- 文件與 `openapi.json` 已同步

---

## 流程

### 步驟 0：前置檢查

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
gh auth status
git status --porcelain
```

- 工作區必須乾淨。有未提交變更時停下，先問怎麼處理。
- `node_modules/` 不存在時**不要自行安裝**，先問使用者（本專案 `npm ci` 後還需 `npm rebuild better-sqlite3`，見專案記憶）。

### 步驟 1：讀 Issue 並驗證

```bash
ISSUE=<編號>
gh issue view "$ISSUE" --json number,state,title,author,labels,body
ME=$(gh api user -q .login)
```

三個條件全部成立才繼續：

1. `state` 為 `OPEN`
2. `author.login` 等於 `$ME`
3. `labels` 含 `ready`

任一不符就停下，回報哪一項不符，不要自行改標籤或改 Issue 內容。

讀完 body 後，把「驗收條件」與「不在本次範圍」摘出來。需求有歧義、或缺規格時，**先問，不補假設**。

### 步驟 2：標籤改 in-progress

```bash
gh issue edit "$ISSUE" --remove-label ready --add-label in-progress
```

驗證標籤已變更後才進下一步。

### 步驟 3：從最新 main 開分支

```bash
git checkout main
git pull --ff-only origin main
git checkout -b "issue-${ISSUE}-${SLUG}"
```

- `SLUG` 取 Issue 標題：空白轉 `-`，移除 `/ \ : * ? " < > |`，保留中文，長度上限 50 字元。
- 一定要先 `pull --ff-only`，不要在落後的 main 上開分支。
- 分支已存在時停下確認，不要覆蓋。

### 步驟 4：先寫計畫（硬性門檻）

在**動任何程式之前**建立 `docs/plans/issue-${ISSUE}-${SLUG}.md`，至少包含：

1. 目標
2. 範圍（納入／不納入，直接引用 Issue 的「不在本次範圍」）
3. 驗收條件（逐條列出，可勾選）
4. 設計（模組、計算順序、資料庫變更、API 契約）
5. 檔案變更清單
6. 測試計畫（unit／integration／acceptance 各要驗什麼）
7. 失敗模式與排查順序
8. 已知限制
9. 實作結果與落差（實作完成後補填）

計畫寫完先 commit，再開始寫程式：

```bash
git add "docs/plans/issue-${ISSUE}-${SLUG}.md"
git commit -m "📝 docs: 新增 Issue #${ISSUE} 開發計畫"
```

**不要跳過這一步。** 先做再補計畫，等於沒有計畫；若真的發生，必須在文件與 commit message 明確標示「實作後補寫」。

### 步驟 5：實作並補測試

- 只改與 Issue 直接相關的程式碼，不順手重構無關區塊。
- 至少補 Unit 或 Integration Test；優先用純函式單元測試，再加 API／整合層案例。
- **不得修改該 Issue 的驗收測試檔**（除非 Issue 明文允許）。
- 不得用 `skip`、`only`、刪除測試或放寬斷言讓測試變綠。
- 遵守專案 `CLAUDE.md` 的規則（API envelope、dualAuth、transaction、測試使用記憶體 SQLite 等）。

### 步驟 6：派 test-runner 實跑

依序執行，三套都要跑：

```bash
npm run test:unit
npm run test:integration
npm run test:acceptance -- <Issue 對應關鍵字>
```

- 用 `test-runner` subagent 執行，要求它回報失敗項目、位置、分類（程式錯誤／測試錯誤／環境問題）。
- 有失敗就修，修完重跑；不得把失敗解釋成「已知問題」帶過。
- acceptance 不在 CI 內，**必須手動跑**；CI 綠燈不代表驗收測試跑過。
- 把實際的 passed/failed/skipped 數字記下來，後面寫進 PR。

### 步驟 7：更新文件與 OpenAPI

- `docs/FEATURES.md`：行為、request/response、錯誤碼、限制
- `docs/ARCHITECTURE.md`：資料流、schema、模組定位
- `docs/README.md`、`docs/TESTING.md`：測試數量與指令
- `docs/CHANGELOG.md`：只新增 `[Unreleased]` 條目，不改寫歷史
- `docs/ai-review.md`：若該 Issue 對應到已知問題，更新狀態
- 路由 JSDoc 有變更時執行 `npm run openapi`，並確認 `openapi.json` 真的包含新欄位

文件與實作不一致時，以 Issue 規格為準，兩邊一起改。

### 步驟 8：Commit 與 push

依 `git-commit` 技能規範：`<emoji> <type>: <繁體中文描述>`，結尾加 attribution。

```bash
git add <明確檔案>
git commit
git push -u origin HEAD
```

不要把多個不相關的變更混進同一個 commit；也不要 push 到 `main`。

### 步驟 9：開 PR

```bash
gh pr create --base main --head "<分支名>" --title "<emoji> <type>: <描述>" --body "$(cat <<'EOF'
## 變更內容
- ...

## 測試
| 指令 | 結果 |
|---|---|
| `npm run test:unit` | ... |
| `npm run test:integration` | ... |
| `npm run test:acceptance -- <關鍵字>` | ... |

## 文件
- ...

## 已知限制
- ...

Closes #<編號>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR 描述必須含 `Closes #<編號>`，否則合併後 Issue 不會自動關閉。

### 步驟 10：派 reviewer 審查

- 一般變更：`code-reviewer`
- 涉及權限、身分驗證、金流、輸入驗證：加派 `security-reviewer`

要求 reviewer 附 `檔案:行號` 與嚴重度。收到報告後：

- **High／Critical：必須修**，修完重跑步驟 6 的三套測試，再 commit + push 更新 PR。
- Medium／Low：可修的順手修；不修的寫進計畫文件的「落差」或 PR 描述，不要默默忽略。
- reviewer 的結論是模型輸出，不是事實。關鍵指控要自己讀程式碼複核，複核不了就標「待確認」。

### 步驟 11：改標籤並停止

```bash
gh issue edit "$ISSUE" --remove-label in-progress --add-label in-review
```

回報：PR 連結、commit 清單、三套測試實際數字、reviewer 發現與處理結果、未處理項目。

**到這裡結束。**

---

## 邊界（不可跨越）

1. **不合併 PR。** 不執行 `gh pr merge`、不在 GitHub 介面代按合併、不把 PR 併進 main。合併由人工決定。
2. **不刪分支。** 本地與遠端分支都留給人工處理。
3. **不 force-push。** 需要改歷史時先問。
4. **不 push 到 main。** 所有變更走分支與 PR。
5. **不改驗收測試。** 除非 Issue 明文允許，否則`tests/acceptance/` 一個字都不改。
6. **不修改 Issue 內容**（標題、body、狀態）；唯一會動的是流程標籤。
7. **不自行安裝依賴**、不改 `.env`、不讀取 secrets。
8. **不擴大範圍。** Issue 的「不在本次範圍」一律不做，即使看起來順手。
9. **不補假設。** 規格不明、驗收條件衝突、既有行為與 Issue 描述不符時，停下來問。
10. **不在審查完成前改 `in-review`。** 有未修的 High 時，標籤維持 `in-progress`。
11. **不把 CI 綠燈當成驗收通過。** 驗收測試不在 CI，必須手動跑。
12. **不為了讓測試變綠而放寬斷言或跳過測試。**

## 失敗模式與處理

| 症狀 | 處理 |
|------|------|
| Issue 沒有 `ready` 或不是自己開的 | 停下回報，不動標籤 |
| 工作區有未提交變更 | 停下，先問要 stash、commit 還是丟棄 |
| `node_modules` 缺失 | 停下，問是否安裝（需 `npm ci` + `npm rebuild better-sqlite3`） |
| 測試失敗但看不出原因 | 用 `test-runner` 的分類欄位判斷是程式、測試還是環境問題，不要猜 |
| reviewer 指控與程式碼不符 | 自己讀檔複核；以程式碼為準，記錄分歧 |
| 實作後才想起沒寫計畫 | 補寫並在文件與 commit message 標明「實作後補寫」，不要假裝計畫先行 |
| 分支已存在 | 停下確認是接續還是重建，不覆蓋 |
| PR 已存在 | 更新既有 PR，不要另開第二個 |

## 完成清單

- [ ] Issue 有 `ready`、作者是自己、狀態 OPEN
- [ ] 標籤已改 `in-progress`
- [ ] 分支從最新 main 開出
- [ ] 計畫文件存在且**早於**程式 commit
- [ ] 有新增 Unit 或 Integration 測試
- [ ] 驗收測試未被修改
- [ ] unit／integration／acceptance 三套實跑並記錄數字
- [ ] 文件與 `openapi.json` 已同步
- [ ] PR 描述含 `Closes #<編號>`
- [ ] reviewer 無未處理的 High／Critical
- [ ] 標籤已改 `in-review`
- [ ] **沒有合併 PR、沒有刪分支**
