# 自動デプロイ

次のときに、GitHub Actions が Cloudflare Workers へ自動で公開します。
定義は [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) です。

- `main` に push したとき（PR のマージを含む）
- microCMS で記事を公開・更新・公開終了・削除したとき（[microCMS の Webhook](#microcms-の-webhook) の設定が必要）
- GitHub の **Actions → Deploy → Run workflow** から手動で起動したとき

## 動作

1. `bun install --frozen-lockfile`
2. `bun run build`（`dist/` を生成）
3. `bun run deploy`（`wrangler deploy`。手元で実行するのと同じコマンド）

- 同時に走るデプロイは1本だけです。実行中に次のデプロイが起動された場合、実行中のものは最後まで走り、新しいものはその後に実行されます。待っているデプロイがあるうちにさらに次が起動されると、待っていたほうは取り消され、最新の1本だけが残ります。
- 記事は、どの起動でもビルドの時点で microCMS から取得します。microCMS の Webhook から起動したときは、`main` の最新のコミットをビルドします。
- ビルドが失敗した場合はデプロイされません。
- ブログ（`/blog`）は、`bun run build` の中で microCMS の記事から生成します。Secret の `MICROCMS_SERVICE_DOMAIN` と `MICROCMS_API_KEY` は、ビルドのステップにだけ渡しています。
- キーがない場合や、microCMS から記事を取得できない場合は、ビルドが失敗してデプロイしません。本番の `/blog` は前回のデプロイのまま残ります。ブログを省いてビルドを続けることは、手元でも GitHub Actions でもしません。ブログのないサイトをデプロイすると、本番の `/blog` が消えるためです。

## Secret の登録

リポジトリに次の4つの Secret が必要です。Cloudflare の2つが未登録だとデプロイのステップが認証エラーで失敗し、microCMS の2つが未登録だとビルドのステップで失敗します。

| Secret 名 | 内容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 下記の権限で作成した API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |
| `MICROCMS_SERVICE_DOMAIN` | microCMS のサービスドメイン（`xxx.microcms.io` の `xxx`） |
| `MICROCMS_API_KEY` | `blogs` API を GET できる microCMS の API キー |

### 1. Cloudflare の API トークンを作成する

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

### 2. Cloudflare のアカウント ID を確認する

Cloudflare ダッシュボードの **Workers & Pages** の右側に表示される **Account ID** をコピーします。

### 3. GitHub に登録する

1. リポジトリの **Settings → Secrets and variables → Actions** を開く。
2. **New repository secret** で、上の表の4つをそれぞれ登録する。microCMS の2つは、手元の `.env` と同じ値です。

`gh` CLI を使う場合は、次のコマンドを実行すると値の入力を求められます（値がシェルの履歴に残りません）。

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set MICROCMS_SERVICE_DOMAIN
gh secret set MICROCMS_API_KEY
```

## microCMS の Webhook

microCMS で記事を公開・更新・公開終了・削除すると、microCMS が GitHub の API を呼んでこのワークフローを起動します。microCMS の Webhook のうち「GitHub Actions」との連携を使い、GitHub 側では `repository_dispatch` イベントとして受け取ります。

- イベント名は `microcms-content-changed` です。`deploy.yml` で `repository_dispatch` の `types` に書いた文字列と同じにします。
- `repository_dispatch` で起動するのは、`main`（デフォルトブランチ）にある `deploy.yml` だけです。`repository_dispatch` を加えた `deploy.yml` が `main` に入ってから設定してください。

### 1. GitHub のトークンを作成する

microCMS に渡すトークンを、fine-grained personal access token で作ります。対象はこのリポジトリだけに絞ります。

1. GitHub の **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** を開く。
2. **Repository access** で **Only select repositories** を選び、`e-sp9/portfolio` だけを選ぶ。
3. **Permissions** の **Repository permissions** で、**Contents** を **Read and write** にする。**Metadata** の **Read-only** は自動で付く。ほかは **No access** のままにする。
4. **Expiration** に有効期限を設定する。
5. トークンを作成し、表示された値をコピーする（一度しか表示されません）。

- Contents の Read and write は、`repository_dispatch` を送る API（`POST /repos/{owner}/{repo}/dispatches`）に必要な最小の権限です。
- この権限があると、リポジトリへの push もできます。トークンは microCMS の Webhook の設定にだけ置き、ほかの場所に保存しないでください。
- classic のトークンは、自分のすべてのリポジトリに権限が及ぶ `repo` スコープが必要になるので使いません。

### 2. microCMS に Webhook を追加する

項目名は [microCMS のドキュメント](https://document.microcms.io/manual/webhook-setting) に合わせています。画面の表記と違うときは、ドキュメントで確かめてください。

1. microCMS の管理画面で `blogs` API を開き、**API設定 → Webhook** を開く。
2. **追加** から **GitHub Actions** を選ぶ。
3. 次のとおり入力する。

   | 項目 | 値 |
   | --- | --- |
   | GitHubトークン | 手順1で作成したトークン |
   | リポジトリのユーザー名 | `e-sp9` |
   | リポジトリ名 | `portfolio` |
   | トリガーイベント名 | `microcms-content-changed` |

4. 通知タイミングは、次の3つだけにチェックを入れる。

   | 通知タイミング | `/blog` への反映 |
   | --- | --- |
   | コンテンツの公開時・更新時 | 公開した記事、更新した記事を出す（予約公開を含む） |
   | コンテンツの公開終了時 | 公開をやめた記事を外す |
   | 公開中コンテンツの削除時 | 削除した記事を外す |

   下書きの保存や、公開していない記事の削除では、サイトに出る記事が変わらないので、チェックを入れません。
5. 保存する。

### 3. 動作を確かめる

1. microCMS で、公開中の記事を1件更新する。
2. GitHub の **Actions → Deploy** に、`repository_dispatch` で起動した実行が出ることを確かめる。

### 困ったとき

| 症状 | 直し方 |
| --- | --- |
| 記事を更新しても Deploy が起動しない | `main` の `deploy.yml` に `repository_dispatch` があるか、トリガーイベント名が `microcms-content-changed` と一致しているか、トークンの期限が切れていないかを確かめる |
| ビルドのステップが `Missing MICROCMS_...` で失敗する | GitHub に microCMS の Secret が登録されているかを確かめる |
| ビルドのステップが `microCMS answered 401` などで失敗する | Secret のサービスドメインと API キーの値を確かめる。本番の `/blog` は前回のデプロイのまま |
| カテゴリやタグの名前を変えても `/blog` に反映されない | カテゴリやタグを別の API で管理している場合、その変更ではこの Webhook は動かない。**Run workflow** から手動で実行する |

## 注意

- トークンの値をリポジトリ、ワークフロー、`.env` に書かないでください。ワークフローは Secret を参照するだけです。
- Cloudflare のトークンを作り直したときは、GitHub の Secret を上書きし、古いトークンを Cloudflare 側で削除してください。
- microCMS に渡した GitHub のトークンの期限が切れると、記事を更新してもデプロイが起動しなくなります。トークンを作り直して microCMS の Webhook の設定を上書きし、古いトークンを GitHub 側で削除してください。
