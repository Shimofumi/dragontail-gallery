# 鉄踏楽府（tettougafu）音楽配布ページ

竹槍さんの音楽素材を代理公開するページ。`dragontail.monster/tettougafu` に公開済み。

---

## ファイル構成

```
src/pages/tettougafu/index.astro   # ページ本体（楽曲データもここに直書き）
src/layouts/Tettougafu.astro       # 専用レイアウト（ヘッダー・フッター独自）
public/tettougafu/
  ├── omake/                       # 楽曲 MP3（.wav 含む）の置き場
  │   └── *.mp3 / *.wav
  └── musics.zip                   # 全曲まとめ ZIP
public/styles/tettougafu.css       # 専用スタイルシート（style.css には手を加えない）
```

---

## 楽曲を追加・変更するとき

1. `public/tettougafu/omake/` に MP3 を配置
2. `src/pages/tettougafu/index.astro` の `tracks` 配列にエントリを追加

```typescript
// 通常曲
{ title: "曲名", file: BASE + "filename.mp3" }
```

- ファイル名にスペースや記号があっても OK（`enc()` で URL エンコード済み）
- `BASE` は `/tettougafu/omake/` を指している
- WAV ファイルもそのまま使用可（`rockyloadinthedark.wav` が例）

3. ZIP を更新して `public/tettougafu/musics.zip` を差し替える
4. `npm run ship` でデプロイ

---

## ページ構成

```
ヘッダー「鉄踏楽府」
├── 代理公開告知ボックス（ピンク左ボーダー）
├── 利用規約ボックス
├── 楽曲リスト（タイトル + <audio controls preload="none">）
└── 全曲入りzip テキストリンク + 注記
フッター「鉄踏楽府」 ＋ dragontail.monster へのリンク
```

---

## サイト本体との関係

- `misc/index.astro` の「■ 音楽素材（代理公開）」セクションからリンクされている
- サイト本体のナビゲーション（ヘッダー）には掲載していない
- サイトマップには自動的に含まれる（除外設定なし）
- RSS への追加なし
