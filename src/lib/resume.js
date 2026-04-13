import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import pdfParse from 'pdf-parse';
import { RESUMES_DIR } from './config.js';

const resumeTextCache = new Map();

export function getResumePaths() {
  if (!existsSync(RESUMES_DIR)) return [];
  return readdirSync(RESUMES_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => join(RESUMES_DIR, f));
}

export async function extractPdfText(filePath) {
  if (resumeTextCache.has(filePath)) {
    return resumeTextCache.get(filePath);
  }

  const buffer = readFileSync(filePath);
  const data = await pdfParse(buffer);
  const text = data.text.trim();
  resumeTextCache.set(filePath, text);
  return text;
}

function getResumeMarkdownPath(filePath) {
  const dir = dirname(filePath);
  const baseName = basename(filePath, '.pdf');
  return join(dir, `${baseName}.md`);
}

function formatResumeMarkdown(filePath, text) {
  const title = basename(filePath, '.pdf');
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  return `# ${title}\n\n${lines.join('\n\n')}\n`;
}

export async function ensureResumeMarkdown(filePath) {
  const markdownPath = getResumeMarkdownPath(filePath);

  if (existsSync(markdownPath)) {
    return markdownPath;
  }

  const text = await extractPdfText(filePath);
  const markdown = formatResumeMarkdown(filePath, text);
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(markdownPath, markdown, 'utf-8');
  return markdownPath;
}

async function readResumeMarkdown(filePath) {
  const markdownPath = await ensureResumeMarkdown(filePath);
  const cacheKey = `md:${markdownPath}`;

  if (resumeTextCache.has(cacheKey)) {
    return resumeTextCache.get(cacheKey);
  }

  const markdown = readFileSync(markdownPath, 'utf-8').trim();
  resumeTextCache.set(cacheKey, markdown);
  return markdown;
}

export async function buildResumeSection() {
  const resumePaths = getResumePaths();
  const resumeTexts = [];

  for (const resumePath of resumePaths) {
    try {
      const text = await readResumeMarkdown(resumePath);
      resumeTexts.push(text);
    } catch {
      console.warn(`  ⚠️  简历读取失败：${resumePath}`);
    }
  }

  if (resumeTexts.length === 0) return '';
  return `\n\n## 我的简历\n${resumeTexts.join('\n\n---\n\n')}`;
}
