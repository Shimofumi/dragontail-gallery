# 八潮路結社ものおき代理（yashiojikessha）ゲーム配布ページ

やしおじさんのゲーム「ハルスベリヤ叙事詩２」を代理公開するページ。`dragontail.monster/yashiojikessha` で公開。
（もとは getuploader の https://uu.getuploader.com/yashiojikessha/download/209 で配布されていたもの）

---

## ファイル構成

```
src/pages/yashiojikessha/index.astro   # ページ本体（配布ファイル一覧もここに直書き）
src/layouts/Yashiojikessha.astro       # 専用レイアウト（ヘッダー・フッター独自）
public/yashiojikessha/                 # 配布ファイルの置き場（git 管理外）
  └── ハルスベリヤ叙事詩２(委託版).7z
public/styles/yashiojikessha.css       # 専用スタイルシート（tettougafu.css をベース。style.css には手を加えない）
```

`public/yashiojikessha/` は `.gitignore` で除外しているため、新しい PC では
`scripts/pull-assets-ftp.js` などでサーバーから取り戻す必要がある。

---

## 配布ファイルを追加・差し替えるとき

1. `public/yashiojikessha/` にファイルを配置
2. `src/pages/yashiojikessha/index.astro` の `items` 配列にエントリを追加

```typescript
{ title: "表示名", file: "ファイル名.7z", size: "約○MB" }
```

- ファイル名に全角文字や括弧があっても OK（`enc()` で URL エンコード済み）
3. `npm run ship` でデプロイ

---

## サイト本体との関係

- `misc/index.astro` の「■ ゲーム（代理公開）」セクションからリンクされている
- サイト本体のナビゲーション（ヘッダー）には掲載していない
- サイトマップには自動的に含まれる（除外設定なし）
- RSS への追加なし
