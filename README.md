# Boss 直聘招呼语生成器

职位截图，自动提取岗位信息、匹配简历，并生成可直接使用的 Boss 直聘打招呼话术。

## 适用场景

- 由于Boss直聘、猎聘等国内求职网站反爬虫机制很强，所以主要通过截图拿到职位信息
- 希望快速生成更贴合岗位的招呼语，更容易引起HR方关注
- 把历史结果自动归档，并可选同步到飞书

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 `.env`

```bash
DEEPSEEK_API_KEY=你的DeepSeek API密钥
QWEN_API_KEY=你的Qwen API密钥

# 可选：飞书同步
LARK_SPREADSHEET_TOKEN=你的表格Token
LARK_SHEET_ID=你的SheetID
LARK_CLI_PATH=C:/Users/你的用户名/AppData/Roaming/npm/node_modules/@larksuite/cli/scripts/run.js
```

### 3. 准备输入文件

- 待分析职位文件放到 `data/inputs/待分析JD/`
- 支持格式：`.png`、`.jpg`、`.jpeg`、`.txt`、`.json`
- 简历文件放到 `data/inputs/简历/`

### 4. 运行

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

启动后用 `Win + Shift + S` 截图，程序会自动把图片保存到输入目录并触发分析。分析完成后招呼语自动写入剪贴板，可直接粘贴。按 `ESC` 退出监听模式

## 输出位置

- 文本结果：`runtime/输出结果/output.md`
- 已处理文件：`runtime/已分析JD/`
- 控制台会实时打印本次分析结果
- 配置飞书后可自动追加到电子表格

## 目录结构

```text
JS/
├── analyze.js
├── clipboard-watch.js
├── greeting-examples.txt
├── src/
│   ├── cli.js
│   └── lib/
├── data/
│   └── inputs/
│       ├── 待分析JD/
│       └── 简历/
└── runtime/
    ├── 已分析JD/
    ├── 输出结果/
    └── session.json
```

## 工作流程

```text
职位截图或文本
  -> Qwen 提取结构化岗位字段
  -> 根据岗位类型（ai / ib / invest / general）选择简历
  -> DeepSeek 生成招呼语（第三段内容根据岗位类型动态调整）
  -> 输出到本地
  -> 归档已处理文件
  -> 可选同步飞书
```

## 运行规则

- 文件名包含 `+` 时，视为已完成重命名，跳过重命名步骤
- API 调用失败时会自动重试最多 2 次
- 飞书未配置时，不影响本地输出
- 需要重新分析时，把文件从 `runtime/已分析JD/` 移回 `data/inputs/待分析JD/`

## 入口说明

- [analyze.js](c:/Users/user/Desktop/Claude%20Cowork/JS/analyze.js) 是统一启动入口
- [src/cli.js](c:/Users/user/Desktop/Claude%20Cowork/JS/src/cli.js) 负责组织主流程

## 简历与样本说明

- 程序默认从 `data/inputs/简历/` 读取简历
- 若同名 `.md` 不存在，会尝试从 `.pdf` 自动生成
- [greeting-examples.txt](c:/Users/user/Desktop/Claude%20Cowork/JS/greeting-examples.txt) 用于提供招呼语风格参考

### 岗位类型与简历对应关系

| 岗位类型 | 触发关键词（示例） | 使用简历 |
|---|---|---|
| `ib` | 投行、IPO、承销、保荐、尽职调查、再融资 | 简历 投行方向.pdf |
| `invest` | 投资、投研、并购、基金、PE/VC、估值 | 简历 投融资.pdf |
| `ai` | AI、大模型、算法、产品、运营 | 简历 AI方向.pdf |
| `general` | 其他 | 简历 AI方向.pdf（兜底） |

## 常见问题

### 没有识别到文件

确认文件是否放在 `data/inputs/待分析JD/`，并且扩展名属于支持格式。

### 结果没有写入飞书

先检查 `LARK_SPREADSHEET_TOKEN`、`LARK_SHEET_ID` 和 `LARK_CLI_PATH` 是否配置正确。未配置时程序只会跳过飞书同步，不会影响本地结果。