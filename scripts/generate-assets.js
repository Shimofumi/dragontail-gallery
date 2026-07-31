import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const ARTWORKS_DIR = path.join(projectRoot, 'public', 'artworks');
const THUMBS_DIR   = path.join(projectRoot, 'public', 'thumbnails');
const OGP_DIR      = path.join(projectRoot, 'public', 'ogp');

const THUMB_LONG_EDGE = 200;
const OGP_WIDTH       = 1200;
const OGP_HEIGHT      = 630;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const args      = process.argv.slice(2);
const force     = args.includes('--force');
const thumbOnly = args.includes('--thumb');
const ogpOnly   = args.includes('--ogp');
const doThumb   = !ogpOnly;
const doOgp     = !thumbOnly;
// フラグ以外の引数はファイル名として扱う（artworks/ 内のファイル名）
const targetFiles = args.filter(a => !a.startsWith('--'));

function listImages(dir) {
  const all = fs.readdirSync(dir)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort();
  if (targetFiles.length > 0) {
    return all.filter(f => targetFiles.includes(f));
  }
  return all;
}

async function generateThumbs(files) {
  console.log('\n📐 サムネイル生成...');
  let created = 0, skipped = 0;
  for (const file of files) {
    const ext      = path.extname(file);
    const basename = path.basename(file, ext);
    const destName = `${basename}_thumb${ext}`;
    const src  = path.join(ARTWORKS_DIR, file);
    const dest = path.join(THUMBS_DIR, destName);

    if (!force && fs.existsSync(dest)) { skipped++; continue; }

    await sharp(src)
      .resize(THUMB_LONG_EDGE, THUMB_LONG_EDGE, { fit: 'inside', withoutEnlargement: true })
      .toFile(dest);
    console.log(`  ✓ ${destName}`);
    created++;
  }
  console.log(`  → 作成: ${created}件、スキップ: ${skipped}件`);
}

async function generateOgp(files) {
  console.log('\n🖼  OGP生成 (1200×630, attention クロップ)...');
  let created = 0, skipped = 0;
  for (const file of files) {
    const ext      = path.extname(file);
    const basename = path.basename(file, ext);
    const destName = `${basename}_ogp${ext}`;
    const src  = path.join(ARTWORKS_DIR, file);
    const dest = path.join(OGP_DIR, destName);

    if (!force && fs.existsSync(dest)) { skipped++; continue; }

    await sharp(src)
      .resize(OGP_WIDTH, OGP_HEIGHT, { fit: 'cover', position: 'attention' })
      .toFile(dest);
    console.log(`  ✓ ${destName}`);
    created++;
  }
  console.log(`  → 作成: ${created}件、スキップ: ${skipped}件`);
}

const files = listImages(ARTWORKS_DIR);
console.log(`🔍 artworks/ : ${files.length}件の画像を検出`);
console.log(`   オプション: force=${force}, thumb=${doThumb}, ogp=${doOgp}`);

if (doThumb) await generateThumbs(files);
if (doOgp)   await generateOgp(files);

console.log('\n✅ 完了！');
