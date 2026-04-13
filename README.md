# Boss 直聘招呼语生成器

职位截图或文本，自动提取岗位信息、匹配你的简历，并生成可直接使用的 Boss 直聘打招呼话术。

## 适用场景

- 由于 Boss 直聘、猎聘等国内求职网站反爬虫机制很强，主要通过截图拿到职位信息
- 希望快速生成贴合岗位的招呼语，更容易引起 HR 关注
- 把历史结果自动归档，可选同步到飞书

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 `.env`

复制模板并填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env`：

```
DEEPSEEK_API_KEY=你的 DeepSeek API Key
QWEN_API_KEY=你的 Qwen API Key

# 可选：飞书同步
LARK_SPREADSHEET_TOKEN=你的表格 Token
LARK_SHEET_ID=你的 Sheet ID
LARK_CLI_PATH=/path/to/@larksuite/cli/scripts/run.js
```

> API Key 获取：[DeepSeek](https://platform.deepseek.com/) | [阿里云百炼（Qwen）](https://bailian.console.aliyun.com/)

### 3. 上传并解析你的简历

将你的简历 PDF 放入 `data/inputs/简历/` 目录，然后运行：

```bash
npm run init-resume
```

程序会自动将 PDF 解析为 Markdown，供后续生成招呼语时使用。

> 首次使用必须执行此步骤，否则程序会提示找不到简历。

### 4. 准备职位文件

将待分析的职位文件放到 `data/inputs/待分析JD/`，支持格式：

| 格式 | 说明 |
|------|------|
| `.png` / `.jpg` / `.jpeg` | Boss 直聘岗位截图（推荐） |
| `.txt` | 岗位 JD 纯文本 |
| `.json` | 包含 `description` 字段的结构化数据 |

### 5. 运行分析

手动批处理：

```bash
npm run analyze
```

仅重命名职位文件：

```bash
npm run rename
```

剪贴板自动监听模式：

```bash
npm run watch
```

启动后用 `Win + Shift + S` 截图，程序会自动把图片保存到输入目录并触发分析。分析完成后招呼语自动写入剪贴板，可直接粘贴。按 `ESC` 退出监听模式。

## 输出位置

- 文本结果：`runtime/输出结果/output.md`
- 已处理文件：`runtime/已分析JD/`
- 控制台实时打印本次分析结果
- 配置飞书后可自动追加到电子表格

## 目录结构

```text
JS/
├── analyze.js              # 统一入口
├── clipboard-watch.js      # 剪贴板监听模式
├── docs/
│   ├── PROMPTS_QWEN.md     # Qwen Prompt 设计文档
│   ├── PROMPTS_DEEPSEEK.md # DeepSeek Prompt 设计文档
│   └── greeting-examples.txt # 招呼语风格参考（可自定义）
├── .env.example            # 环境变量模板
├── src/
│   ├── cli.js
│   └── lib/
├── data/
│   └── inputs/
│       ├── 待分析JD/       # 放置待分析职位文件
│       └── 简历/           # 放置你的简历 PDF
└── runtime/                # 运行产物
    ├── 已分析JD/
    ├── 输出结果/
    └── session.json
```

## 工作流程

```text
职位截图或文本
  -> Qwen 提取结构化岗位字段
  -> 读取 data/inputs/简历/ 下的简历（Markdown 格式）
  -> DeepSeek 生成招呼语（根据岗位类型动态调整第三段内容）
  -> 输出到本地 runtime/输出结果/output.md
  -> 归档已处理文件
  -> 可选同步飞书
```

## 核心设计文档

项目核心的 AI Prompt 设计已摘录为独立文档，供理解和修改参考：

| 文件 | 内容 |
|------|------|
| `docs/PROMPTS_QWEN.md` | Qwen 图片 OCR / 文本解析的完整 prompt 设计 |
| `docs/PROMPTS_DEEPSEEK.md` | DeepSeek 招呼语生成的 prompt + 动态段落逻辑说明 |

详见各文件内的设计意图、调用位置、示例代码。

## 岗位类型说明

程序会根据岗位关键词自动判断类型，并调整招呼语中第三段的写作角度：

| 岗位类型 | 触发关键词（示例） | 第三段侧重 |
|----------|-------------------|-----------|
| `ib` | 投行、IPO、承销、保荐、尽职调查、再融资 | 投行项目职责与规模数据 |
| `invest` | 投资、投研、并购、基金、PE/VC、估值 | 数据分析、估值建模成果 |
| `ai` | AI、大模型、算法、产品、Agent | AI 工具实际使用经验 |
| `general` | 其他 | 最相关的核心工作成果 |

## 运行规则

- 文件名包含 `+` 时，视为已完成重命名，跳过重命名步骤
- API 调用失败时自动重试最多 2 次
- 飞书未配置时，不影响本地输出
- 重新分析：把文件从 `runtime/已分析JD/` 移回 `data/inputs/待分析JD/`

## 常见问题

### 提示"未找到简历文件"

将你的简历 PDF 放入 `data/inputs/简历/`，然后运行 `npm run init-resume`。

### 简历解析为 Markdown 后内容乱码或格式错误

可以手动编辑 `data/inputs/简历/` 下对应的 `.md` 文件，程序会优先读取已有的 `.md`。

### 结果没有写入飞书

检查 `.env` 中 `LARK_SPREADSHEET_TOKEN`、`LARK_SHEET_ID`、`LARK_CLI_PATH` 是否均已填写。未配置时程序只会跳过飞书同步，不影响本地结果。
