# CLAUDE.md

このファイルは、新しいセッションのClaude Coworkが最初に読んで経緯を把握するためのものです。

## 開発者について(最重要の前提)

- 開発者(SOTAさん)は非エンジニアで、プログラミングの専門知識はほとんどない
- コードは基本的にClaude Coworkが書き、SOTAさんは「一緒に伴走してもらう」立場
- **無料運用が絶対条件**。有料プラン・従量課金が発生する提案はしない。無料枠を超える可能性がある場合は必ず事前に明示する
- 専門用語には簡単な補足を付ける(例:「Web Worker(画面の動きを止めずに裏側で計算処理を行う仕組み)」)
- ライブラリ選定など判断が分かれる場面では、勝手に決めず理由と選択肢を示す
- **判断に迷ったら推測で進めず、必ず質問する**
- 開発端末は自宅のMacBook Pro(特別な指示がなければこれを前提とする)

## このアプリについて

我が家専用のコストコ買い物リストアプリ。詳細な企画コンセプトは [`costco_app_concept_v2.md`](./costco_app_concept_v2.md) を参照。核となる差別化機能は「自動リスト生成」(購入履歴と周期から次回のリストを自動で下書きする)だが、まずは「合計金額+予算+定番棚」だけの最小ループ(フェーズ1-a)を優先する方針。

## 現在のフェーズ

**STEP0(環境構築)完了。次はSTEP1(フェーズ1-a実装)。**

STEP0で行ったこと:
- Vite + React + TypeScriptのプロジェクト雛形作成
- Tailwind CSS / Lucide / Zustand の導入
- Web Worker上でsql.js(ブラウザ内SQLite)を動かす土台構築(`src/db/worker.ts`)
- IndexedDBへのDB永続化の土台構築(`src/db/persistence.ts`)
- PWA設定(`vite-plugin-pwa`によるmanifestとService Worker自動生成)
- GitHub Actionsによる、mainブランチへのpushをトリガーとした自動デプロイ(`.github/workflows/deploy.yml`)
- 動作確認用のダミー画面(`src/App.tsx`。SELECT 1の実行確認、ダミーテーブルへの追加・永続化確認)

まだ実装していないもの(STEP1以降):
- Product / Purchase / ShoppingTripなど本番用テーブル設計
- カート・予算・マイ定番棚などの実際のアプリ機能

## 技術構成(決定済み・変更しない)

- フロントエンド:React (Vite) + TypeScript
- データ保存:sql.js(ブラウザ内SQLite/WASM)を**Web Worker内**で動かす。メインスレッドで直接sql.jsを呼び出さない
- 永続化:sql.jsはメモリ上で動くため、変更のたびにIndexedDBへシリアライズして保存する(`src/db/persistence.ts`)
- スタイリング:Tailwind CSS
- アイコン:Lucide
- 状態管理:Zustand(STEP0時点では未使用。STEP1でカート状態管理に導入予定)
- PWA対応:`vite-plugin-pwa`によるService Workerでオフラインキャッシュ
- ホスティング:GitHub Pages(リポジトリ名 `costco-shopping-app` を前提にvite.config.tsの`base`を設定済み。リポジトリ名を変える場合はここも変更が必要)
- バージョン管理:GitHub

選定理由の詳細は `costco_app_concept_v2.md` の「4. 技術構成(決定)」を参照。

## STEP0で行った技術的な判断(理由付き)

- **Worker⇔メイン画面の通信はComlinkを使わず自前の軽量RPC(`dbClient.ts`)で実装**:依存ライブラリを最小限にし、後から読む人が仕組みを追いやすくするため。将来複雑になったらComlink導入を再検討してよい
- **sql.jsのWASMファイルはViteの`?url`インポートでバンドル**:postinstallスクリプトでのファイルコピーより構成がシンプルで、PWAのキャッシュ対象にも自動的に含まれるため

## 【重要】Claude Coworkの作業環境に関する制約

STEP0の作業中に判明した、今後のセッションでも影響する制約です。

- **Claude Coworkのシェル(bashツール)経由の作業環境は、インターネットに接続できません**(GitHub・npmレジストリなど外部サイトへの接続がすべて遮断される)。これは個人アカウントでは変更できない標準の制限
- そのため、Claude自身が`npm install`を実行したり、`git push`でGitHubに直接コードを送ったりすることはできない
- **回避策**:
  - コードファイルの作成・編集、ローカルでのgitコミット(`git init`/`add`/`commit`)はネットワーク不要なので問題なく行える
  - GitHubへの実際の送信(push)は、**GitHub Desktop(無料アプリ)をSOTAさんが操作して行う**運用にした。Claudeが変更をコミットしたら、SOTAさんにGitHub Desktopで「Push origin」ボタンを押してもらう、という流れになる
  - `npm install`や`npm run build`が実際に動くかどうかの確認は、ローカルではなく**GitHub Actions(GitHubのサーバー上で実行されるためネット接続あり)の実行結果で確認する**。そのため、pushしてからActionsのログを見る、というサイクルで動作確認を行う点に注意
- 今後、上記の制約が解除された(ネットワークが使えるようになった)場合は、この節を更新すること

## リポジトリ・公開設定

- GitHubユーザー名:`sota-tsugu`
- リポジトリ名:`costco-shopping-app`
- 公開URL(予定):`https://sota-tsugu.github.io/costco-shopping-app/`
- リポジトリはPublic(公開)設定(無料でGitHub Pagesを使うための制約。買い物データそのものは各自の端末のIndexedDBにのみ保存され、サーバーには一切送信されないため、データの公開範囲には影響しない)

## セキュリティ・秘匿情報の扱い

- APIキー・パスワードなどはコードに直接書き込まない
- 将来必要になった場合は`.env`ファイル(`.gitignore`で除外済み)で管理する
- GitHubの個人アクセストークンなど、認証情報はコード・リポジトリ内に一切保存しない
