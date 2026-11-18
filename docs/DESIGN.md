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
- 右: **WORK**(仕事の事例のカード)、**PROJECTS**(名前リンク + 説明 + 技術タグ。WIP は `IN DEV` タグ付き・リンクなし)、**LINKS**(GitHub / X / Blog)
- WORK: 右のサイドバーの先頭に置く。カード 1 枚は事例のタイトル(→)と 1〜2 行の要約で、PROJECTS と同じく区切り線で分ける。カード全体が事例のページ(`/work/<名前>`)へのリンク。`/work` へのリンクは、パネルのヘッダーの右端に `ALL →` として置き、行を増やさない。タイトルと要約は日本語なので、`--font-ja`(`style.css`)で日本語のゴシック体を指定し、パネルに `lang="ja"` を付ける。要約は `work/cases.ts` の `summary` の写しで、`work/work.test.ts` が食い違いを検出する
- パネル共通: 半透明背景 + blur、`1px solid var(--border)`、ヘッダーに pulse する dot indicator + 下線
- ホバーで `translateY(-2px)` + シャドウ

## 9. Loader

背景色 → "RYOTA KATADA / PORTFOLIO" + プログレスバー(GLB ロード進捗)+ "INITIALIZING..."(blink)。ロード完了 600ms 後に fadeout。初回ロードのみ表示し、モデル切り替え時は表示しない。

## 10. Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| > 1440px | トップのみ。文字の単位 `--text-u`(通常 1px)を幅に応じて `1 + (100vw - 1440px) × 0.00025`、上限 1.28 まで控えめに拡大する(1920px で 1.12倍、2560px で 1.28倍)。文字が使わなかった高さは余白に回す: 余白の単位 `--space-u`(通常 1px、上限 2.5)がサイドバーの内側の余白、パネルの間隔と内側の余白、項目の間隔、行間を広げる。ヘッダー/フッターの帯は変えない。サイドバー幅は `--sidebar-w`(230 × `--text-u` + パネルの余白が増えたぶん)。枠の幅 `--frame-w` は「モデル用に空ける帯 `--model-clear`(84vh)+ 両サイドバー」を目安に頭打ちにして中央に置く。キャンバスは全面のまま。高さの見積もりは `--fit-fixed` / `--fit-lines` / `--fit-space` で持ち、サイドバーが収まらないときは余白、次に文字の拡大を抑える。見積もりの値は高いほうのサイドバーで測る。WORK を足してからは右のほうが高い。/things、/blog、/work は基準値のまま |
| > 1440px かつ横長(15:8 以上) | 高さが足りないぶん横幅を使う。サイドバーを 340 × `--text-u`(+ 余白ぶん)に広げ、SKILLS は2列(名前の下にバー)、CAREER は年を役職の横に置く |
| 1000-1440px | フルレイアウト。サイドバー230px、マージン64px/72px。画面の高さが足りないときは、サイドバーの中が縦にスクロールする(スクロールバーは出さない)。右は高さ 1020px ほど、左は 900px ほどを下回るとスクロールする |
| 768-1000px | サイドバー120px、マージン16px/40px、フォントサイズ縮小 |
| < 768px | 縦スクロール。ヘッダー固定 + 3Dキャンバス(60vh)+ モデルセレクタ + パネル群(WORK を全幅 → SKILLS/LINKS 2カラム → CAREER → PROJECTS)+ フッター |

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
- 一覧: グリッドは /things と同じ 1 / 2 / 3 カラム。カード(`.post`)は `.panel` を継承し、アイキャッチ → カテゴリタグ + 公開日 → タイトル(→)→ 概要(3 行まで)→ タグ。カード全体が記事へのリンク。アイキャッチは /things の写真と同じく、カードの左右の端まで広げ、下に区切り線を引く。枠の比率は 1200:630 で、画像の比率が違うときは中央を切り抜いて枠を埋める。アイキャッチがない記事も同じ枠を残し、ページ色の地に `NO SIGNAL` と出す。こうすると、同じ行のカードで文字の位置がそろう
- 記事: 枠の中央に最大幅 800px のシート(`.article`)を置き、その中に幅 720px の本文を置く。シートは `.panel` の色を不透明にしたもので、長い本文の背後にドットグリッドが出ない。アイキャッチがある記事は、シートの上端に左右の端まで 1200:630 で置き、その下にカテゴリ、日付、タイトルを続ける。アイキャッチがない記事には何も置かない。下に前後の記事へのリンクを置く
- 文字: タイトルは Share Tech Mono。本文は Inter 16px、行間 1.9 で、1 行は全角 43 文字前後。本文中の見出しは Inter 600 で、h2 に四角のマーカーと下線、h3 に左のアクセント線(CAREER と同じ)を付ける。どちらのフォントにも日本語のグリフがないので、日本語に使うゴシック体を `--font-ja` で指定する
- コード: ビルド時に Shiki で色を付ける。色は `--code-*` の CSS 変数で持つので、ライト/ダークを切り替えるとコードの色も変わる。ファイル名と言語はブロック上部のバーに出す
- 画像: microCMS の画像 API で AVIF と WebP を作り、`<picture>` で出す。AVIF に対応したブラウザは AVIF を、それ以外のブラウザは WebP を読み込む。幅は `srcset` で出し分ける。本文は 720px、1080px、1440px(本文幅の 1 倍、1.5 倍、2 倍)、アイキャッチは一覧のカードで 400px、600px、800px、記事で 800px、1200px、1600px。`sizes` には、表示される幅を、余白が変わる画面幅の区切りごとに書く。元の幅より大きくはしない。画像 API は、元より大きい幅を指定すると拡大した画像を返すためである。`width` と `height` を付けて、読み込む前から枠の高さを決めておく。`<picture>` は `display: contents` でボックスを作らず、`<img>` だけのときと同じ配置にする。アイキャッチの alt は記事のタイトルにする
- 画像を読み込む順: 記事のアイキャッチは最初の画面に入るので遅延させず、`fetchpriority="high"` を付ける。アイキャッチがない記事では、本文の最初の画像を遅延させず、`fetchpriority="high"` を付ける。元の HTML に `loading="lazy"` があっても外す。本文のほかの画像は `loading="lazy"`。一覧では、多くの画面で最初に見える 6 枚(3 列なら 2 行、2 列なら 3 行)を遅延させず、1 枚目に `fetchpriority="high"` を付ける。7 枚目からは `loading="lazy"`
- 共有: 記事ページの `og:image` と `twitter:image` にアイキャッチを使う。どのサービスでも表示できる JPEG にして、幅は 1200px までに縮める。600×315 以上なら `twitter:card` を `summary_large_image` に、それより小さければ `summary` にする。小さい画像を大きいカードに引き伸ばさないためである。アイキャッチがない記事と一覧には付けない
- リンク: 外部サイトは別タブで開く。旧ブログ(kissa-katada.com)の記事へのリンクは `/blog/<記事ID>` に書き換える
- データ: ビルド時に microCMS の `blogs` API から全記事を取得する(`blog/microcms.ts`)。認証情報は `MICROCMS_SERVICE_DOMAIN` と `MICROCMS_API_KEY` で、手元では `.env` に、デプロイのワークフローでは GitHub Secrets に置く。ブラウザにも Worker にも渡さない。どちらかがないときや記事を取得できないときは、手元でも GitHub Actions でもビルドがエラーで止まる。GitHub Actions ではデプロイもしないので、本番の `/blog` は前回のまま残る
- 更新: microCMS で記事を公開・更新・公開終了・削除すると、Webhook(`repository_dispatch`)でデプロイのワークフローが起動する(`docs/DEPLOY.md`)
- 生成: `blog/build.ts` が `dist/blog.html`、`dist/blog/<記事ID>.html`、`dist/blog/feed.xml`、`dist/blog.css` を書き出す。`blog.css` は `style.css` を取り込んだ 1 ファイル。ページは静的 HTML で、スクリプトはテーマ切り替えだけ
- アイキャッチ: microCMS の `eyecatch` が空の記事には、ビルドが画像を作って登録する(`blog/eyecatch.ts`)。画像は 1200×630 で、文字は入れない。絵柄はマーブル模様。濃淡の帯が、画面を横切る流れに沿って何層にも重なり、一部の帯の縁にアクセント色と、紙の白の細い線が入る。地の色は、墨色から紙の白(`--bg` の `#f5f5f5`)までのなめらかな階調で、中間だけが青い。この青は `--accent`(`#3b82f6`)と同じ色相で、彩度を 3 分の 1 ほどに落としてある。青く見える部分は、平均で画像の半分ほどになる。アクセントはアンバー(`#e3a03a`)とコーラル(`#dd6650`)の 2 色で、`design-tokens.css` の warning と error の彩度を落とした色。1 枚に使うのは 1 色か 2 色。3px 四方の点を 400×210 個並べて描き、点ごとに明るさを最大で ±18(255 段階のうち)ずらして、フィルムのような粒状感を出す。アクセントの縁も、点の単位でまばらになって消える。記事 ID を乱数の種にするので、粒の出方も含めて、同じ記事はいつも同じ絵になる
- アイキャッチの登録: 作った画像を microCMS のメディアにアップロードし(マネジメント API)、その記事の `eyecatch` に登録する(`blogs` の PATCH)。登録できた画像は、同じビルドで書き出す一覧と記事ページにも出す。ビルドが microCMS に書き込むのは、このアップロードと登録だけで、専用のキー `MICROCMS_WRITE_API_KEY` を使う。このキーも、手元では `.env` に、デプロイのワークフローでは GitHub Secrets に置く。キーがないときは、画像の生成も登録もせずにビルドを続ける。`eyecatch` がある記事には書き込まない。一覧を取得したあとに人が設定したアイキャッチも上書きしないように、アップロードの直前と PATCH の直前に、その記事を取得し直して確かめる。この取得は毎回、過去に一度も使っていない URL で行う。絞り込み条件を「作成日時が、乱数で決めた過去の日時より後で、乱数で決めた遠い未来の日時より前」にして URL を変える。この条件はどの記事にも当てはまる。microCMS の CDN は同じ URL への応答をキャッシュするので、前のビルドや並行するビルドのときの古い応答で判断しないためである。microCMS には条件付きの更新がないので、最後の確認から PATCH までの一瞬に設定されたアイキャッチは上書きされうる。書き込みに失敗するとビルドはエラーで止まり、次のビルドは `eyecatch` が空のまま残った記事から続ける。microCMS はこの登録を記事の改訂として扱う。登録した日が公開日と違うと、次のビルドから記事ページの UPDATED にその日が出る。`bun run eyecatch:dry-run` は、microCMS に書き込まずに同じ画像を `out/eyecatch/` に書き出す。記事 ID を引数に渡すと、認証情報がなくても動く
- 開発: `bun run dev` は同じファイルをリクエストのたびに描画する(`blog/dev.ts`)。microCMS から取得した記事は 60 秒間キャッシュする
- テーマ: `localStorage` の `portfolio-theme` をほかのページと共有する
- 配信: Cloudflare Workers の assets が `/blog` を `blog.html` に、`/blog/<記事ID>` を `blog/<記事ID>.html` に解決する

## 13. /work Pages

仕事の事例の一覧(`/work`)と、事例ごとのページ(`/work/<名前>`)。/blog と同じ CRT モニターの言語を使い、3D シーンは持たない。

- レイアウト: ヘッダー、仮想スクリーン枠、フッターは /blog と同じ。ページ全体が縦スクロール。ヘッダー左の `WORK` は `/work` へのリンク。大きい画面でも /things と /blog と同じく基準値のまま
- 一覧: 枠の中央に、記事のシートと同じ最大幅 800px の列を置く。列の中に事例のカード(`.case`)を並べ、その下に「この2件を支えているボット運用」の節をシートで置く。カードは `.panel` を継承し、`CASE 01` のタグ → タイトル(→)→ 要約。カード全体が事例のページへのリンク。グリッドは 1 カラム(〜640px)/ 2 カラム(640px〜)
- 事例のページ: /blog の記事と同じシート(`.sheet`)に、`CASE 01` のタグとタイトルを置き、本文は「先方の困りごと」「やったこと」「いまどうなったか」の 3 節。本文の組み方(Inter 16px、行間 1.9、幅 720px、h2 に四角のマーカーと下線)も記事と同じ。下に前後の事例へのリンクを置く
- 文章: 確認済みの原稿のとおりにする。原稿から変えるのは、「本人」を「私」にすることと、事例を見出しの名前(大手人材会社向けの人材紹介データベース、ベンチャーキャピタル向けCRM)で呼ぶことだけ。客先名と客先のシステム名は出さない。カードの要約は原稿の文から抜き出して作り、原稿にない事実は書かない
- データ: `work/cases.ts` の `CASES` に事例を、`OPERATIONS` にボット運用の節を持つ。事例を 1 件足すと、一覧のカードとページが増える。トップの WORK パネル(8. Information Panels)は `index.html` に手で足す
- 生成: `work/build.ts` が `dist/work.html`、`dist/work/<名前>.html`、`dist/work.css` を書き出す。`work.css` は `style.css` を取り込んだ 1 ファイル。ページは静的 HTML で、スクリプトはテーマ切り替えだけ
- 開発: `bun run dev` は同じファイルをリクエストのたびに描画する(`work/site.ts`)
- テーマ: `localStorage` の `portfolio-theme` をほかのページと共有する
- 配信: Cloudflare Workers の assets が `/work` を `work.html` に、`/work/<名前>` を `work/<名前>.html` に解決する。/blog と同じ仕組みなので、`worker.ts` と `wrangler.jsonc` は変えていない

## 14. Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun (`Bun.serve()` + HTML imports) |
| 3D | Three.js (GLTFLoader / LineSegments2 / RoomEnvironment) |
| Styling | Vanilla CSS (CSS Custom Properties) |
| Blog | microCMS (記事。ビルド時に取得) / Shiki (コードの色付け) |
| Deploy | Cloudflare Workers (static assets via wrangler) |
| Build | `bun ./blog/build.ts && bun ./work/build.ts && bun build ./index.html ./things.html --outdir ./dist && cp -r ./public/* ./dist/` |
