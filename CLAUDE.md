# CLAUDE.md — dragontail-gallery

しもふみのイラストギャラリー兼ポートフォリオサイト。Astro 製の完全静的サイト。

**サイト URL:** https://dragontail.monster

---

## NSFW コンテンツの分離について

**NSFW 作品（R18/R18G タグ）および炯炯イネズ名義のコンテンツは、すべて別サイト [kekesha.com](https://kekesha.com) に移行済み。**

- 新サイトのソースは `E:\Github\kekesha\`（Astro プロジェクト）
- このリポジトリ（dragontail-gallery）には NSFW ギャラリー・NSFW ダウンロードページは存在しない
- `/picture/*.md` に NSFW 作品の MD ファイルは残存しているが（URL は維持）、ギャラリーやサイトマップには出現しない
- 健全側（dragontail.monster）から kekesha.com へのリンクは一切置かない
- kekesha.com から dragontail.monster へのリンクも一切置かない

---

## ディレクトリ構成

```
dragontail-gallery/
├── public/                  # そのまま配信される静的アセット
│   ├── artworks/            # 本体画像（フル解像度）
│   ├── thumbnails/          # ギャラリーサムネイル
│   ├── ogp/                 # OGP 用プレビュー画像（1200×630px）
│   ├── downloads/           # SFW ダウンロードコンテンツ（伺かゴースト・シェル）
│   ├── nsfw-downloads/      # NSFW ダウンロードコンテンツ
│   ├── styles/style.css     # サイト全体の CSS（単一ファイル）
│   ├── dialog_icons/        # キャラクターアイコン
│   └── robots.txt
├── scripts/
│   ├── deploy-ftp.js        # FTP 差分デプロイスクリプト
│   └── generate-md.js       # 絵日記 MD ファイル生成ヘルパー
├── src/
│   ├── assets/              # ソース SVG アセット
│   ├── components/
│   │   ├── Dialog.astro     # キャラクターダイアログ
│   │   ├── GalleryGrid.astro # ギャラリーグリッド表示
│   │   └── Pagination.astro # ページネーション
│   ├── layouts/
│   │   ├── Layout.astro     # 全ページ共通ベースレイアウト
│   │   ├── Artwork.astro    # 作品詳細ページレイアウト
│   │   └── Article.astro    # 記事・レビューページレイアウト
│   └── pages/               # Astro ファイルベースルーティング
│       ├── index.astro      # 年齢確認スプラッシュページ
│       ├── contact.astro    # 連絡先ページ
│       ├── tags.astro       # SFW タグ一覧
│       ├── rss.xml.ts       # SFW RSS フィード
│       ├── nsfw-rss.xml.ts  # NSFW RSS フィード
│       ├── gallery/[page].astro       # SFW ギャラリー（ページネーション）
│       ├── tags/[tag]/[page].astro    # SFW タグ別ギャラリー
│       ├── picture/                   # 作品ごとの MD ファイル（281 件以上）
│       │   └── 0251*.md ～ 0608*.md
│       ├── nsfw-gallery/              # NSFW ギャラリー一式
│       ├── downloads/                 # SFW ダウンロード一覧
│       ├── nsfw-downloads/            # NSFW ダウンロード一覧
│       └── misc/                      # 記事・ゲームレビュー
├── astro.config.mjs
├── tsconfig.json
├── package.json
└── .env                     # FTP 認証情報（git 管理外）
```

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | Astro 5.x（完全静的出力） |
| 言語 | TypeScript（strict モード） |
| MDX | `@astrojs/mdx` — 記事ページで使用 |
| RSS | `@astrojs/rss` — SFW/NSFW 別フィード |
| サイトマップ | `@astrojs/sitemap` — SFW コンテンツのみ出力 |
| スタイル | CSS（`/public/styles/style.css` 単一ファイル） |
| デプロイ | `basic-ftp` による FTP 差分アップロード |

---

## ページ構成

### SFW

| URL | ファイル | 内容 |
|-----|---------|------|
| `/` | `index.astro` | 年齢確認スプラッシュ |
| `/gallery/[page]` | `gallery/[page].astro` | ページネーション付きギャラリー（18件/ページ） |
| `/tags` | `tags.astro` | タグ一覧（クライアントサイドフィルタ付き） |
| `/tags/[tag]/[page]` | `tags/[tag]/[page].astro` | タグ別ギャラリー |
| `/picture/[slug]` | `picture/*.md` | 作品詳細（前後ナビ付き） |
| `/downloads/list` | `downloads/list.astro` | SFW ダウンロード一覧 |
| `/misc/` | `misc/index.astro` + `*.md/*.mdx` | 記事・ゲームレビュー |
| `/contact` | `contact.astro` | 連絡先 |
| `/rss.xml` | `rss.xml.ts` | SFW RSS |

### NSFW（R18/R18G タグが付いた作品）

| URL | 内容 |
|-----|------|
| `/nsfw-gallery/gallery/[page]` | NSFW ギャラリー |
| `/nsfw-gallery/tags` | NSFW タグ一覧 |
| `/nsfw-gallery/tags/[tag]/[page]` | NSFW タグ別ギャラリー |
| `/nsfw-downloads/list` | NSFW ダウンロード一覧 |
| `/nsfw-rss.xml` | NSFW RSS |

---

## レイアウトの仕組み

### Layout.astro（全ページ共通ベース）

Props: `title`, `description?`, `image?`, `url?`, `isNSFW?`

- HTML メタタグ・OGP タグを出力
- SFW/NSFW に応じて RSS リンクを切り替え
- `isNSFW=true` の場合、ナビゲーションに「18+」バッジを表示
- ヘッダーナビ（ギャラリー・ダウンロード・misc）とフッターを含む
- `<slot />` で各ページのコンテンツを受け取る

### Artwork.astro（作品詳細レイアウト）

Props: `frontmatter`（`ArtworkFrontmatter` 型）

- Layout.astro を継承
- 作品タイトル・説明・本体画像・追加画像を表示
- タグをリンク付きで表示（`/tags/[tag]/1` へ誘導）
- 前後の作品へのナビゲーション（日付ソート、SFW/NSFW を分離して処理）
- `src/pages/picture/*.md` の frontmatter で `layout: ../../layouts/Artwork.astro` を指定して使用

### Article.astro（記事・レビューレイアウト）

Props: `frontmatter`（`ArticleFrontmatter` 型）

- Layout.astro を継承
- カテゴリ（games / articles）、投稿日、バナー画像、外部リンクを表示
- `src/pages/misc/*.md` / `*.mdx` で使用

### 作品 MD のフロントマター例

```yaml
layout: ../../layouts/Artwork.astro
title: "作品タイトル"
date: "2024-06-08"
image: "/artworks/0608xxxx.jpg"
additionalImages:
  - "/artworks/0608xxxx_2.jpg"
tags: ["キャラ名", "R18"]  # R18 または R18G タグで NSFW 判定
```

---

## ビルドコマンド

```bash
npm run dev      # 開発サーバー起動（localhost:4321、ホットリロード）
npm run build    # 本番ビルド → ./dist/ に出力
npm run preview  # dist/ をローカルでプレビュー
npm run deploy   # FTP 差分デプロイ（要 .env）
npm run ship     # build + deploy を一括実行
```

---

## コンテンツ追加の流れ

### 作品を追加する

1. `public/artworks/` に本体画像を配置
2. `public/thumbnails/` にサムネイルを配置
3. `public/ogp/` に OGP 画像を配置
4. `src/pages/picture/NNNN作品名.md` を作成してフロントマターを記述
5. `npm run ship` でビルド＆デプロイ

ファイル名の NNNN は作品通し番号（例: `0609`）。`scripts/generate-md.js` でテンプレート生成可能。

---

## 注意事項

### SFW / NSFW 分離

- NSFW の判定はファイルの場所ではなく **frontmatter の `tags` フィールドで行う**（`R18` または `R18G` タグの有無）
- サイトマップは SFW コンテンツのみ出力（`astro.config.mjs` の `filter` で除外）
- RSS も SFW/NSFW で別ファイル（`/rss.xml` と `/nsfw-rss.xml`）

### デプロイ

- `.env` に FTP 認証情報が必要（`.env.example` を参照）
- `deploy-ftp.js` はファイルサイズ比較による差分アップロードを行う（変更のないファイルはスキップ）
- リモートに存在してローカルにないファイルは自動削除される

### スタイル

- CSS は `/public/styles/style.css` の単一ファイルで管理
- CSS フレームワーク・CSS Modules・Tailwind などは不使用

### TypeScript

- `astro/tsconfigs/strict` ベースの strict モード
- 型定義は各レイアウトの frontmatter インターフェースとして定義している

### 作品ファイルの読み込み

- `import.meta.glob()` で `src/pages/picture/*.md` を一括読み込み
- `getStaticPaths()` で全作品の静的ルートを生成
- Astro のページネーション機能（`paginate()`）を使用
