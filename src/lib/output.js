import { appendFileSync, existsSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import {
  LARK_CLI_PATH,
  LARK_SHEET_ID,
  LARK_SPREADSHEET_TOKEN,
  OUTPUT_FILE,
} from './config.js';

export function copyToClipboard(text) {
  try {
    execSync('clip', { input: text, encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

function resolveLarkCliPath() {
  if (!LARK_CLI_PATH) return undefined;
  return existsSync(LARK_CLI_PATH) ? LARK_CLI_PATH : undefined;
}

function formatResultAsMarkdown(result, processedAt) {
  const parts = [
    `## ${result.company} — ${result.title}`,
    `- **来源**：${result.source}`,
    `- **城市**：${result.city || '未提及'}`,
    `- **岗位类型**：${result.job_type}`,
    `- **置信度**：${result.confidence}`,
    `- **核心诉求**：${result.requirements || '未提取'}`,
    `- **最佳切入点**：${result.bestGreetingAngle || '未提取'}`,
    `- **处理时间**：${processedAt}`,
    '',
    '**关键词：**',
    '',
    result.jobKeywords?.join('、') || '未提取',
    '',
    '**硬性要求：**',
    '',
    result.mustHaveRequirements?.join('；') || '未提取',
    '',
    '**招呼语：**',
    '',
    result.greeting || '未生成',
    '',
    '---',
    '',
  ];

  return parts.join('\n');
}

export function printResults(results) {
  console.log('\n' + '='.repeat(90));
  for (const result of results) {
    console.log(`\n📄 ${result.source}  [${result.job_type}]`);
    console.log(`   公司：${result.company}　　职位：${result.title}　　城市：${result.city || '未提及'}`);
    console.log(`   诉求：${result.requirements || '未提取'}`);
    console.log(`   切入点：${result.bestGreetingAngle || '未提取'}　　置信度：${result.confidence}\n`);
    console.log('   【招呼语】');
    console.log(`   ${(result.greeting || '未生成').replace(/\n/g, '\n   ')}\n`);
  }
  console.log('='.repeat(90));
}

export function appendResultsToMarkdown(results) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const content = results.map(result => formatResultAsMarkdown(result, now)).join('');
  appendFileSync(OUTPUT_FILE, content, 'utf-8');
  console.log(`📝 已追加写入本地结果：${OUTPUT_FILE}`);
}

export function appendToLark(results, options = {}) {
  if (!LARK_SPREADSHEET_TOKEN || !LARK_SHEET_ID) {
    console.warn('⚠️  未设置 LARK_SPREADSHEET_TOKEN 或 LARK_SHEET_ID，跳过飞书写入');
    return false;
  }

  const larkCliPath = resolveLarkCliPath();
  if (!larkCliPath) {
    console.warn('⚠️  未找到 lark-cli run.js，请在 .env 中设置 LARK_CLI_PATH');
    return false;
  }

  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const rows = results.map(result => {
    const base = [
      result.company,
      result.title,
      result.city ?? '',
      result.job_type ?? '',
      result.source ?? '',
      result.greeting ?? '',
      result.bestGreetingAngle ?? '',
      result.confidence ?? '',
      now,
    ];
    if (options.includeActual) {
      base.push(result.actualGreeting ?? '');
      base.push(result.url ?? '');
    }
    return base;
  });

  const rowsJson = JSON.stringify(rows);
  try {
    const output = spawnSync('node', [
      larkCliPath,
      'sheets', '+append',
      '--spreadsheet-token', LARK_SPREADSHEET_TOKEN,
      '--sheet-id', LARK_SHEET_ID,
      '--values', rowsJson,
    ], { encoding: 'utf-8' });

    if (output.status !== 0) throw new Error(output.stderr || output.stdout);
    console.log(`📊 已写入飞书表格（${results.length} 条）`);
    return true;
  } catch (e) {
    console.warn(`⚠️  飞书写入失败：${e.message}`);
    return false;
  }
}
