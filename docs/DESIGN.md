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
| > 1000px | フルレイアウト。サイドバー230px、マージン64px/72px |
| 768-1000px | サイドバー120px、マージン16px/40px、フォントサイズ縮小 |
| < 768px | 縦スクロール。ヘッダー固定 + 3Dキャンバス(60vh)+ モデルセレクタ + パネル群(SKILLS/LINKS 2カラム → CAREER → PROJECTS)+ フッター |

## 11. Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun (`Bun.serve()` + HTML imports) |
| 3D | Three.js (GLTFLoader / LineSegments2 / RoomEnvironment) |
| Styling | Vanilla CSS (CSS Custom Properties) |
| Deploy | Cloudflare Workers (static assets via wrangler) |
| Build | `bun build ./index.html --outdir ./dist && cp -r ./public/* ./dist/` |
