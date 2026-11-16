# RYOTA KATADA / PORTFOLIO - Design Document

## 1. Design Concept

"CRT Technical Monitor" -- レトロなブラウン管モニターの技術画面を模したビジュアルの中に、ポートフォリオ情報を配置する。画面中央では自作の3Dモデル(ゲーム機ガジェット)が静かに浮遊・回転し、両脇の情報パネルがハードウェアモニターのステータス表示のように並ぶ。装飾は抑え、情報密度とエフェクトの質感で見せるデザイン。

## 2. Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  RYOTA KATADA / DEVELOPER        DARK  BLOG (header 72px)│
├──────┬─────────────────────────────────┬────────────────┤
│      │                                 │                │
│ 230px│     Three.js Canvas (全面)       │  230px         │
│      │     GLB モデル 浮遊・自動回転      │                │
│  左  │                                 │  右            │
│  サイド│    scanlines + dither overlay   │  サイド         │
│  バー │                                 │  バー          │
│      │                                 │                │
├──────┴──────────┬──────────────────────┴────────────────┤
│  Built with …   │  ◀ MODEL NAME 1/2 ▶     © (footer 72px)│
└─────────────────┴───────────────────────────────────────┘
```

- 全体: `overflow: hidden` の固定レイアウト。スクロールなし(デスクトップ)
- Virtual Screen: ヘッダー/フッター/左右マージンで囲まれた領域に `1px solid var(--border)` の細い境界線。CRTの表示領域を示す
- マージン: 上下72px、左右64px(1000px以下で上下40px、左右16px)
- フッター中央: 3Dモデルセレクタ(前後ボタン + モデル名 + n/m カウンタ)

## 3. Layer Stack (z-index)

| z-index | Layer | Role |
|---------|-------|------|
| 0 | `#three-canvas` | WebGL 3Dシーン |
| 2 | `#overlay` | 情報パネル・ヘッダー・フッター(`pointer-events: none` で3Dと干渉しない) |
| 5 | `#sidebar-l`, `#sidebar-r` | パネル群(`pointer-events: auto` でリンククリック可) |
| 10 | `#exp-header`, `#model-selector` | タイトル表示・モデルセレクタ |
| 99 | `#dither` | ディザリングオーバーレイ |
| 100 | `#scanlines` | スキャンラインオーバーレイ |
| 9999 | `#loader` | 起動ローダー |

## 4. Color Palette

CSSカスタムプロパティで一元管理。ライト/ダークの2テーマを `body.dark-mode` クラスで切り替え、`localStorage`(`portfolio-theme`)に永続化。

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--bg` | `#f5f5f5` | `#0a0a0a` | ページ背景 |
| `--surface` | `#ffffff` | `#1a1a1a` | ボタン・パネル背景 |
| `--grid-dot` | `#e0e0e0` | `#1f1f1f` | 背景ドットグリッド |
| `--border` | `#e5e5e5` | `#262626` | パネル境界・区切り線 |
| `--border-hi` | `#d4d4d4` | `#404040` | スキルバー背景 |
| `--accent` | `#3b82f6` | `#60a5fa` | パネルヘッダー、リンク |
| `--accent-hover` | `#2563eb` | `#3b82f6` | ホバー、CAREER 年表 |
| `--accent-secondary` | `#6366f1` | `#818cf8` | スキルバー fill、WIP タグ |
| `--txt` | `#666666` | `#a3a3a3` | 補助テキスト |
| `--txt-br` | `#1a1a1a` | `#f5f5f5` | 本文テキスト |
| `--val` | `#0a0a0a` | `#fafafa` | 強調テキスト(名前、タイトル) |
| `--dim` | `#999999` | `#737373` | 最弱テキスト、カウンタ |

## 5. Typography

| Font | Variable | Usage |
|------|----------|-------|
| Share Tech Mono | `--fp`, `--fm` | 見出し、ローダー、年表、プロジェクト名、モデルセレクタ。テクニカルモニター感を演出 |
| Inter 300/400 | body `font-family` | 本文、フッタークレジット。可読性確保 |

`letter-spacing` を広めに取り、技術モニターの疎な表示を再現。

## 6. Visual Effects

### 6.1 Background - Dot Grid

```css
background:
    radial-gradient(circle, var(--grid-dot) 1px, transparent 1px) 0 0 / 24px 24px,
    var(--bg);
```

24pxグリッドで1pxの円形ドットを敷き詰め。方眼紙/エンジニアリングペーパーの質感。

### 6.2 Scanlines

4pxごとに opacity 0.015 の水平線。CRTモニターの走査線を再現。極めて薄く、意識しないと見えないレベル。

### 6.3 Dithering Overlay

4x4pxのチェッカーパターンが10秒かけてゆっくりスライド(`mix-blend-mode: overlay`)。レトロゲーム機のディザリング描画を模倣。

### 6.4 Rendering

- **Tone Mapping:** AgX(フィルム調のソフトなコントラスト)、exposure 1.05
- **Environment:** `RoomEnvironment` を PMREM 化して IBL に使用

## 7. 3D Scene

### Models — ランダムローテーション

自作モデルの GLB を `public/models/` に置き、`models.ts` のマニフェストに1行追加するとローテーションに加わる。

```ts
export const MODELS: ModelDef[] = [
    { path: '/models/gba.glb', label: 'GAME BOY ADVANCE', rotationY: -Math.PI / 2 },
    { path: '/models/gbc.glb', label: 'GAME BOY COLOR', fit: 1.35 },
];
```

- ページロード時にランダムに1体選択
- フッター中央のセレクタ(◀ / ▶)で手動切り替え。切り替え時はHUDが `LOADING...` 点滅 → 完了後モデル名表示
- `rotationY` で正面補正、`fit` で画面上の大きさを調整(デフォルト 1.5 world units)
- 切り替え時はスケール 0.85→1.0 のイージングでポップイン

### Material Treatment

- ボディ: 体積順に3層の半透明 `MeshPhysicalMaterial`(shell / mid / detail)を自動割り当て。ガラス様の存在感
- `screen` という名前のメッシュ: 黒色・クリアコートの画面マテリアルを適用
- 全メッシュに `EdgesGeometry` + `LineSegments2` の構造線(主要な可視要素)
- ダークモード時はエッジ色・不透明度・ライト強度を引き上げ

### Camera & Controls

- `PerspectiveCamera(FOV 24)` -- 望遠寄りで圧縮効果。初期位置 `(0, 0.5, 4.5)`
- OrbitControls: auto-rotate speed 0.5、damping 0.04、pan/zoom 無効、polar angle 0.3π-0.62π

### Lighting

| Light | Color | Intensity (Light / Dark) | Position |
|-------|-------|--------------------------|----------|
| Ambient | `#405570` | 2.0 / 3.0 | - |
| Key | `#c0d8f0` | 2.5 / 3.5 | (3, 5, 6) |
| Fill | `#90a8c8` | 1.5 / 2.5 | (-4, 2, 4) |

### Animation

- **ボビング:** `y = 0.05 + sin(t * 0.7) * 0.025` -- ゆっくりした上下浮遊
- **自動回転:** OrbitControls autoRotate(ドラッグ中は自動停止)

## 8. Information Panels

- 左: **SKILLS**(スキル名 + プログレスバー)、**CAREER**(タイムライン形式)
- 右: **PROJECTS**(名前リンク + 説明 + 技術タグ。WIP は `IN DEV` タグ付き・リンクなし)、**LINKS**(GitHub / X / Blog)
- パネル共通: 半透明背景 + blur、`1px solid var(--border)`、ヘッダーに pulse する dot indicator + 下線
- ホバーで `translateY(-2px)` + シャドウ

## 9. Loader

背景色 → "RYOTA KATADA / PORTFOLIO" + プログレスバー(GLB ロード進捗)+ "INITIALIZING..."(blink)。ロード完了 600ms 後に fadeout。初回ロードのみ表示し、モデル切り替え時は表示しない。

## 10. Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| > 1440px | トップのみ。文字の単位 `--text-u`(通常 1px)を幅に応じて `1 + (100vw - 1440px) × 0.00025`、上限 1.28 まで控えめに拡大する(1920px で 1.12倍、2560px で 1.28倍)。文字が使わなかった高さは余白に回す: 余白の単位 `--space-u`(通常 1px、上限 2.5)がサイドバーの内側の余白、パネルの間隔と内側の余白、項目の間隔、行間を広げる。ヘッダー/フッターの帯は変えない。サイドバー幅は `--sidebar-w`(230 × `--text-u` + パネルの余白が増えたぶん)。枠の幅 `--frame-w` は「モデル用に空ける帯 `--model-clear`(84vh)+ 両サイドバー」を目安に頭打ちにして中央に置く。キャンバスは全面のまま。高さの見積もりは `--fit-fixed` / `--fit-lines` / `--fit-space` で持ち、サイドバーが収まらないときは余白、次に文字の拡大を抑える。/things と /blog は基準値のまま |
| > 1440px かつ横長(15:8 以上) | 高さが足りないぶん横幅を使う。サイドバーを 340 × `--text-u`(+ 余白ぶん)に広げ、SKILLS は2列(名前の下にバー)、CAREER は年を役職の横に置く |
| 1000-1440px | フルレイアウト。サイドバー230px、マージン64px/72px |
| 768-1000px | サイドバー120px、マージン16px/40px、フォントサイズ縮小 |
| < 768px | 縦スクロール。ヘッダー固定 + 3Dキャンバス(60vh)+ モデルセレクタ + パネル群(SKILLS/LINKS 2カラム → CAREER → PROJECTS)+ フッター |

## 11. /things Page

好きなモノを並べる別ページ。トップと同じ CRT モニターの言語(ドットグリッド、スキャンライン、ディザ、`.panel`、Share Tech Mono)を使い、3D シーンは持たない。

- レイアウト: ヘッダー(トップと同じ、右側は DARK / ← HOME / BLOG)、`1px solid var(--border)` の仮想スクリーン枠の中にカードグリッド、フッター。ページ全体が縦スクロール
- グリッド: 1 カラム(〜640px)/ 2 カラム(640px〜)/ 3 カラム(1100px〜)
- カード(`.thing`): `.panel` を継承。写真(16:10、白背景、`object-fit: contain`、薄いスキャンライン)→ カテゴリタグ + 連番 → 名前(リンク、→)→ ひとこと(Inter)→ リンク行(`.link-row` 流用、ドメイン表示)
- データ: `things.ts` のマニフェスト(`THINGS: Thing[]`)に 1 件追加し、写真を `public/things/` に置くだけで増える。描画は `things-page.ts`
- テーマ: `localStorage` の `portfolio-theme` をトップと共有。初回描画前に `body.dark-mode` を付けてフラッシュを防ぐ
- 配信: `bun build ./index.html ./things.html` で `dist/things.html` を出力。Cloudflare Workers の assets は `/things` を `things.html` に解決する(`html_handling` 既定)

## 12. /blog Pages

microCMS で書いた記事の一覧(`/blog`)、記事ページ(`/blog/<記事ID>`)、RSS(`/blog/feed.xml`)。/things と同じ CRT モニターの言語を使い、3D シーンは持たない。記事ページは本文の読みやすさを優先する。

- レイアウト: ヘッダー、仮想スクリーン枠、フッターは /things と同じ。ページ全体が縦スクロール。ヘッダー左の `BLOG` は `/blog` へのリンク。大きい画面でも /things と同じく基準値のまま
- 一覧: グリッドは /things と同じ 1 / 2 / 3 カラム。カード(`.post`)は `.panel` を継承し、カテゴリタグ + 公開日 → タイトル(→)→ 概要(3 行まで)→ タグ。カード全体が記事へのリンク。アイキャッチ画像は使わない
- 記事: 枠の中央に最大幅 800px のシート(`.article`)を置き、その中に幅 720px の本文を置く。シートは `.panel` の色を不透明にしたもので、長い本文の背後にドットグリッドが出ない。下に前後の記事へのリンクを置く
- 文字: タイトルは Share Tech Mono。本文は Inter 16px、行間 1.9 で、1 行は全角 43 文字前後。本文中の見出しは Inter 600 で、h2 に四角のマーカーと下線、h3 に左のアクセント線(CAREER と同じ)を付ける。どちらのフォントにも日本語のグリフがないので、日本語に使うゴシック体を `--font-ja` で指定する
- コード: ビルド時に Shiki で色を付ける。色は `--code-*` の CSS 変数で持つので、ライト/ダークを切り替えるとコードの色も変わる。ファイル名と言語はブロック上部のバーに出す
- 画像: microCMS の画像 API で WebP に変換し、本文幅の 1 倍と 2 倍を `srcset` で出し分ける。元の幅より大きくはしない。`loading="lazy"`
- リンク: 外部サイトは別タブで開く。旧ブログ(kissa-katada.com)の記事へのリンクは `/blog/<記事ID>` に書き換える
- データ: ビルド時に microCMS の `blogs` API から全記事を取得する(`blog/microcms.ts`)。認証情報は `MICROCMS_SERVICE_DOMAIN` と `MICROCMS_API_KEY` で、手元の `.env` にだけ置く。ブラウザにも Worker にも渡さない。どちらかがないと、手元のビルドは足りない変数名を出してエラーで止まる。GitHub Actions のビルドにはキーがないので、ブログの生成をスキップして警告を出し、ほかのページだけをビルドする
- 生成: `blog/build.ts` が `dist/blog.html`、`dist/blog/<記事ID>.html`、`dist/blog/feed.xml`、`dist/blog.css` を書き出す。`blog.css` は `style.css` を取り込んだ 1 ファイル。ページは静的 HTML で、スクリプトはテーマ切り替えだけ
- アイキャッチ: microCMS の `eyecatch` が空の記事には、ビルドが画像を作って登録する(`blog/eyecatch.ts`)。画像は 1200×630 で、文字は入れない。絵柄はマーブル模様。青の濃淡の帯が、画面を横切る流れに沿って何層にも重なり、一部の帯の縁にアクセント色と白い線が入る。10px 四方のマスを 120×63 個並べて描き、色の階調は 4×4 の Bayer ディザで作る。青は `--accent`(`#3b82f6`)と同じ系列の 9 色で、濃い紺から白に近い水色まで。アクセントはピンク、赤、オレンジ、アンバー、緑、シアン、紫の 7 色で、1 枚に暖色 2 色と寒色 2 色を使う。赤・アンバー・緑は `design-tokens.css` のステータス色(ダークモードの値)。残りの 4 色も、それと同じ明るさの色を選んだ。記事 ID を乱数の種にするので、同じ記事はいつも同じ絵になる
- アイキャッチの登録: 作った画像を microCMS のメディアにアップロードし(マネジメント API)、その記事の `eyecatch` に登録する(`blogs` の PATCH)。ビルドが microCMS に書き込むのは、このアップロードと登録だけで、専用のキー `MICROCMS_WRITE_API_KEY` を使う。このキーも手元の `.env` に置く。キーがないときは、画像の生成も登録もせずにビルドを続ける。`eyecatch` がある記事には書き込まない。一覧を取得したあとに人が設定したアイキャッチも上書きしないように、アップロードの直前と PATCH の直前に、その記事を取得し直して確かめる。microCMS には条件付きの更新がないので、最後の確認から PATCH までの一瞬に設定されたアイキャッチは上書きされうる。書き込みに失敗するとビルドはエラーで止まり、次のビルドは `eyecatch` が空のまま残った記事から続ける。microCMS はこの登録を記事の改訂として扱う。登録した日が公開日と違うと、次のビルドから記事ページの UPDATED にその日が出る。`bun run eyecatch:dry-run` は、microCMS に書き込まずに同じ画像を `out/eyecatch/` に書き出す。記事 ID を引数に渡すと、認証情報がなくても動く
- 開発: `bun run dev` は同じファイルをリクエストのたびに描画する(`blog/dev.ts`)。microCMS から取得した記事は 60 秒間キャッシュする
- テーマ: `localStorage` の `portfolio-theme` をほかのページと共有する
- 配信: Cloudflare Workers の assets が `/blog` を `blog.html` に、`/blog/<記事ID>` を `blog/<記事ID>.html` に解決する

## 13. Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun (`Bun.serve()` + HTML imports) |
| 3D | Three.js (GLTFLoader / LineSegments2 / RoomEnvironment) |
| Styling | Vanilla CSS (CSS Custom Properties) |
| Blog | microCMS (記事。ビルド時に取得) / Shiki (コードの色付け) |
| Deploy | Cloudflare Workers (static assets via wrangler) |
| Build | `bun ./blog/build.ts && bun build ./index.html ./things.html --outdir ./dist && cp -r ./public/* ./dist/` |
