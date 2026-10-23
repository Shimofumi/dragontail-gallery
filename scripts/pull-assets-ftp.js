// サーバー（FTP）から git 管理外の素材フォルダを public/ に取り戻すスクリプト
//
//   node scripts/pull-assets-ftp.js            … 確認だけ（何もダウンロードしない）
//   node scripts/pull-assets-ftp.js --go       … 実際にダウンロード
//   node scripts/pull-assets-ftp.js --go ogp   … 特定フォルダだけ
//
// ・手元に同じサイズのファイルがあればスキップ（何度実行しても安全）
// ・Astro がビルドで生成する index.html はスキップ（public/ に入れるとページと衝突するため）
// ・サーバー側のファイルは一切変更・削除しない（読み取りのみ）
import * as ftp from 'basic-ftp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
config({ path: path.join(projectRoot, '.env') });

// 画面表示と同じ内容を pull-log.tmp にも書き出す（Claude が結果を読めるように）
const LOG_FILE = path.join(projectRoot, 'pull-log.tmp');
fs.writeFileSync(LOG_FILE, '');
for (const k of ['log', 'error', 'warn']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => { orig(...a); fs.appendFileSync(LOG_FILE, a.join(' ') + '\n'); };
}

const REMOTE_DIR = (process.env.FTP_REMOTE_PATH || '/public_html').replace(/\/+$/, '');
const PUBLIC_DIR = path.join(projectRoot, 'public');

// .gitignore で除外している素材フォルダ
const TARGETS = ['artworks', 'thumbnails', 'ogp', 'downloads', 'nsfw-downloads', 'misc', 'tettougafu'];

const args = process.argv.slice(2);
const GO = args.includes('--go');
const picked = args.filter(a => !a.startsWith('--'));
const targets = picked.length > 0 ? picked : TARGETS;

const ftpConfig = {
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASSWORD,
  port: parseInt(process.env.FTP_PORT) || 21,
  secure: process.env.FTP_SECURE === 'true',
};

const mb = n => (n / 1024 / 1024).toFixed(1) + 'MB';

// リモートを再帰的に列挙（cd してから list することで日本語・スペース入りのパスにも対応）
async function listRemote(client, remoteDir, rel = '', out = { files: [], skipped: [] }) {
  await client.cd(remoteDir);
  const entries = await client.list();
  for (const e of entries) {
    if (e.name === '.' || e.name === '..') continue;
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory) {
      await listRemote(client, `${remoteDir}/${e.name}`, relPath, out);
    } else if (e.name === 'index.html') {
      out.skipped.push(relPath);
    } else {
      out.files.push({ dir: remoteDir, name: e.name, rel: relPath, size: e.size });
    }
  }
  return out;
}

async function main() {
  if (!ftpConfig.host || !ftpConfig.user || !ftpConfig.password) {
    console.error('❌ .env に FTP_HOST / FTP_USER / FTP_PASSWORD を設定してください（.env.example 参照）');
    process.exit(1);
  }

  const client = new ftp.Client();
  client.ftp.timeout = 120000;
  try {
    console.log('🔌 FTPサーバーに接続中...');
    await client.access(ftpConfig);
    console.log('✅ 接続成功\n');

    // サーバー直下の一覧（取り戻し対象以外に素材フォルダがないか目視確認用）
    await client.cd(REMOTE_DIR);
    const top = await client.list();
    console.log(`📂 サーバー直下 (${REMOTE_DIR}):`);
    for (const e of top) {
      if (e.name === '.' || e.name === '..') continue;
      const mark = TARGETS.includes(e.name) ? '★取り戻し対象' : '';
      console.log(`   ${e.isDirectory ? '[DIR] ' : '      '}${e.name} ${mark}`);
    }
    console.log('');

    let totalDl = 0, totalBytes = 0, totalSame = 0;
    const failed = [];

    for (const t of targets) {
      const remoteBase = `${REMOTE_DIR}/${t}`;
      let listing;
      try {
        listing = await listRemote(client, remoteBase, t);
      } catch (err) {
        console.log(`⚠️  ${t}/ はサーバーに見つかりません（スキップ）\n`);
        continue;
      }

      const toGet = [];
      let same = 0;
      for (const f of listing.files) {
        const local = path.join(PUBLIC_DIR, ...f.rel.split('/'));
        if (fs.existsSync(local) && fs.statSync(local).size === f.size) { same++; continue; }
        toGet.push({ ...f, local });
      }
      const bytes = toGet.reduce((s, f) => s + f.size, 0);
      console.log(`📁 ${t}/  サーバー ${listing.files.length}件 / 取得 ${toGet.length}件 (${mb(bytes)}) / 手元と同じ ${same}件 / index.htmlスキップ ${listing.skipped.length}件`);
      totalSame += same;

      if (!GO) continue;

      for (const f of toGet) {
        try {
          fs.mkdirSync(path.dirname(f.local), { recursive: true });
          await client.cd(f.dir);
          await client.downloadTo(f.local, f.name);
          totalDl++; totalBytes += f.size;
          if (totalDl % 20 === 0) console.log(`   ...${totalDl}件 (${mb(totalBytes)})`);
        } catch (err) {
          failed.push(`${f.rel} : ${err.message}`);
        }
      }
      console.log(`   ✅ ${t}/ 完了`);
    }

    console.log('');
    if (!GO) {
      console.log('ℹ️  確認のみ実行しました。ダウンロードするには --go を付けて再実行してください。');
    } else {
      console.log(`🎉 ダウンロード ${totalDl}件 (${mb(totalBytes)}) / スキップ ${totalSame}件`);
      if (failed.length) {
        console.log(`\n❌ 失敗 ${failed.length}件（もう一度 --go で再実行すると失敗分だけ取り直します）:`);
        failed.forEach(x => console.log('   ' + x));
      }
    }
  } catch (err) {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
