import fs from 'fs';
import path from 'path';

const artworksDir = './public/artworks';
const pictureDir = './src/pages/picture';

// artworksフォルダ内の画像ファイルを取得
const files = fs.readdirSync(artworksDir).filter(file => 
  /\.(jpg|jpeg|png)$/i.test(file)
);

let created = 0;
let skipped = 0;

files.forEach(file => {
  const basename = path.basename(file, path.extname(file));
  const mdPath = path.join(pictureDir, `${basename}.md`);
  
  // 既に存在する場合はスキップ
  if (fs.existsSync(mdPath)) {
    skipped++;
    return;
  }
  
  // 画像ファイルの作成日時を取得
  const stats = fs.statSync(path.join(artworksDir, file));
  const date = stats.birthtime.toISOString().split('T')[0];
  
  // mdファイルの内容を生成
  const content = `---
layout: ../../layouts/Artwork.astro
title: ""
date: "${date}"
image: "/artworks/${file}"
tags: []
---

`;
  
  // ファイルを書き込み
  fs.writeFileSync(mdPath, content, 'utf8');
  created++;
  console.log(`作成: ${basename}.md`);
});

console.log(`\n完了: ${created}件作成, ${skipped}件スキップ`);