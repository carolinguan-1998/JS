# Boss直聘浏览器自动化设计文档

**日期**：2026-03-29
**状态**：待实现

---

## 背景

现有流程需要手动截图/复制 JD 放入 `data/待分析JD/`，分析完成后再手动去 Boss直聘 发送打招呼消息。本方案在现有流程两端各加一个脚本，实现输入端自动抓取、输出端半自动发送。

---

## 整体架构

三段独立脚本，通过文件传递数据：

```
scrape.js  →  data/待分析JD/*.json
                     ↓
              analyze.js（现有，小改）
                     ↓
              data/输出结果/results.json
                     ↓
               send.js
```

### 新增文件
| 文件 | 职责 |
|------|------|
| `src/scrape.js` | 打开浏览器，用户浏览标记，抓取 JD 存为 JSON |
| `src/send.js` | 读 results.json，逐条确认后在 Boss直聘 发送招呼 |
| `src/lib/browser.js` | 浏览器启动、session 加载/保存（两脚本共用） |
| `data/session.json` | 登录 cookie 持久化（不提交 Git） |
| `data/输出结果/results.json` | 分析结果 + 发送状态（不提交 Git） |

### analyze.js 改动范围
两处小改，其余不动：
1. `src/lib/files.js`：新增对 `.json` 文件的支持，读取其中的 `description` 字段作为 JD 文本，跳过 OCR 步骤；`url` 字段透传给后续输出。
2. `src/lib/output.js`：每条 JD 分析完成后，将结果（含 `url`、`greeting`、`shortGreeting`、`status: "pending"`）追加写入 `data/输出结果/results.json`。现有的 output.md 和飞书写入逻辑不变。

---

## 数据格式

### `data/待分析JD/公司+职位.json`（scrape.js 输出）
```json
{
  "url": "https://www.zhipin.com/job_detail/xxx.html",
  "company": "字节跳动",
  "title": "AI产品经理",
  "salary": "30-60K",
  "description": "职位描述全文...",
  "scrapedAt": "2026-03-29T10:00:00Z"
}
```
文件名格式与现有约定一致：`公司+职位.json`（含 `+` 视为已重命名，analyze.js 跳过重命名步骤）。

### `data/输出结果/results.json`（analyze.js 输出，send.js 读写）
```json
[
  {
    "url": "https://www.zhipin.com/job_detail/xxx.html",
    "company": "字节跳动",
    "title": "AI产品经理",
    "salary": "30-60K",
    "greeting": "完整版话术（300-400字）...",
    "shortGreeting": "Boss速览版话术（80-100字）...",
    "status": "pending",
    "analyzedAt": "2026-03-29T10:05:00Z",
    "sentAt": null
  }
]
```
`status` 字段：`pending`（待发送）→ `sent`（已发送）。send.js 只处理 `pending` 条目，发送成功后原地更新为 `sent` 并写回文件。

---

## 模块设计

### `src/lib/browser.js`
- `launchBrowser()` — 启动 Playwright Chromium（有界面模式）
- `loadSession(page)` — 若 `data/session.json` 存在则加载 cookie
- `saveSession(page)` — 登录后将 cookie 保存到 `data/session.json`
- `waitForLogin(page)` — 检测是否已登录（检查特定 DOM 元素），未登录则提示用户扫码并等待回车

### `src/scrape.js`
1. 调用 `browser.js` 启动浏览器并加载 session
2. 若未登录，引导用户扫码，登录后保存 session
3. 进入交互循环：监听终端键盘输入
   - **S 键**：读取当前页面 URL 和职位信息，保存为 `data/待分析JD/公司+职位.json`
   - **Q 键**：结束抓取，打印已保存条数，关闭浏览器
4. 职位信息抓取策略：优先解析页面 DOM 结构化字段；若失败则读取 `document.body.innerText` 作为 description

### `src/send.js`
1. 读取 `data/输出结果/results.json`，过滤出 `status: "pending"` 的条目
2. 若无待发送条目，退出并提示
3. 调用 `browser.js` 启动浏览器并加载 session
4. 逐条处理：
   - 终端展示：公司、职位、薪酬、shortGreeting 全文
   - 等待用户输入：Y（发送）/ N（跳过）/ Q（退出）
   - Y：导航到职位 URL → 点击「立即沟通」或「继续沟通」→ 在输入框粘贴 shortGreeting → 等待用户最终确认 → 点击发送
   - 发送成功后更新 results.json 中该条目的 `status` 为 `sent`，`sentAt` 为当前时间
5. 关闭浏览器

---

## 登录 Session 机制

- 首次运行：浏览器打开 Boss直聘，用户手动扫码登录，程序检测到登录成功后自动保存 cookie 到 `data/session.json`
- 后续运行：直接加载 `data/session.json`，跳过登录步骤
- Session 失效：程序检测到跳转到登录页时，自动清除旧 session，重新引导登录
- `data/session.json` 加入 `.gitignore`，不提交

---

## 运行方式

```bash
# 第一步：抓取感兴趣的职位
node scrape.js

# 第二步：分析（现有流程不变）
node analyze.js

# 第三步：确认并发送招呼
node send.js
```

---

## 边界情况处理

| 情况 | 处理方式 |
|------|---------|
| 职位已下架 | 打开页面后检测到「职位已关闭」提示，跳过并标记 status: "expired" |
| 已打过招呼 | 按钮变为「继续沟通」，程序正常点击进入对话框，流程不变 |
| 发送失败（网络/超时） | 保持 status: "pending"，终端报错，下次运行可重试 |
| results.json 不存在 | 提示先运行 analyze.js |
| session.json 失效 | 自动检测并重新引导登录 |

---

## 不在本次范围内

- 自动筛选/过滤职位（由用户浏览判断感兴趣）
- 批量投递简历附件（Boss直聘打招呼流程中简历通过「在线简历」展示，无需额外操作）
- 定时/后台自动抓取
