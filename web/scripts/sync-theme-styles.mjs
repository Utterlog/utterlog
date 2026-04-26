#!/usr/bin/env node
/**
 * 把 web/themes/<T>/styles.css 同步到 web/public/themes/<T>/styles.css
 *
 * 为什么要这个 script：
 *   1. Next.js 主题 CSS 通过 `<link rel="stylesheet" href="/themes/<T>/styles.css">`
 *      加载，URL 必须落在 public/ 下才能由 Next 静态服务命中。
 *   2. 主题 source（开发者编辑入口）放在 web/themes/<T>/styles.css。
 *   3. 之前用过 symlink 让 public 那份指向 source —— dev 完美但生产 docker
 *      镜像的 runner stage 只 COPY /app/public，symlink 解析不到 /app/themes/
 *      → 生产 404 → CSS 全丢 → 图片巨大覆盖页面。
 *   4. 现在改回真实文件副本：source 是唯一编辑入口，本 script 把改动同步
 *      到 public。npm `predev` / `prebuild` 钩子自动跑，开发者改完 source
 *      启动 dev / build 时自动同步，不会忘。
 *
 * 行为：
 *   - 跳过：source 不存在 → 警告但不退出
 *   - 跳过：内容一致 → 静默跳过（避免 mtime 抖动让 Next watcher 误重启）
 *   - 复制：内容不一致或 public 不存在 → 复制
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..'); // web/
const SRC_DIR = join(ROOT, 'themes');
const PUBLIC_DIR = join(ROOT, 'public', 'themes');

if (!existsSync(SRC_DIR)) {
  console.warn(`[sync-theme-styles] missing ${SRC_DIR}, skip`);
  process.exit(0);
}

const themes = readdirSync(SRC_DIR).filter((name) => {
  const p = join(SRC_DIR, name);
  return statSync(p).isDirectory();
});

let copied = 0;
let skipped = 0;

for (const t of themes) {
  const src = join(SRC_DIR, t, 'styles.css');
  const dest = join(PUBLIC_DIR, t, 'styles.css');
  if (!existsSync(src)) continue;
  if (existsSync(dest)) {
    try {
      const a = readFileSync(src);
      const b = readFileSync(dest);
      if (a.equals(b)) {
        skipped++;
        continue;
      }
    } catch {
      // fall through to copy
    }
  }
  // Make sure public/themes/<T>/ exists (it does by convention but be safe).
  // Use copyFileSync — if dest is a symlink, this will overwrite the link
  // target, which is what we want when migrating away from symlink layout.
  copyFileSync(src, dest);
  copied++;
  console.log(`[sync-theme-styles] ${t}: src → public`);
}

if (copied === 0) {
  console.log(`[sync-theme-styles] all ${skipped} theme(s) up-to-date`);
}
