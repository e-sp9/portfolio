# 自動デプロイ

`main` に push（PR のマージを含む）すると、GitHub Actions が Cloudflare Workers へ自動で公開します。
定義は [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) です。

## 動作

1. `bun install --frozen-lockfile`
2. `bun run build`（`dist/` を生成）
3. `bun run deploy`（`wrangler deploy`。手元で実行するのと同じコマンド）

- 手動で実行したいときは、GitHub の **Actions → Deploy → Run workflow** から起動できます。
- 同時に走るデプロイは1本だけです。実行中に次の push が来た場合、実行中のものは最後まで走り、新しいものはその後に実行されます。
- ビルドが失敗した場合はデプロイされません。
- ブログ（`/blog`）は、`bun run build` の中で microCMS の記事から生成します。microCMS のキーは手元の `.env` にだけあり、このワークフローには渡していません。そのため、このワークフローのビルドはブログの生成をスキップし、警告を出します。公開されるサイトに `/blog` は含まれません。

## Secret の登録

リポジトリに次の2つの Secret が必要です。未登録のままだとデプロイのステップが認証エラーで失敗します。

| Secret 名 | 内容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 下記の権限で作成した API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |

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

### 3. GitHub に登録する

1. リポジトリの **Settings → Secrets and variables → Actions** を開く。
2. **New repository secret** で `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` をそれぞれ登録する。

`gh` CLI を使う場合は、次のコマンドを実行すると値の入力を求められます（値がシェルの履歴に残りません）。

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```

## 注意

- トークンの値をリポジトリ、ワークフロー、`.env` に書かないでください。ワークフローは Secret を参照するだけです。
- トークンを作り直したときは、GitHub の Secret を上書きし、古いトークンを Cloudflare 側で削除してください。
