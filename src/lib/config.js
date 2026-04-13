import { config } from 'dotenv';
import { join } from 'path';

config();

export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.Deepseek_API_KEY;
export const QWEN_API_KEY = process.env.QWEN_API_KEY;
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/chat/completions';
export const DEEPSEEK_MODEL = 'deepseek-chat';

export const DATA_DIR = './data';
export const INPUTS_DIR = './data/inputs';
export const INPUT_DIR = join(INPUTS_DIR, '待分析JD');
export const RESUMES_DIR = join(INPUTS_DIR, '简历');
export const RUNTIME_DIR = './runtime';
export const ARCHIVED_DIR = join(RUNTIME_DIR, '已分析JD');
export const OUTPUT_DIR = join(RUNTIME_DIR, '输出结果');
export const OUTPUT_FILE = join(OUTPUT_DIR, 'output.md');
export const EXAMPLE_STYLE_FILE = './docs/greeting-examples.txt';

export const LARK_SPREADSHEET_TOKEN = process.env.LARK_SPREADSHEET_TOKEN;
export const LARK_SHEET_ID = process.env.LARK_SHEET_ID;
export const LARK_CLI_PATH = process.env.LARK_CLI_PATH;
