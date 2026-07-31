/**
 * new-artwork.js
 * artworks/ 内の未登録画像を検出し、MD テンプレートの生成と
 * main/additionalImages の判別を行う。
 *
 * 使い方:
 *   node scripts/new-artwork.js            # 未登録画像のレポート表示
 *   node scripts/new-artwork.js --write    # MD ファイルを実際に書き出す
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const ARTWORKS_DIR = path.join(projectRoot, 'public', 'artworks');
const PICTURE_DIR  = path.join(projectRoot, 'src', 'pages', 'picture');
const IMAGE_EXTS   = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// ---- ユーティリティ ----

function getPrefix(filename) {
  const m = filename.match(/^(\d{4})/);
  return m ? m[1] : null;
}

// ベース名の末尾が _数字 で終わる → additionalImages らしい
function looksLikeAdditional(basename) {
  return /_\d+$/.test(basename);
}

// MD フロントマターの簡易パース
function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    if (kv[1] === 'tags') {
      const tags = kv[2].match(/"([^"]+)"/g);
      fm.tags = tags ? tags.map(t => t.replace(/"/g, '')) : [];
    } else {
      fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
  }
  return fm;
}

// ---- 既存 MD を読み込んでタグ辞書を構築 ----

const existingMds = new Map(); // basename → { tags, title }
for (const f of fs.readdirSync(PICTURE_DIR).filter(f => f.endsWith('.md'))) {
  const basename = path.basename(f, '.md');
  const content  = fs.readFileSync(path.join(PICTURE_DIR, f), 'utf8');
  existingMds.set(basename, parseFrontmatter(content));
}

// ---- 未登録画像を検出 ----

const artworkFiles = fs.readdirSync(ARTWORKS_DIR)
  .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
  .sort();

const unregistered = artworkFiles.filter(
  f => !existingMds.has(path.basename(f, path.extname(f)))
);

if (unregistered.length === 0) {
  console.log('✅ 未登録の画像はありません');
  process.exit(0);
}

// ---- プレフィックスでグループ化 ----

const groups = {};
for (const file of unregistered) {
  const prefix = getPrefix(file);
  if (!prefix) { console.log(`⚠️  プレフィックス不明（スキップ）: ${file}`); continue; }
  (groups[prefix] ??= []).push(file);
}

// ---- 既存 MD からタグを候補として提案 ----

function suggestTags(keyword) {
  const kw = keyword.toLowerCase();
  const tally = new Map();
  for (const [basename, fm] of existingMds) {
    if (!basename.toLowerCase().includes(kw)) continue;
    for (const tag of (fm.tags ?? [])) {
      tally.set(tag, (tally.get(tag) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag]) => tag);
}

// ---- レポート & MD 生成 ----

const todayDate  = new Date().toISOString().split('T')[0];
const today      = `${todayDate}T22:00:00+09:00`;
const args       = process.argv.slice(2);
const writeFiles = args.includes('--write');

console.log(`\n📋 未登録の画像: ${unregistered.length}件\n`);

for (const [prefix, files] of Object.entries(groups)) {
  // 同プレフィックスの MD が既に存在する → 追加画像
  const existingMdForPrefix = [...existingMds.keys()].filter(k => k.startsWith(prefix));

  if (existingMdForPrefix.length > 0) {
    console.log(`[${prefix}] 📎 追加画像（既存作品: ${existingMdForPrefix.join(', ')}）`);
    for (const f of files) {
      console.log(`  → 既存 MD の additionalImages に追記: "/artworks/${f}"`);
    }
    console.log();
    continue;
  }

  // 新規作品グループ
  const mainFiles       = files.filter(f => !looksLikeAdditional(path.basename(f, path.extname(f))));
  const mainFile        = mainFiles[0] ?? files[0]; // 候補がなければ先頭
  // mainFile は additionals から除外する
  const additionalFiles = files.filter(f =>  looksLikeAdditional(path.basename(f, path.extname(f))) && f !== mainFile);
  const mainBase        = path.basename(mainFile, path.extname(mainFile));

  // キャラ名: 先頭の数字とアンダースコアを除去
  const charKeyword    = mainBase.replace(/^\d+[_]?/, '').replace(/_\d+$/, '');
  const suggestedTags  = suggestTags(charKeyword);

  console.log(`[${prefix}] 🆕 新規作品`);
  console.log(`  メイン画像  : ${mainFile}`);
  if (additionalFiles.length > 0) {
    console.log(`  追加画像    : ${additionalFiles.join(', ')}`);
  }
  console.log(`  キャラ名推定: "${charKeyword}"`);
  console.log(`  タグ候補    : ${suggestedTags.length ? suggestedTags.join(', ') : '（合致なし）'}`);

  const addlBlock = additionalFiles.length > 0
    ? `additionalImages:\n${additionalFiles.map(f => `  - "/artworks/${f}"`).join('\n')}\n`
    : '';

  const mdContent =
`---
layout: ../../layouts/Artwork.astro
title: "${charKeyword}"
date: "${today}"
image: "/artworks/${mainFile}"
${addlBlock}tags: [${suggestedTags.map(t => `"${t}"`).join(', ')}]
---

`;

  const mdPath = path.join(PICTURE_DIR, `${mainBase}.md`);

  if (writeFiles) {
    if (fs.existsSync(mdPath)) {
      console.log(`  ⚠️  既に存在するためスキップ: ${mainBase}.md`);
    } else {
      fs.writeFileSync(mdPath, mdContent, 'utf8');
      console.log(`  ✅ MD 作成: ${mainBase}.md`);
    }
  } else {
    console.log(`\n  --- MD テンプレートプレビュー ---`);
    console.log(mdContent.replace(/^/gm, '  '));
  }
  console.log();
}

if (!writeFiles) {
  console.log('💡 --write を付けると MD ファイルを実際に書き出します');
  console.log('   node scripts/new-artwork.js --write');
}
