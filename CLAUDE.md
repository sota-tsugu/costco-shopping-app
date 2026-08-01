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

**STEP0(環境構築)・STEP1(フェーズ1-a)完了。フェーズ1-bに着手中(①内容量ベースの単価自動計算、②過去購入履歴・購入頻度の確認、③過去価格との比較まで完了)。**

STEP0で行ったこと:
- Vite + React + TypeScriptのプロジェクト雛形作成
- Tailwind CSS / Lucide / Zustand の導入
- Web Worker上でsql.js(ブラウザ内SQLite)を動かす土台構築(`src/db/worker.ts`)
- IndexedDBへのDB永続化の土台構築(`src/db/persistence.ts`)
- PWA設定(`vite-plugin-pwa`によるmanifestとService Worker自動生成)
- GitHub Actionsによる、mainブランチへのpushをトリガーとした自動デプロイ(`.github/workflows/deploy.yml`)

STEP1(フェーズ1-a)で行ったこと:
- schema_versionによるマイグレーション機構(`src/db/worker.ts`の`MIGRATIONS`)。STEP0のダミーテーブル(smoke_test)は撤去し、Product/ShoppingTrip/Purchaseの最小構成に置き換えた
- Zustandによるカート状態管理(`src/store/cartStore.ts`)。合計金額はメモリ上で即時計算し、SQLiteへの書き込みは商品ごとに順序を保証したキュー経由で非同期実行(企画書の方針通り)
- 予算設定画面(`src/screens/BudgetSetupScreen.tsx`)。**予算は「買い物1回ごと」に設定する方式**を採用(月間予算などの期間管理はまだ実装していない)
- 買い物画面(`src/screens/ShoppingScreen.tsx`)。合計金額・予算プログレスバーを上部固定表示、マイ定番棚をタップしてカートに追加、下部固定の会計完了ボタン
- 商品追加フォーム(`src/screens/AddProductForm.tsx`)。商品名と価格のみの最小入力(内容量・JANコード等はフェーズ1-bで扱う)
- STEP0の動作確認用ダミー画面は削除し、`src/App.tsx`は本番画面の切り替え(budget-setup / shopping)のみを担う構成に変更

フェーズ1-bで行ったこと:
- 内容量(g/ml等)ベースの単価自動計算(`AddProductForm.tsx`で内容量・単位を任意入力、`cartStore.ts`の`calcUnitPriceLabel`で計算し定番棚タイルに表示)
- 過去購入履歴・購入頻度の確認(`src/screens/ProductHistoryModal.tsx`。定番棚の商品名タップで開き、会計完了済みトリップのPurchase行から購入回数・平均購入間隔・購入履歴一覧を表示。進行中のカートは履歴に含めない)
- 過去価格との比較(同モーダル内。`cartStore.ts`の`updateProductPrice`で現在価格を編集可能にし、直近の購入価格・履歴内の前回価格との差分を値上がり(赤)/値下がり(緑)バッジで表示)。**単純な支払い価格ではなく、内容量あたりの単位単価で比較する**設計(パッケージサイズが変わっても正しく比較できるよう、購入時点の内容量・単位をPurchaseテーブルにスナップショットとして記録。schema_version 3)

まだ実装していないもの(フェーズ1-b残り・以降):
- 事前買い物予定リスト(Wishlist)、ProductAlias(表記ゆれ吸収)
- 事前買い物予定リスト(Wishlist)、ProductAlias(表記ゆれ吸収)
- 複数店舗対応(Store)、家族メンバー対応(FamilyMember)、シンプル/パワーユーザーモード切り替え

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

## STEP1で行った技術的な判断(理由付き)

- **予算は「買い物1回ごと」に設定する方式を採用**:月間予算などの期間管理も検討したが、シンプルさを優先し、企画書のShoppingTrip(買い物単位)の設計にそのまま沿う形にした。SOTAさんとの確認の上での決定
- **カートの実体はPurchaseテーブルの行そのもの**:「カート」と「購入履歴」を別概念として持たず、進行中のShoppingTrip(status='active')に紐づくPurchase行=そのままカートの中身、として扱う設計にした。会計完了時にShoppingTripのstatusを'completed'に変えるだけで、購入履歴側の記録が自動的に確定する
- **商品ごとの保存処理を順序保証キューで実行**(`cartStore.ts`の`enqueueSync`):合計金額はメモリ上で即時計算する方針(企画書4章)のため、SQLiteへの書き込みは画面表示を待たせずに裏側で行う。ただし同じ商品を連続タップした際に保存処理の順番が入れ替わるとデータがずれるため、商品IDごとに「必ず前の保存処理が終わってから次を実行する」キューを設けている

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
