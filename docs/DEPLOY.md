# 自動デプロイ

`main` に push（PR のマージを含む）すると、GitHub Actions が Cloudflare Workers へ自動で公開します。
定義は [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) です。

## 動作

1. `bun install --frozen-lockfile`
2. `bun run build`（`dist/` を生成）
3. `bun run deploy`（`wrangler deploy`。手元で実行するのと同じコマンド）

- 手動で実行したいときは、GitHub の **Actions → Deploy → Run workflow** から起動できます。
- ブログの記事は、`bun run build` の中で microCMS から取得します。microCMS で記事を公開・更新しただけではサイトは変わらず、次のデプロイで反映されます。
- 同時に走るデプロイは1本だけです。実行中に次の push が来た場合、実行中のものは最後まで走り、新しいものはその後に実行されます。
- ビルドが失敗した場合はデプロイされません。

## Secret の登録

リポジトリに次の4つの Secret が必要です。Cloudflare の2つが未登録のままだと、デプロイのステップが認証エラーで失敗します。microCMS の2つが未登録のままだと、ビルドのステップがエラーで止まります。

| Secret 名 | 内容 | 使うステップ |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 下記の権限で作成した API トークン | デプロイ |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID | デプロイ |
| `MICROCMS_SERVICE_DOMAIN` | microCMS のサービスドメイン（`xxx.microcms.io` の `xxx`） | ビルド |
| `MICROCMS_API_KEY` | microCMS の API キー | ビルド |

### 1. API トークンを作成する

1. Cloudflare ダッシュボードの **My Profile → API Tokens → Create Token** を開く。
2. **Create Custom Token** を選び、次の権限だけを付ける。

   | 種別 | 権限 | 対象 |
   | --- | --- | --- |
   | Account | Workers Scripts : Edit | このサイトのアカウントのみ |
   | Zone | Workers Routes : Edit | `esp-9.dev` のみ |

   - Zone 側の権限は、`wrangler.jsonc` の `routes` でカスタムドメイン（`esp-9.dev` / `www.esp-9.dev`）を設定しているために付けています。
   - **Account Resources** と **Zone Resources** は「All」ではなく、該当のアカウントとゾーンに絞ってください。
   - KV・R2・D1 などは使っていないので、それらの権限は不要です。
3. トークンを作成し、表示された値をコピーする（一度しか表示されません）。

初回の実行が権限不足（`Authentication error` など）で失敗した場合は、ログに出た API のパスを確認し、足りない権限だけを追加してください。
テンプレートの **Edit Cloudflare Workers** でも動きますが、不要な権限まで含まれます。

### 2. アカウント ID を確認する

Cloudflare ダッシュボードの **Workers & Pages** の右側に表示される **Account ID** をコピーします。

### 3. microCMS の API キーを用意する

ブログのページは、ビルド時に microCMS の `blogs` API から取得した記事で作ります。

- API キーは、`blogs` API の GET を許可したものを使います。ビルドは記事を読むだけなので、ほかの権限は不要です。
- サービスドメインは、microCMS の管理画面の URL（`https://xxx.microcms.io`）の `xxx` です。

### 4. GitHub に登録する

1. リポジトリの **Settings → Secrets and variables → Actions** を開く。
2. **New repository secret** で、上の表の4つをそれぞれ登録する。

`gh` CLI を使う場合は、次のコマンドを実行すると値の入力を求められます（値がシェルの履歴に残りません）。

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set MICROCMS_SERVICE_DOMAIN
gh secret set MICROCMS_API_KEY
```

## 注意

- Cloudflare のトークンの値をリポジトリ、ワークフロー、`.env` に書かないでください。ワークフローは Secret を参照するだけです。
- microCMS の2つの値は、手元では Git の管理外の `.env` に書きます。リポジトリとワークフローには書かないでください。
- トークンを作り直したときは、GitHub の Secret を上書きし、古いトークンを Cloudflare 側で削除してください。
