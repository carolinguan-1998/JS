import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'fs';
import { extname, join } from 'path';
import { ARCHIVED_DIR, EXAMPLE_STYLE_FILE, INPUT_DIR, OUTPUT_DIR } from './config.js';


export function ensureRuntimeDirs() {
  mkdirSync(INPUT_DIR, { recursive: true });
  mkdirSync(ARCHIVED_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

export function loadInputFiles() {
  const exts = ['.txt', '.json', '.png', '.jpg', '.jpeg'];
  return readdirSync(INPUT_DIR).filter(file => exts.includes(extname(file).toLowerCase()));
}

export function readExampleStyle() {
  return existsSync(EXAMPLE_STYLE_FILE) ? readFileSync(EXAMPLE_STYLE_FILE, 'utf-8') : '';
}

export function renameJDFile(oldName, shortName, ext) {
  if (oldName.includes('+')) return oldName;

  const safe = shortName.replace(/[\/\\:*?"<>|]/g, '').trim();
  if (!safe) return oldName;

  let newName = `${safe}${ext}`;
  if (newName === oldName) return oldName;

  let newPath = join(INPUT_DIR, newName);
  if (existsSync(newPath)) {
    let i = 2;
    while (existsSync(join(INPUT_DIR, `${safe}(${i})${ext}`))) i++;
    newName = `${safe}(${i})${ext}`;
    newPath = join(INPUT_DIR, newName);
  }

  renameSync(join(INPUT_DIR, oldName), newPath);
  return newName;
}

export function archiveProcessedFile(fileName) {
  renameSync(join(INPUT_DIR, fileName), join(ARCHIVED_DIR, fileName));
}
