import { readFileSync } from 'fs';
import { extname, join } from 'path';
import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  QWEN_API_KEY,
  INPUT_DIR,
} from './config.js';
import { buildResumeSection } from './resume.js';

const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_VISION_MODEL = 'qwen-vl-plus';
const QWEN_TEXT_MODEL = 'qwen-plus';

const QWEN_JOB_FIELDS_SCHEMA = {
  job_title: '',
  company_name: '',
  city: '',
  experience_requirement: '',
  job_keywords: [],
  must_have_requirements: [],
  summary: '',
  best_greeting_angle: '',
  confidence: 0,
};

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value, maxItems = 6) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeJobFields(raw = {}) {
  return {
    job_title: normalizeString(raw.job_title),
    company_name: normalizeString(raw.company_name),
    city: normalizeString(raw.city),
    experience_requirement: normalizeString(raw.experience_requirement),
    job_keywords: normalizeArray(raw.job_keywords, 6),
    must_have_requirements: normalizeArray(raw.must_have_requirements, 4),
    summary: normalizeString(raw.summary),
    best_greeting_angle: normalizeString(raw.best_greeting_angle),
    confidence: normalizeConfidence(raw.confidence),
  };
}

function parseJsonFromModel(rawText) {
  const raw = rawText.match(/\{[\s\S]*\}/)?.[0] ?? rawText;
  return JSON.parse(raw);
}

function sanitizeSegment(segment, fallback = '未知') {
  const clean = normalizeString(segment).replace(/[\/\\:*?"<>|]/g, '');
  return clean || fallback;
}

function buildShortNameFromFields(jobFields) {
  const company = sanitizeSegment(jobFields.company_name, '未知');
  const title = sanitizeSegment(jobFields.job_title, '职位');
  return `${company}+${title}`.slice(0, 24);
}

function inferJobType(jobFields) {
  const haystack = [
    jobFields.job_title,
    jobFields.summary,
    ...jobFields.job_keywords,
    ...jobFields.must_have_requirements,
  ].join(' ').toLowerCase();

  const ibKeywords = [
    '投行', 'ipo', '承销', '保荐', '上市', '尽职调查', '再融资', '定增', '配股', '债券发行',
  ];
  const investKeywords = [
    '投资', '投研', '融资', '并购', '基金', '金融', '券商', '行业研究', '估值', 'pe', 'vc',
  ];
  const aiKeywords = [
    'ai', '模型', '大模型', '算法', '产品', 'agent', '策略', '运营', '增长', '数据', '平台', '智能',
  ];

  if (ibKeywords.some(keyword => haystack.includes(keyword))) return 'ib';
  if (investKeywords.some(keyword => haystack.includes(keyword))) return 'invest';
  if (aiKeywords.some(keyword => haystack.includes(keyword))) return 'ai';
  return 'general';
}

async function callQwen(messages, model = QWEN_TEXT_MODEL, maxTokens = 1200) {
  const response = await fetch(QWEN_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${QWEN_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Qwen API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(item => item?.text || '')
      .join('\n')
      .trim();
  }
  return '';
}

async function ocrAndExtractFromImage(filePath) {
  const b64 = readFileSync(filePath).toString('base64');
  const prompt = `你是一个招聘岗位信息抽取助手。用户会提供Boss直聘岗位截图，你需要完成两件事：

1. 识别截图中的文字内容
2. 从识别结果中提取标准化字段，输出为 JSON

要求：
1. 不要编造截图中没有的信息。
2. 如果某字段无法确认，填空字符串 “” 或空数组 []。
3. 优先提取对”打招呼语生成”真正有用的信息。
4. job_keywords 必须是适合后续文案生成的关键词，不要照抄整段JD，控制在 3-6 个。
5. must_have_requirements 只提取最关键的硬性要求，控制在 2-4 条。
6. best_greeting_angle 只提取 1 个最适合在打招呼语里强调的核心切入点。
7. summary 用一句话概括这个岗位最核心的招聘诉求。
8. confidence 输出 0-100 的整数，表示你对字段完整度和准确度的主观置信度。
9. 只输出 JSON，不要输出解释，不要加 markdown。
10. 提取 company_name 时，重点查看截图左下角招聘方姓名下方的文字，该位置通常会标注公司名称。

输出字段格式如下：
${JSON.stringify(QWEN_JOB_FIELDS_SCHEMA, null, 2)}`;

  const raw = await callQwen([{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      { type: 'text', text: prompt },
    ],
  }], QWEN_VISION_MODEL, 1600);

  return normalizeJobFields(parseJsonFromModel(raw));
}

async function extractFromText(description) {
  const raw = await callQwen([
    {
      role: 'system',
      content: '你是一个招聘岗位信息抽取助手，只输出严格 JSON。',
    },
    {
      role: 'user',
      content: `请根据以下岗位文本提取标准化字段，只输出 JSON，不要解释。

字段要求：
- job_title：岗位名称
- company_name：公司名称
- city：工作城市
- experience_requirement：经验要求
- job_keywords：3-6 个适合后续招呼语生成的关键词
- must_have_requirements：2-4 条硬性要求
- summary：一句话概括岗位最核心诉求
- best_greeting_angle：最适合在打招呼语里强调的单一切入点
- confidence：0-100 的整数

字段格式：
${JSON.stringify(QWEN_JOB_FIELDS_SCHEMA, null, 2)}

岗位文本：
${description}`,
    },
  ]);

  return normalizeJobFields(parseJsonFromModel(raw));
}

async function readJDFile(filePath, ext) {
  if (ext === '.json') {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!raw.description) throw new Error('JSON 文件缺少 description 字段');
    return raw;
  }
  if (ext === '.txt') {
    const text = readFileSync(filePath, 'utf-8').trim();
    if (!text) throw new Error('TXT 文件为空');
    return { description: text };
  }
  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    return { imagePath: filePath };
  }
  throw new Error(`不支持的文件类型：${ext}，请使用 .json、.txt 或图片`);
}

async function extractJobFields(rawInput) {
  if (rawInput.imagePath) {
    return ocrAndExtractFromImage(rawInput.imagePath);
  }
  return extractFromText(rawInput.description);
}

export async function callDeepSeek(systemPrompt, userContent, maxTokens = 1024) {
  const response = await fetch(DEEPSEEK_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function buildThirdParagraphInstruction(jobType) {
  if (jobType === 'ai') {
    return '- 第三段：穿插 AI 工具的实际使用经验，强调真实落地的项目和效率提升成果，而非停留在”体验过”的层面。';
  }
  if (jobType === 'ib') {
    return '- 第三段：结合岗位需求，点出投行项目中承担的具体职责（如财务尽调、申报文件撰写、募投方案设计等），用项目名称或规模数据支撑。';
  }
  if (jobType === 'invest') {
    return '- 第三段：结合岗位需求，点出数据分析、估值建模或行业研究方面的具体成果，用数字或案例支撑。';
  }
  return '- 第三段：结合岗位需求，突出简历中最相关的一项核心工作成果或可迁移能力，用具体事例说明。';
}

async function generateGreetings(jobFields, resumeSection, exampleStyle, jobType = 'general') {
  const exampleSection = exampleStyle.trim() ? `\n\n风格参考示例：\n${exampleStyle}` : '';
  const thirdParagraph = buildThirdParagraphInstruction(jobType);
  const userContent = `你是一个求职沟通文案助手。请根据”岗位结构化信息”和”候选人简历信息”，生成适合Boss直聘使用的打招呼语。

目标：
让招聘方快速感受到候选人与岗位的匹配度，并愿意回复。

生成要求：
1. 风格自然，像真实求职者，不像AI，不像正式邮件。
2. 不要使用空泛套话，如”非常荣幸””期待加入”等。
3. 优先围绕岗位字段中的 best_greeting_angle 来组织表达。
4. 结合候选人真实经历和岗位关键词来写，不要脱离简历乱发挥。
5. 如果岗位要求与简历并非完全匹配，就突出相近经验、可迁移能力或结果导向。
6. 如果 confidence 低于 60，不要过度引用具体细节，优先写更稳妥、更泛化的表达。
7. 如果 company_name 或 job_title 明确，可以自然带入；如果为空，则不要硬写。
8. 输出 1 条质量最高的招呼语，控制在 100-150 字，适合Boss直聘聊天场景。
9. 只输出严格 JSON，不要解释，不要加 markdown。

话术结构规范：
- 开头：用礼貌、真诚的语气打招呼，表达对岗位或公司的兴趣，如”您好！我对贵公司xx岗位非常感兴趣，很期待与您进一步交流。”
- 第一段：简要介绍学历背景（院校+专业）和职业经历（公司+岗位+年限），让对方快速建立基本认知。
- 第二段：重点介绍投行/主要职业经历中积累的核心能力，结合岗位需求选取最相关的角度。
${thirdParagraph}
- 结尾：礼貌、积极地表达进一步交流的意向，如”非常期待有机会进一步沟通！”

岗位结构化信息：
${JSON.stringify(jobFields, null, 2)}
${resumeSection}${exampleSection}

输出格式：
{
  “greeting”: “”
}`;

  const raw = await callDeepSeek(
    '你是一个擅长求职对话文案的助手，只输出严格 JSON。',
    userContent,
    600
  );

  const parsed = parseJsonFromModel(raw);
  return normalizeString(parsed.greeting);
}

export async function extractShortName(inputFile) {
  const filePath = join(INPUT_DIR, inputFile);
  const ext = extname(inputFile).toLowerCase();
  const raw = await readJDFile(filePath, ext);
  const jobFields = await extractJobFields(raw);
  return buildShortNameFromFields(jobFields);
}

/**
 * 核心分析函数：接收结构化 JD 数据，返回分析结果
 * @param {object} jdData - { company, title, description }
 * @param {string} exampleStyle - 风格示例文本
 */
export async function analyzeJDFromData(jdData, exampleStyle) {
  const mergedInput = { ...jdData };
  const extractedFields = await extractJobFields(mergedInput);
  const jobFields = normalizeJobFields({
    ...extractedFields,
    company_name: jdData.company || extractedFields.company_name,
    job_title: jdData.title || extractedFields.job_title,
  });

  const jobType = inferJobType(jobFields);
  const resumeSection = await buildResumeSection();
  const greeting = await generateGreetings(jobFields, resumeSection, exampleStyle, jobType);

  return {
    company: jobFields.company_name || jdData.company || '未识别',
    title: jobFields.job_title || jdData.title || '未识别',
    city: jobFields.city,
    job_type: jobType,
    confidence: jobFields.confidence,
    requirements: jobFields.summary,
    bestGreetingAngle: jobFields.best_greeting_angle,
    jobKeywords: jobFields.job_keywords,
    mustHaveRequirements: jobFields.must_have_requirements,
    greeting,
    shortName: buildShortNameFromFields(jobFields),
    jobFields,
  };
}

/** 从文件分析 JD（cli.js 批处理模式使用） */
export async function analyzeJD(inputFile, exampleStyle) {
  const filePath = join(INPUT_DIR, inputFile);
  const ext = extname(inputFile).toLowerCase();
  const raw = await readJDFile(filePath, ext);

  const jdData = {
    company: raw.company || '',
    title: raw.title || '',
    description: raw.description || '',
    imagePath: raw.imagePath,
  };

  const result = await analyzeJDFromData(jdData, exampleStyle);
  return { ...result, source: inputFile, url: raw.url ?? null };
}
