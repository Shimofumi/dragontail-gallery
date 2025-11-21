import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// 環境変数読み込み
config();

const LOCAL_DIR = './dist';
const REMOTE_DIR = process.env.FTP_REMOTE_PATH || '/public_html';

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
    
    const toUpload = [];
    for (const local of localFiles) {
      const remote = remoteMap.get(local.remote);
      if (!remote || remote.size !== local.size) {
        toUpload.push(local);
      }
    }
    
    const localPaths = new Set(localFiles.map(f => f.remote));
    const toDelete = remoteFiles.filter(f => !localPaths.has(f.remote));
    
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