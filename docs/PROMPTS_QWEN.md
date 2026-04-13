# Qwen Prompt 摘录

本文档展示 Boss 直聘招呼语生成器中使用 Qwen API 进行 JD 信息提取的完整 prompt 设计。

---

## 设计意图

**场景**：从 Boss 直聘截图或纯文本中提取结构化的岗位信息。

**核心设计思路**：
1. 图片场景使用视觉语言模型（qwen-vl-plus）直接识别截图
2. 统一输出 JSON 格式，便于后续 DeepSeek 处理
3. 通过 `confidence` 字段控制后续生成的保守程度
4. `best_greeting_angle` 字段直接指导招呼语的核心切入点

---

## Prompt 1：图片 OCR 解析

**调用位置**：`src/lib/ai.js` → `ocrAndExtractFromImage()` (行 134-152)

**触发条件**：用户上传 `.png`/`.jpg`/`.jpeg` 格式的 Boss 直聘截图

```markdown
你是一个招聘岗位信息抽取助手。用户会提供Boss直聘岗位截图，你需要完成两件事：

1. 识别截图中的文字内容
2. 从识别结果中提取标准化字段，输出为 JSON

要求：
1. 不要编造截图中没有的信息。
2. 如果某字段无法确认，填空字符串 "" 或空数组 []。
3. 优先提取对"打招呼语生成"真正有用的信息。
4. job_keywords 必须是适合后续文案生成的关键词，不要照抄整段JD，控制在 3-6 个。
5. must_have_requirements 只提取最关键的硬性要求，控制在 2-4 条。
6. best_greeting_angle 只提取 1 个最适合在打招呼语里强调的核心切入点。
7. summary 用一句话概括这个岗位最核心的招聘诉求。
8. confidence 输出 0-100 的整数，表示你对字段完整度和准确度的主观置信度。
9. 只输出 JSON，不要输出解释，不要加 markdown。
10. 提取 company_name 时，重点查看截图左下角招聘方姓名下方的文字，该位置通常会标注公司名称。

输出字段格式如下：
{
  "job_title": "",
  "company_name": "",
  "city": "",
  "experience_requirement": "",
  "job_keywords": [],
  "must_have_requirements": [],
  "summary": "",
  "best_greeting_angle": "",
  "confidence": 0
}
```

**调用示例**：
```javascript
const raw = await callQwen([{
  role: 'user',
  content: [
    { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
    { type: 'text', text: prompt },
  ],
}], QWEN_VISION_MODEL, 1600);
```

---

## Prompt 2：纯文本解析

**调用位置**：`src/lib/ai.js` → `extractFromText()` (行 165-195)

**触发条件**：用户上传 `.txt` 或 `.json` 格式的 JD 文本

```markdown
# System Prompt
你是一个招聘岗位信息抽取助手，只输出严格 JSON。

# User Prompt
请根据以下岗位文本提取标准化字段，只输出 JSON，不要解释。

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
{
  "job_title": "",
  "company_name": "",
  "city": "",
  "experience_requirement": "",
  "job_keywords": [],
  "must_have_requirements": [],
  "summary": "",
  "best_greeting_angle": "",
  "confidence": 0
}

岗位文本：
{description}
```

---

## 输出字段说明

| 字段 | 用途 | 生成招呼语时的作用 |
|------|------|------------------|
| `job_title` | 岗位名称 | 自然带入称呼 |
| `company_name` | 公司名称 | 增加针对性 |
| `city` | 工作城市 | 可选提及 |
| `experience_requirement` | 经验要求 | 评估匹配度 |
| `job_keywords` | 关键词列表 | 贯穿全文，提高相关性 |
| `must_have_requirements` | 硬性要求 | 优先呼应 |
| `summary` | 一句话概括 | 快速建立认知 |
| `best_greeting_angle` | 核心切入点 | **决定招呼语的核心角度** |
| `confidence` | 置信度 0-100 | 控制表达的保守程度（<60 时更泛化） |
