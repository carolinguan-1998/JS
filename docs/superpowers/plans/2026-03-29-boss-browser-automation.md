# Boss直聘浏览器自动化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 analyze.js 两端各加一个脚本：`scrape.js` 用 Playwright 浏览器让用户标记感兴趣的职位并自动抓取 JD；`send.js` 逐条展示生成的话术，用户确认后自动在 Boss直聘 发送招呼消息。

**Architecture:** 三段独立脚本通过文件传递数据：scrape.js 写 `data/待分析JD/*.json`，analyze.js（小改）读 JSON 并输出 `data/输出结果/results.json`，send.js 读 results.json 逐条发送。浏览器 session（cookie）持久化到 `data/session.json`，登录一次后续自动复用。

**Tech Stack:** Node.js ESM, Playwright (Chromium), readline (built-in), node:test (built-in, 用于纯函数测试)

---

## 文件改动总览

| 操作 | 文件 | 改动内容 |
|------|------|---------|
| 修改 | `src/lib/config.js` | 新增 `SESSION_FILE`、`RESULTS_FILE` 两个路径常量 |
| 修改 | `src/lib/files.js` | `loadInputFiles()` 加 `.json`；`buildJDMessage()` 加 JSON 分支 |
| 修改 | `src/lib/output.js` | 新增 `appendToResultsJson(results)` 函数 |
| 修改 | `src/cli.js` | JSON 文件处理时透传 `url` 字段；调用 `appendToResultsJson` |
| 新建 | `src/lib/browser.js` | 浏览器启动、session 加载/保存、登录检测 |
| 新建 | `src/scrape.js` | 抓取主逻辑 |
| 新建 | `src/send.js` | 发送主逻辑 |
| 新建 | `scrape.js` | 根目录入口，转发到 src/scrape.js |
| 新建 | `send.js` | 根目录入口，转发到 src/send.js |
| 修改 | `.gitignore` | 新增 `data/session.json` |
| 修改 | `README.md` | 补充新的三步工作流说明 |

---

## Task 1：config.js 新增路径常量

**Files:**
- Modify: `src/lib/config.js`

- [ ] **Step 1：在 config.js 末尾追加两个常量**

在 `OUTPUT_FILE` 那行下方加入：

```js
export const SESSION_FILE = join(DATA_DIR, 'session.json');
export const RESULTS_FILE = join(OUTPUT_DIR, 'results.json');
```

- [ ] **Step 2：更新 .gitignore，防止 session 被提交**

在 `.gitignore` 末尾追加：
```
# 浏览器登录 session
data/session.json
```

- [ ] **Step 3：验证**

```bash
node -e "import('./src/lib/config.js').then(m => console.log(m.SESSION_FILE, m.RESULTS_FILE))"
```

期望输出：`data/session.json  data/输出结果/results.json`（路径分隔符按系统）

- [ ] **Step 4：Commit**

```bash
git add src/lib/config.js .gitignore
git commit -m "config: add SESSION_FILE and RESULTS_FILE path constants"
```

---

## Task 2：files.js 支持 .json 输入

**Files:**
- Modify: `src/lib/files.js`
- Test: 手动验证（见 Step 3）

- [ ] **Step 1：修改 `loadInputFiles()` 加入 `.json`**

将：
```js
const exts = ['.png', '.jpg', '.jpeg', '.webp', '.txt'];
```
改为：
```js
const exts = ['.png', '.jpg', '.jpeg', '.webp', '.txt', '.json'];
```

- [ ] **Step 2：修改 `buildJDMessage()` 加 JSON 分支**

在函数开头（`if (ext === '.txt')` 之前）插入：

```js
if (ext === '.json') {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const text = data.description;
  if (!text) throw new Error('JSON 文件缺少 description 字段');
  return { role: 'user', content: `职位描述：\n${text}` };
}
```

- [ ] **Step 3：验证**

新建一个测试文件 `data/待分析JD/测试+测试.json`，内容：
```json
{"url":"https://example.com","company":"测试","title":"测试","salary":"10K","description":"这是一个测试职位描述","scrapedAt":"2026-01-01T00:00:00Z"}
```

运行：
```bash
node -e "
import('./src/lib/files.js').then(m => {
  const files = m.loadInputFiles();
  console.log('files:', files);
  const msg = m.buildJDMessage('./data/待分析JD/测试+测试.json', '.json');
  console.log('msg:', msg);
});
"
```

期望：files 列表包含 `测试+测试.json`；msg.content 以 `职位描述：` 开头

删除测试文件：
```bash
rm "data/待分析JD/测试+测试.json"
```

- [ ] **Step 4：Commit**

```bash
git add src/lib/files.js
git commit -m "feat(files): support .json input files for scraped JDs"
```

---

## Task 3：output.js 新增 results.json 写入

**Files:**
- Modify: `src/lib/output.js`

- [ ] **Step 1：修改 output.js 的两处 import**

将：
```js
import { appendFileSync, existsSync } from 'fs';
```
改为：
```js
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
```

将：
```js
import {
  LARK_CLI_PATH,
  LARK_SHEET_ID,
  LARK_SPREADSHEET_TOKEN,
  OUTPUT_FILE,
} from './config.js';
```
改为：
```js
import {
  LARK_CLI_PATH,
  LARK_SHEET_ID,
  LARK_SPREADSHEET_TOKEN,
  OUTPUT_FILE,
  RESULTS_FILE,
} from './config.js';
```

- [ ] **Step 2：在文件末尾添加 `appendToResultsJson` 函数**

```js
export function appendToResultsJson(results) {
  const existing = existsSync(RESULTS_FILE)
    ? JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'))
    : [];

  const now = new Date().toISOString();
  for (const result of results) {
    if (!result.url) continue; // 非 JSON 来源的文件无 url，跳过
    existing.push({
      url: result.url,
      company: result.company,
      title: result.title,
      salary: result.salary,
      greeting: result.greeting,
      shortGreeting: result.shortGreeting ?? '',
      status: 'pending',
      analyzedAt: now,
      sentAt: null,
    });
  }

  writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  const added = results.filter(r => r.url).length;
  if (added > 0) console.log(`📋 已写入 results.json（${added} 条待发送）`);
}
```

- [ ] **Step 3：验证**

```bash
node -e "
import('./src/lib/output.js').then(m => {
  m.appendToResultsJson([{
    url: 'https://example.com',
    company: '测试公司',
    title: '测试职位',
    salary: '20K',
    greeting: '你好，完整版话术',
    shortGreeting: '你好，速览版',
  }]);
  console.log('done');
});
"
cat "data/输出结果/results.json"
```

期望：results.json 包含一条 status: "pending" 的记录

清理：
```bash
rm -f "data/输出结果/results.json"
```

- [ ] **Step 4：Commit**

```bash
git add src/lib/output.js
git commit -m "feat(output): add appendToResultsJson to persist analysis results for sending"
```

---

## Task 4：cli.js 透传 url 并调用 appendToResultsJson

**Files:**
- Modify: `src/cli.js`

- [ ] **Step 1：在 cli.js 顶部新增 import**

在 `import { extname } from 'path';` 行改为：
```js
import { extname } from 'path';
import { readFileSync } from 'fs';
import { join } from 'path';
```

（注意：`join` 已经从 `path` 引入了 extname，合并成一行）

实际改动：将：
```js
import { extname } from 'path';
```
改为：
```js
import { extname, join } from 'path';
import { readFileSync } from 'fs';
```

- [ ] **Step 2：在 output.js 的 import 行中加入 `appendToResultsJson`**

将：
```js
import { appendResultsToMarkdown, appendToLark, printResults } from './lib/output.js';
```
改为：
```js
import { appendResultsToMarkdown, appendToLark, appendToResultsJson, printResults } from './lib/output.js';
```

- [ ] **Step 3：在 main() 中的 analyzeJD 成功后，透传 url**

在 `results.push(result);` 行之前插入：

```js
// 若来源是 JSON 文件，透传 url 字段（供 send.js 使用）
if (ext === '.json') {
  try {
    const raw = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf-8'));
    result.url = raw.url ?? null;
  } catch {
    result.url = null;
  }
}
```

- [ ] **Step 4：在 main() 的输出区块中调用 appendToResultsJson**

在 `appendResultsToMarkdown(results);` 行之后插入：

```js
appendToResultsJson(results);
```

- [ ] **Step 5：验证（dry run，不真实运行 API）**

```bash
node -e "
import('./src/cli.js').catch(e => {
  if (e.message?.includes('QWEN_API_KEY')) {
    console.log('✅ 模块加载正常，API Key 检查如期触发');
  } else {
    console.error('意外错误：', e.message);
  }
});
" 2>&1
```

- [ ] **Step 6：Commit**

```bash
git add src/cli.js
git commit -m "feat(cli): pass url from JSON sources and write results.json after analysis"
```

---

## Task 5：browser.js — 浏览器启动与 session 管理

**Files:**
- Create: `src/lib/browser.js`

- [ ] **Step 1：新建 `src/lib/browser.js`**

```js
import { chromium } from 'playwright';
import { existsSync } from 'fs';
import { SESSION_FILE } from './config.js';

/**
 * 启动浏览器并创建 context。
 * 若 data/session.json 存在则自动加载（免登录）。
 * 返回 { browser, context, page }。
 */
export async function launchWithSession() {
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const contextOptions = existsSync(SESSION_FILE)
    ? { storageState: SESSION_FILE }
    : {};
  const context = await browser.newContext({
    ...contextOptions,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * 将当前登录 session 保存到 data/session.json。
 */
export async function saveSession(context) {
  await context.storageState({ path: SESSION_FILE });
  console.log('✅ 登录状态已保存');
}

/**
 * 检测当前页面是否已登录 Boss直聘。
 * 已登录的标志：URL 不含 /web/user/ 且含 zhipin.com。
 */
export async function isLoggedIn(page) {
  const url = page.url();
  return url.includes('zhipin.com') && !url.includes('/web/user/') && !url.includes('/web/common/security-check');
}

/**
 * 引导用户扫码登录，登录成功后保存 session。
 */
export async function ensureLoggedIn(page, context) {
  await page.goto('https://www.zhipin.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  if (await isLoggedIn(page)) {
    console.log('✅ 已加载登录状态，无需重新登录');
    return;
  }

  // Session 失效或首次运行，引导登录
  await page.goto('https://www.zhipin.com/web/user/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('\n🔐 请在浏览器中扫码登录 Boss直聘。');
  console.log('   登录完成后，回到此终端按 Enter 继续...\n');

  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  if (await isLoggedIn(page)) {
    await saveSession(context);
  } else {
    console.warn('⚠️  未检测到登录状态，请确认已成功登录后重试');
    process.exit(1);
  }
}
```

- [ ] **Step 2：验证模块语法正确**

```bash
node --input-type=module <<'EOF'
import './src/lib/browser.js';
console.log('✅ browser.js 加载成功');
EOF
```

期望：`✅ browser.js 加载成功`

- [ ] **Step 3：Commit**

```bash
git add src/lib/browser.js
git commit -m "feat(browser): add session-aware browser launcher for scrape and send scripts"
```

---

## Task 6：src/scrape.js — 抓取主逻辑

**Files:**
- Create: `src/scrape.js`

- [ ] **Step 1：新建 `src/scrape.js`**

```js
import readline from 'readline';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { INPUT_DIR } from './lib/config.js';
import { ensureLoggedIn, launchWithSession } from './lib/browser.js';

/** 从 Boss直聘职位详情页提取结构化信息 */
async function extractJobInfo(page) {
  return page.evaluate(() => {
    const getText = (...selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.innerText?.trim()) return el.innerText.trim();
      }
      return '';
    };

    const company =
      getText('.company-info .name', '.company-name', '.boss-info-attr .name') ||
      document.title;

    const title =
      getText('.job-info .name', '.job-title', 'h1') ||
      document.title;

    const salary =
      getText('.salary', '.job-salary', '.job-info .salary');

    // 优先取正文区域，fallback 到全文
    const description =
      getText('.job-detail-section .text', '.job-sec-text', '.detail-content') ||
      document.body.innerText.slice(0, 5000);

    return { company, title, salary, description };
  });
}

/** 将 info 保存为 JSON 文件，返回保存的文件名 */
function saveJobFile(info, url) {
  const safe = name => name.replace(/[\/\\:*?"<>|]/g, '').trim();
  const filename = `${safe(info.company)}+${safe(info.title)}.json`;
  const filepath = join(INPUT_DIR, filename);

  const data = {
    url,
    company: info.company,
    title: info.title,
    salary: info.salary,
    description: info.description,
    scrapedAt: new Date().toISOString(),
  };

  writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  return filename;
}

async function main() {
  const { browser, context, page } = await launchWithSession();

  await ensureLoggedIn(page, context);

  // 确保输入目录存在
  const { mkdirSync } = await import('fs');
  mkdirSync(INPUT_DIR, { recursive: true });

  console.log('\n📌 浏览器已就绪。请在浏览器中浏览 Boss直聘 职位。');
  console.log('   在感兴趣的职位详情页，回到终端：');
  console.log('   按 S 保存当前职位  |  按 Q 结束抓取\n');

  let savedCount = 0;

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on('keypress', async (str, key) => {
    // Ctrl+C 强制退出
    if (key.ctrl && key.name === 'c') {
      cleanup(browser, savedCount);
    }

    if (key.name === 's') {
      const url = page.url();
      if (!url.includes('zhipin.com/job_detail/')) {
        console.log('\n⚠️  当前不是职位详情页，请先打开一个职位再按 S');
        return;
      }
      try {
        const info = await extractJobInfo(page);
        const filename = saveJobFile(info, url);
        savedCount++;
        console.log(`\n[${savedCount}] ✅ 已保存：${info.company} · ${info.title}  →  ${filename}`);
      } catch (e) {
        console.log(`\n❌ 保存失败：${e.message}`);
      }
    }

    if (key.name === 'q') {
      cleanup(browser, savedCount);
    }
  });
}

function cleanup(browser, savedCount) {
  console.log(`\n\n👋 抓取结束，共保存 ${savedCount} 条，已存入 data/待分析JD/`);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  browser.close().then(() => process.exit(0));
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
```

- [ ] **Step 2：验证语法**

```bash
node --check src/scrape.js && echo "✅ 语法正确"
```

- [ ] **Step 3：Commit**

```bash
git add src/scrape.js
git commit -m "feat(scrape): browser scraping script with S/Q keyboard controls"
```

---

## Task 7：src/send.js — 发送主逻辑

**Files:**
- Create: `src/send.js`

- [ ] **Step 1：新建 `src/send.js`**

```js
import readline from 'readline';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { RESULTS_FILE } from './lib/config.js';
import { ensureLoggedIn, launchWithSession } from './lib/browser.js';

function loadPendingResults() {
  if (!existsSync(RESULTS_FILE)) {
    console.error('❌ 未找到 results.json，请先运行 node analyze.js');
    process.exit(1);
  }
  const all = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
  return all.filter(r => r.status === 'pending');
}

function updateResultStatus(url, status) {
  const all = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
  const entry = all.find(r => r.url === url);
  if (entry) {
    entry.status = status;
    entry.sentAt = new Date().toISOString();
  }
  writeFileSync(RESULTS_FILE, JSON.stringify(all, null, 2), 'utf-8');
}

/** 在 Boss直聘 职位详情页点击沟通按钮并发送招呼消息 */
async function sendGreeting(page, url, message) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 检测职位是否已下架
  const pageText = await page.evaluate(() => document.body.innerText);
  if (pageText.includes('该职位已关闭') || pageText.includes('职位已下架')) {
    throw new Error('职位已关闭或下架');
  }

  // 点击「立即沟通」或「继续沟通」
  const btnSelector = 'a.btn-startchat, .btn-chat, [class*="start-chat"], [class*="btn"][class*="chat"]';
  const btn = await page.waitForSelector(btnSelector, { timeout: 8000 }).catch(() => null);
  if (!btn) throw new Error('未找到沟通按钮，页面结构可能已变化');
  await btn.click();
  await page.waitForTimeout(1500);

  // 找到消息输入框（contenteditable 或 textarea）
  const inputSelector = '[contenteditable="true"], .chat-input textarea, textarea[placeholder*="说点什么"]';
  const input = await page.waitForSelector(inputSelector, { timeout: 8000 }).catch(() => null);
  if (!input) throw new Error('未找到消息输入框');

  // 清空并输入消息
  await input.click();
  await input.fill('');
  await input.type(message, { delay: 20 });
  await page.waitForTimeout(500);

  // 找到发送按钮并点击
  const sendBtnSelector = '.chat-input .btn-send, button[class*="send"], button:has-text("发送")';
  const sendBtn = await page.waitForSelector(sendBtnSelector, { timeout: 5000 }).catch(() => null);
  if (!sendBtn) throw new Error('未找到发送按钮');
  await sendBtn.click();
  await page.waitForTimeout(1000);
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim().toLowerCase()); }));
}

async function main() {
  const pending = loadPendingResults();

  if (pending.length === 0) {
    console.log('✅ 没有待发送的记录（所有条目均已发送或 results.json 为空）');
    process.exit(0);
  }

  console.log(`\n找到 ${pending.length} 条待发送记录\n`);

  const { browser, context, page } = await launchWithSession();
  await ensureLoggedIn(page, context);

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`[${i + 1}/${pending.length}] ${r.company} · ${r.title} · ${r.salary}`);
    console.log(`${'━'.repeat(60)}`);
    console.log(r.shortGreeting);
    console.log();

    const ans = await prompt('发送这条？ [Y]es / [N]o / [Q]uit：');

    if (ans === 'q') {
      console.log('\n👋 已退出，未发送的记录保持 pending 状态，下次运行可继续');
      break;
    }

    if (ans !== 'y') {
      console.log('⏭  跳过');
      continue;
    }

    try {
      await sendGreeting(page, r.url, r.shortGreeting);
      updateResultStatus(r.url, 'sent');
      console.log('✅ 已发送');
    } catch (e) {
      if (e.message.includes('下架') || e.message.includes('关闭')) {
        updateResultStatus(r.url, 'expired');
        console.log(`⚠️  ${e.message}，已标记为 expired`);
      } else {
        console.log(`❌ 发送失败：${e.message}（保持 pending，下次可重试）`);
      }
    }
  }

  await browser.close();
  console.log('\n🎉 完成！');
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
```

- [ ] **Step 2：验证语法**

```bash
node --check src/send.js && echo "✅ 语法正确"
```

- [ ] **Step 3：Commit**

```bash
git add src/send.js
git commit -m "feat(send): semi-auto sending script with Y/N/Q per-job confirmation"
```

---

## Task 8：根目录入口文件

**Files:**
- Create: `scrape.js`
- Create: `send.js`

- [ ] **Step 1：新建 `scrape.js`（根目录）**

```js
import './src/scrape.js';
```

- [ ] **Step 2：新建 `send.js`（根目录）**

```js
import './src/send.js';
```

- [ ] **Step 3：验证两个入口可以加载**

```bash
node --check scrape.js && echo "✅ scrape.js OK"
node --check send.js && echo "✅ send.js OK"
```

- [ ] **Step 4：Commit**

```bash
git add scrape.js send.js
git commit -m "feat: add root entry points scrape.js and send.js"
```

---

## Task 9：更新 README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1：在「运行方式」章节补充新的三步工作流**

在 README.md 中找到 `### 3. 运行程序` 这一节，在现有 `node analyze.js` 说明之前插入以下内容：

```markdown
### 完整三步工作流（含自动抓取和发送）

```bash
# 第一步：打开浏览器，浏览 Boss直聘，按 S 保存感兴趣的职位，按 Q 结束
node scrape.js

# 第二步：分析 JD，生成话术（与原有流程完全一致）
node analyze.js

# 第三步：逐条确认后自动发送招呼消息
node send.js
```

> 首次运行 `scrape.js` 或 `send.js` 时，浏览器会打开 Boss直聘 登录页，扫码登录后 session 自动保存，后续运行无需再次登录。
```

- [ ] **Step 2：在「项目结构」章节补充新文件**

在 `├── analyze.js` 行下方插入：
```
├── scrape.js               # 浏览器抓取入口，转发到 src/scrape.js
├── send.js                 # 浏览器发送入口，转发到 src/send.js
```

在 `src/lib/` 部分的文件列表中插入：
```
│       ├── browser.js      # Playwright 浏览器启动与 session 管理
```

- [ ] **Step 3：Commit**

```bash
git add README.md
git commit -m "docs: update README with three-step workflow and new file descriptions"
```

---

## 验收测试

所有 Task 完成后，按以下顺序进行端到端验证：

1. **scrape.js 冒烟测试**
   - 运行 `node scrape.js`
   - 浏览器打开，首次扫码登录
   - 打开任意一个 Boss直聘 职位页，按 S
   - 终端显示 `✅ 已保存：xxx · xxx`
   - 按 Q 退出，在 `data/待分析JD/` 看到对应 `.json` 文件
   - 内容包含 `url`、`company`、`title`、`description` 字段

2. **analyze.js 兼容性测试**
   - 运行 `node analyze.js`（需要 API Key 配置）
   - 确认 JSON 文件被正常识别和处理
   - 确认 `data/输出结果/results.json` 被创建，包含 `status: "pending"` 的条目

3. **send.js 冒烟测试（谨慎，会真实发送）**
   - 确认 results.json 中有 pending 条目
   - 运行 `node send.js`
   - 对第一条选 Y，确认浏览器完成打开页面 → 点沟通按钮 → 输入话术 → 发送
   - 终端显示 `✅ 已发送`
   - results.json 中该条目 status 更新为 `sent`
