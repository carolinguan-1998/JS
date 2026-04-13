/**
 * clipboard-watch.js
 * 监听剪贴板图片，自动保存到 data/inputs/待分析JD/ 并触发分析
 * 用法：node clipboard-watch.js
 */

import { execSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JD_DIR = join(__dirname, 'data', 'inputs', '待分析JD');
const POLL_INTERVAL = 1000; // ms

mkdirSync(JD_DIR, { recursive: true });

// 将 PowerShell 脚本写到临时文件，避免命令行引号转义问题
const PS_SCRIPT = `Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img -eq $null) { exit 0 }
$ms = New-Object System.IO.MemoryStream
$img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[Convert]::ToBase64String($ms.ToArray())`;

const PS_TMP = join(tmpdir(), 'clipboard_read.ps1');
writeFileSync(PS_TMP, PS_SCRIPT, 'utf8');

function getClipboardImageBase64() {
  try {
    const result = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${PS_TMP}"`,
      { timeout: 5000, windowsHide: true }
    ).toString().trim();
    return result;
  } catch {
    return '';
  }
}

let lastHash = '';
let analyzing = false;

function hashStr(str) {
  // 只取前200字符做哈希，足够判断图片是否变化且速度快
  return createHash('md5').update(str.slice(0, 200)).digest('hex');
}

function timestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function runAnalyze() {
  if (analyzing) {
    console.log('⏳ 上次分析尚未结束，跳过本次触发');
    return;
  }
  analyzing = true;
  console.log('\n🚀 开始分析...\n');

  const proc = spawn('node', ['analyze.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: false,
  });

  proc.on('close', (code) => {
    analyzing = false;
    if (code !== 0) {
      console.log(`\n⚠️  分析进程退出码 ${code}`);
    }
    console.log('\n👀 继续监听剪贴板...');
  });
}

function poll() {
  const b64 = getClipboardImageBase64();
  if (!b64) return;

  const hash = hashStr(b64);
  if (hash === lastHash) return;
  lastHash = hash;

  const filename = `screenshot_${timestamp()}.png`;
  const filepath = join(JD_DIR, filename);
  writeFileSync(filepath, Buffer.from(b64, 'base64'));
  console.log(`\n📸 截图已保存：${filename}`);

  runAnalyze();
}

console.log('👀 剪贴板监听已启动，Win+Shift+S 截图后自动触发分析');
console.log(`   保存目录：${JD_DIR}`);
console.log('   ESC 退出\n');

// 使用 raw mode 拦截按键，避免 Ctrl+C 复制操作误杀进程
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (key) => {
    if (key[0] === 0x1b) { // ESC
      console.log('\n👋 已退出监听模式');
      process.exit(0);
    }
    if (key[0] === 0x03) { // Ctrl+C：提示而不退出
      console.log('\n（提示：按 ESC 退出监听模式）');
    }
  });
}

setInterval(poll, POLL_INTERVAL);
