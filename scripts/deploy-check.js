// ship（deploy）したら何が起きるかを、サーバーを一切変更せずに確認するスクリプト
//   npm run build してから  node scripts/deploy-check.js
// 判定ロジックは deploy-ftp.js と同じ（パス＋ファイルサイズで比較）
import * as ftp from 'basic-ftp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
config({ path: path.join(projectRoot, '.env') });

const LOG_FILE = path.join(projectRoot, 'deploy-check.tmp');
fs.writeFileSync(LOG_FILE, '');
for (const k of ['log', 'error']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => { orig(...a); fs.appendFileSync(LOG_FILE, a.join(' ') + '\n'); };
}

const LOCAL_DIR = path.join(projectRoot, 'dist');
const REMOTE_DIR = (process.env.FTP_REMOTE_PATH || '/public_html').replace(/\/+$/, '');

function getLocalFiles(dir, base = dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) getLocalFiles(p, base, out);
    else out.push({ rel: path.relative(base, p).replace(/\\/g, '/'), size: st.size });
  }
  return out;
}

async function getRemoteFiles(client, dir, rel = '', out = []) {
  await client.cd(dir);
  for (const e of await client.list()) {
    if (e.name === '.' || e.name === '..') continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory) await getRemoteFiles(client, `${dir}/${e.name}`, r, out);
    else out.push({ rel: r, size: e.size });
  }
  return out;
}

const topOf = r => r.includes('/') ? r.split('/')[0] + '/' : '(直下)';
function summary(list) {
  const c = {};
  for (const f of list) c[topOf(f.rel)] = (c[topOf(f.rel)] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `     ${k} ${v}件`).join('\n');
}

async function main() {
  if (!fs.existsSync(LOCAL_DIR)) { console.error('❌ dist/ がありません。先に npm run build してください'); process.exit(1); }
  const client = new ftp.Client();
  client.ftp.timeout = 120000;
  try {
    await client.access({
      host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASSWORD,
      port: parseInt(process.env.FTP_PORT) || 21, secure: process.env.FTP_SECURE === 'true',
    });
    console.log(`🔍 比較先: ${REMOTE_DIR}\n`);
    const local = getLocalFiles(LOCAL_DIR);
    const remote = await getRemoteFiles(client, REMOTE_DIR);
    const rmap = new Map(remote.map(f => [f.rel, f]));
    const lset = new Set(local.map(f => f.rel));
    // deploy-ftp.js と同じ判定（テキスト系は前回デプロイ時のハッシュとも比較）
    let manifest = null;
    try { manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, '.deploy-manifest.json'), 'utf-8')); } catch {}
    const TEXT_EXTS = new Set(['.html', '.xml', '.css', '.js', '.json', '.txt', '.svg', '.webmanifest']);
    const hash = rel => crypto.createHash('sha1').update(fs.readFileSync(path.join(LOCAL_DIR, rel))).digest('hex');
    if (!manifest) console.log('ℹ️  前回デプロイの記録がないため、テキスト系ファイルは全件アップロード扱いになります\n');
    const up = local.filter(f => {
      if (!rmap.has(f.rel) || rmap.get(f.rel).size !== f.size) return true;
      if (TEXT_EXTS.has(path.extname(f.rel).toLowerCase())) return !manifest || manifest[f.rel] !== hash(f.rel);
      return false;
    });
    const del = remote.filter(f => !lset.has(f.rel));

    console.log(`📊 手元 ${local.length}件 / サーバー ${remote.length}件`);
    console.log(`   アップロード（新規・変更）: ${up.length}件`);
    if (up.length) console.log(summary(up));
    console.log(`   🗑️ 削除される: ${del.length}件`);
    if (del.length) console.log(summary(del));
    console.log('\n---- アップロード一覧（先頭100件）----');
    up.slice(0, 100).forEach(f => console.log('  ⬆ ' + f.rel));
    console.log('\n---- 削除一覧（全件）----');
    del.forEach(f => console.log('  ✖ ' + f.rel));
    console.log('\n✅ 確認のみ。サーバーは一切変更していません。');
  } catch (e) {
    console.error('❌ エラー:', e.message); process.exit(1);
  } finally { client.close(); }
}
main();
