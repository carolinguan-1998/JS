import { extname } from 'path';
import { analyzeJD, extractShortName } from './lib/ai.js';
import { DEEPSEEK_API_KEY, QWEN_API_KEY } from './lib/config.js';
import {
  archiveProcessedFile,
  ensureRuntimeDirs,
  loadInputFiles,
  readExampleStyle,
  renameJDFile,
} from './lib/files.js';
import { appendResultsToMarkdown, appendToLark, copyToClipboard, printResults } from './lib/output.js';
import { withRetry } from './lib/utils.js';

function requireApiKey() {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.includes('这里填')) {
    console.error('❌ 请在 .env 文件中设置 DEEPSEEK_API_KEY');
    process.exit(1);
  }
  if (!QWEN_API_KEY || QWEN_API_KEY.includes('这里填')) {
    console.error('❌ 请在 .env 文件中设置 QWEN_API_KEY');
    process.exit(1);
  }
}

async function renameOnlyMode() {
  requireApiKey();
  ensureRuntimeDirs();

  const allFiles = loadInputFiles();
  if (allFiles.length === 0) {
    console.error('❌ data/inputs/待分析JD 中没有找到可处理文件');
    process.exit(1);
  }

  const toRename = allFiles.filter(file => !file.includes('+'));
  const skipped = allFiles.length - toRename.length;
  console.log(`📂 共 ${allFiles.length} 个文件，${skipped} 个已重命名跳过，开始处理 ${toRename.length} 个...\n`);

  if (toRename.length === 0) {
    console.log('✅ 所有文件均已重命名');
    return;
  }

  for (const file of toRename) {
    process.stdout.write(`⏳ 识别中：${file}...`);
    try {
      const shortName = await withRetry(() => extractShortName(file));
      const ext = extname(file).toLowerCase();
      const newFilename = renameJDFile(file, shortName, ext);
      if (newFilename !== file) {
        console.log(` ✅ → ${newFilename}`);
      } else {
        console.log(' — 名称未变');
      }
    } catch (err) {
      console.log(` ❌ 失败：${err.message}`);
    }
  }

  console.log('\n🎉 重命名完成！');
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--rename-only')) {
    return renameOnlyMode();
  }

  requireApiKey();

  ensureRuntimeDirs();

  const allFiles = loadInputFiles();
  if (allFiles.length === 0) {
    console.log('✅ data/inputs/待分析JD 中没有文件，无需处理');
    process.exit(0);
  }

  console.log(`🆕 本次需分析 ${allFiles.length} 个文件：${allFiles.join(', ')}`);

  const exampleStyle = readExampleStyle();
  const results = [];

  for (const file of allFiles) {
    process.stdout.write(`⏳ 分析中：${file}...`);
    try {
      const result = await withRetry(() => analyzeJD(file, exampleStyle));

      const ext = extname(file).toLowerCase();
      const newFilename = renameJDFile(file, result.shortName, ext);
      if (newFilename !== file) {
        result.source = newFilename;
        process.stdout.write(` → 重命名为 ${newFilename}`);
      }

      results.push(result);

      archiveProcessedFile(newFilename);

      console.log(` ✅ ${result.company} | ${result.title} [${result.job_type}]`);
    } catch (err) {
      console.log(` ❌ 失败（已重试2次）：${err.message}`);
    }
  }

  if (results.length === 0) {
    console.error('\n所有文件分析失败，请检查 API Key 和网络');
    process.exit(1);
  }

  printResults(results);
  const lastGreeting = results[results.length - 1]?.greeting;
  if (lastGreeting) {
    copyToClipboard(lastGreeting);
    console.log('📋 招呼语已复制到剪贴板');
  }
  appendResultsToMarkdown(results);
  appendToLark(results);
  console.log('🎉 完成！');
}
