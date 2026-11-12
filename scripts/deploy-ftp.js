import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config } from 'dotenv';
import { execFileSync } from 'child_process';
import * as readline from 'readline';

// 環境変数読み込み
config();

const LOCAL_DIR = './dist';
const REMOTE_DIR = process.env.FTP_REMOTE_PATH || '/public_html';

// テキスト系ファイル（HTML など）はサイズが同じでも中身が変わることがある
// （例: ギャラリーの並び順だけ変わった場合）。そのため前回デプロイ時の
// 中身のハッシュを .deploy-manifest.json に記録しておき、中身で比較する。
// マニフェストが無い（初回・新しい PC）場合はテキスト系を全件アップロードする。
const MANIFEST_PATH = './.deploy-manifest.json';
const TEXT_EXTS = new Set(['.html', '.xml', '.css', '.js', '.json', '.txt', '.svg', '.webmanifest']);
const isText = rel => TEXT_EXTS.has(path.extname(rel).toLowerCase());
const hashFile = p => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')); } catch { return null; }
}

// サーバーから消そうとしているファイルのうち、Git 管理外（.gitignore 対象）のものを返す。
// 作品画像・配布物・代理公開ファイルなどは Git で同期されないため、
// 「別の PC で追加したものがこの PC に無いだけ」ということがあり得る。
// そういうファイルは削除前に必ず確認する。
function findGitIgnored(remotePaths) {
  if (remotePaths.length === 0) return new Set();
  try {
    const out = execFileSync('git', ['-c', 'core.quotepath=false', 'check-ignore', '--stdin', '-z', '--no-index'], {
      input: remotePaths.map(p => `public/${p}`).join('\0'),
      encoding: 'utf-8',
    });
    return new Set(out.split('\0').filter(Boolean).map(p => p.replace(/^public\//, '')));
  } catch (err) {
    if (err.status === 1) return new Set(); // 該当なし
    console.warn('⚠️  git check-ignore に失敗したため、削除予定のファイルをすべて確認対象にします');
    return new Set(remotePaths);
  }
}

// y/N で確認する（対話できない環境では N 扱い）
function askYesNo(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => {
    rl.close();
    resolve(/^y(es)?$/i.test(ans.trim()));
  }));
}

// 接続設定
const ftpConfig = {
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASSWORD,
  port: parseInt(process.env.FTP_PORT) || 21,
  secure: process.env.FTP_SECURE === 'true',
};

// ローカルファイルを再帰的に取得
function getLocalFiles(dir, fileList = [], baseDir = dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getLocalFiles(filePath, fileList, baseDir);
    } else {
      const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
      fileList.push({
        local: filePath,
        remote: relativePath,
        size: stat.size
      });
    }
  });
  
  return fileList;
}

// リモートファイル一覧を取得
async function getRemoteFiles(client, dir, fileList = [], baseDir = dir) {
  try {
    const files = await client.list(dir);
    
    for (const file of files) {
      if (file.name === '.' || file.name === '..') continue;
      
      const remotePath = `${dir}/${file.name}`.replace(/\/+/g, '/');
      
      if (file.isDirectory) {
        await getRemoteFiles(client, remotePath, fileList, baseDir);
      } else {
        const relativePath = remotePath.replace(baseDir + '/', '');
        fileList.push({
          remote: relativePath,
          size: file.size
        });
      }
    }
  } catch (err) {
    if (err.code === 550) {
      return fileList;
    }
    throw err;
  }
  
  return fileList;
}

// ディレクトリを再帰的に作成（改良版）
async function ensureRemoteDir(client, relativePath) {
  if (!relativePath || relativePath === '.' || relativePath === '/') {
    return;
  }
  
  const parts = relativePath.split('/').filter(p => p);
  let currentPath = REMOTE_DIR;
  
  for (const part of parts) {
    currentPath = `${currentPath}/${part}`.replace(/\/+/g, '/');
    
    try {
      // ディレクトリの存在確認
      await client.list(currentPath);
    } catch (err) {
      // ディレクトリが存在しない場合は作成
      try {
        await client.ensureDir(currentPath);
        console.log(`  📁 ディレクトリ作成: ${currentPath.replace(REMOTE_DIR + '/', '')}`);
      } catch (mkdirErr) {
        // 既に存在する場合は無視
        if (mkdirErr.code !== 550) {
          console.warn(`  ⚠️  ディレクトリ作成警告: ${currentPath} - ${mkdirErr.message}`);
        }
      }
    }
  }
}

// 空のディレクトリを削除
async function removeEmptyDirs(client, dir, baseDir = dir) {
  try {
    const files = await client.list(dir);
    const realFiles = files.filter(f => f.name !== '.' && f.name !== '..');
    
    for (const file of realFiles) {
      if (file.isDirectory) {
        const remotePath = `${dir}/${file.name}`.replace(/\/+/g, '/');
        await removeEmptyDirs(client, remotePath, baseDir);
        
        const contents = await client.list(remotePath);
        const realContents = contents.filter(f => f.name !== '.' && f.name !== '..');
        
        if (realContents.length === 0) {
          await client.removeDir(remotePath);
          console.log(`  🗑️  空ディレクトリ削除: ${remotePath.replace(baseDir + '/', '')}`);
        }
      }
    }
  } catch (err) {
    // エラーは無視
  }
}

// メイン処理
async function deploy() {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  
  // タイムアウト設定を長めに
  client.ftp.timeout = 60000; // 60秒
  
  try {
    console.log('🔌 FTPサーバーに接続中...');
    await client.access(ftpConfig);
    console.log('✅ 接続成功\n');
    
    console.log('📂 ローカルファイルをスキャン中...');
    const localFiles = getLocalFiles(LOCAL_DIR);
    console.log(`  ${localFiles.length}個のファイルを検出\n`);
    
    console.log('🌐 リモートファイルをスキャン中...');
    await client.cd(REMOTE_DIR);
    const remoteFiles = await getRemoteFiles(client, REMOTE_DIR);
    console.log(`  ${remoteFiles.length}個のファイルを検出\n`);
    
    const remoteMap = new Map(remoteFiles.map(f => [f.remote, f]));
    
    const manifest = loadManifest();
    if (!manifest) console.log('ℹ️  前回デプロイの記録がないため、HTML などテキスト系ファイルは全件アップロードします\n');
    const newManifest = {};
    const toUpload = [];
    for (const local of localFiles) {
      const remote = remoteMap.get(local.remote);
      let changed = !remote || remote.size !== local.size;
      if (isText(local.remote)) {
        local.hash = hashFile(local.local);
        newManifest[local.remote] = local.hash;
        if (!manifest || manifest[local.remote] !== local.hash) changed = true;
      }
      if (changed) toUpload.push(local);
    }
    
    const localPaths = new Set(localFiles.map(f => f.remote));
    let toDelete = remoteFiles.filter(f => !localPaths.has(f.remote));

    // Git 管理外のファイルをサーバーから消す場合は、アップロード前に確認する
    const ignored = findGitIgnored(toDelete.map(f => f.remote));
    const ignoredDeletes = toDelete.filter(f => ignored.has(f.remote));
    if (ignoredDeletes.length > 0) {
      console.log('⚠️  Git 管理外のファイルがサーバーから削除されようとしています。');
      console.log('   別の PC で追加したファイルが、この PC に無いだけかもしれません。');
      for (const f of ignoredDeletes) console.log(`  - ${f.remote}`);
      if (!process.stdin.isTTY) console.log('  （確認できない環境のため、これらは削除しません）');
      const ok = await askYesNo(`\nこれら ${ignoredDeletes.length} 個をサーバーから削除しますか？ [y/N] `);
      if (ok) {
        console.log('→ 削除します\n');
      } else {
        toDelete = toDelete.filter(f => !ignored.has(f.remote));
        console.log('→ 削除せずにサーバーに残します\n');
      }
      // 確認を待っている間に FTP 接続が切れている可能性があるので、つなぎ直す
      client.close();
      await client.access(ftpConfig);
      await client.cd(REMOTE_DIR);
    }
    
    console.log(`📊 差分分析結果:`);
    console.log(`  アップロード: ${toUpload.length}個`);
    console.log(`  削除: ${toDelete.length}個`);
    console.log(`  変更なし: ${localFiles.length - toUpload.length}個\n`);
    
    if (toUpload.length > 0) {
      console.log('⬆️  アップロード中...\n');
      
      let uploaded = 0;
      const total = toUpload.length;
      const startTime = Date.now();
      
      for (const file of toUpload) {
        try {
          const remotePath = `${REMOTE_DIR}/${file.remote}`.replace(/\/+/g, '/');
          const remoteDir = path.dirname(file.remote);
          
          // ディレクトリを確実に作成
          if (remoteDir && remoteDir !== '.') {
            await ensureRemoteDir(client, remoteDir);
          }
          
          // ファイルアップロード
          await client.uploadFrom(file.local, remotePath);
          
          uploaded++;
          const percent = ((uploaded / total) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          
          // 10ファイルごと、または最後のファイルで進捗表示
          if (uploaded % 10 === 0 || uploaded === total) {
            console.log(`  [${uploaded}/${total}] (${percent}%) - ${elapsed}s経過`);
          }
        } catch (uploadErr) {
          delete newManifest[file.remote]; // 失敗分は次回もう一度アップロードさせる
          console.error(`  ❌ アップロード失敗: ${file.remote}`);
          console.error(`     エラー: ${uploadErr.message}`);
          
          // エラーが出ても続行
          uploaded++;
        }
      }
      
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ アップロード完了（${totalTime}秒）\n`);
    }
    
    if (toDelete.length > 0) {
      console.log('🗑️  不要なファイルを削除中...');
      for (const file of toDelete) {
        const remotePath = `${REMOTE_DIR}/${file.remote}`.replace(/\/+/g, '/');
        try {
          await client.remove(remotePath);
          console.log(`  削除: ${file.remote}`);
        } catch (err) {
          console.warn(`  削除失敗（スキップ）: ${file.remote}`);
        }
      }
      
      await removeEmptyDirs(client, REMOTE_DIR);
      console.log('✅ 削除完了\n');
    }
    
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(newManifest, null, 0));
    console.log('🎉 デプロイ完了！');
    
  } catch (err) {
    console.error('❌ エラー:', err.message);
    if (client.ftp.verbose) {
      console.error(err);
    }
    process.exit(1);
  } finally {
    client.close();
  }
}

deploy();