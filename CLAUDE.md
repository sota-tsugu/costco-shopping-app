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

**STEP0・STEP1(フェーズ1-a)・フェーズ1-b、完了。フェーズ2(パートナーとのリアルタイム共有)に着手中。**

フェーズ2は企画書のv2時点では想定していなかった追加要望(SOTAさんがパートナーと共有して使いたいとのこと)。データの持ち方が「各端末のローカルのみ」から「Firebase(クラウド)経由でリアルタイム共有」に変わる、これまでで最大のアーキテクチャ変更。詳細は下の「フェーズ2」節を参照。

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
- 事前買い物予定リスト(`BudgetSetupScreen.tsx`で自由入力してメモ→`ShoppingScreen.tsx`でタップした際、商品名が完全一致すれば自動で定番棚と紐付けてカートに追加。一致しなければ`WishlistMatchModal.tsx`で「既存商品から選ぶ/新規登録する」を選択。schema_version 4でwishlistテーブル追加)。**ProductAlias(一度選んだ紐付けを記憶する仕組み)は未実装**のため、同じ仮名称でも毎回選び直しが必要な点は既知の制限
- 「今回買う予定」チェックリスト(`BudgetSetupScreen.tsx`)。SOTAさんは毎回ほぼ同じものを買う使い方のため、自由入力メモだけでは量が多くなりすぎるという指摘を受けて追加。**マイ定番棚の全商品を最初から買う予定としてチェック済みで表示し、不要なものだけ外す方式**を採用(「前回の買い物を複製する」方式も検討したが、たまたま前回買わなかった定番品が以降も出てこなくなる弱点があるため見送った)。チェックしたまま「買い物を始める」を押すと、対象商品がそのままカートに追加された状態でトリップが始まる。事前リスト(自由入力メモ)は定番棚にないイレギュラーな商品向けとして併存させている
  - リストが長くなる想定への対応として、複数列レイアウトは不採用(SOTAさんの意向)にし、代わりに「①購入回数が多い順に並び替え、②検索で絞り込み、③全部チェック/全部外すの一括操作、④初期状態は折りたたみ表示(◯点中◯点選択中の要約のみ)」の組み合わせで対応
  - 各商品に「前回購入価格」を表示(`cartStore.ts`の`purchaseSummaryByProduct`で商品ごとの直近価格・購入回数をinit()時と会計完了後にまとめて集計)。現在価格との比較ロジックは`src/utils/priceCompare.ts`、バッジ表示は`src/components/PriceDiffBadge.tsx`に共通化し、`ProductHistoryModal.tsx`と両方から利用

- 商品名の入力候補データベース(`src/data/productCatalog.ts`。costcotuu.comのカテゴリ別商品レビュー記事一覧、約3200件をSOTAさんが提供し、`src/db/worker.ts`のschema_version 5マイグレーションでis_favorite=0の商品として一括投入)。「マイ定番棚」(実際に買う商品)とは別物で、商品追加フォーム・事前リストの入力補助にのみ使う。`AddProductForm.tsx`で商品名を2文字以上入力すると候補が出て、選ぶとその商品を定番棚に「昇格」させる(is_favorite=1に更新)ことで重複登録を防ぐ設計。`cartStore.ts`の`searchProductCatalog`で検索

- 予算設定画面(BudgetSetupScreen)のトップ要素を変更。当初は予算入力欄が主役だったが、「コストコ現地で確認できる、カート内購入予定の合計金額や中身が主役にある方がよい」というSOTAさんの意見を受けて、ShoppingScreenと同じ「見込み合計金額+予算バー」の上部固定ヘッダーに変更(予算はその中の小さな入力欄に格下げ)。あわせて「今回買う予定」リストを商品のカテゴリ別(商品名候補データベース由来。未設定は「その他」)にグループ表示し、買い忘れを防ぎやすくした

- アプリの強制更新ボタン(`src/screens/SettingsModal.tsx` / `src/utils/appUpdate.ts`)。PWAはオフライン対応のためファイルをキャッシュしており、pushした変更がスマホ側にすぐ反映されないことがある(端末ごとに個別にキャッシュされるため)。Service Workerの登録解除+キャッシュ全削除+再読み込みで強制的に最新版を取得し直す。IndexedDB(定番棚・購入履歴などの実データ)は別の仕組みなので、この更新では消えない。両画面(BudgetSetupScreen/ShoppingScreen)のヘッダー右上の歯車アイコンから開ける
- アプリ更新の自動通知バナー(`src/components/UpdateBanner.tsx`)。上記の強制更新ボタンは手動で気づいて押す必要があったため、開いた時+1時間おきに新しいバージョンがないか自動確認し、あればバナーで知らせてワンタップで更新できるようにした。vite-plugin-pwaの`registerType`を`autoUpdate`(勝手に切り替える)から`prompt`(確認してから切り替える)に変更し、`injectRegister: false`にして登録処理を`useRegisterSW`フック側で行うよう統一(二重登録を避けるため)

まだ実装していないもの(フェーズ1-b残り・以降):
- 事前買い物予定リスト機能内のProductAlias(表記ゆれ吸収・一度紐付けた組み合わせの記憶)
- 定番棚商品のカテゴリを後から手動編集する機能(現状、商品名候補データベースから選んだ場合のみカテゴリが付き、自由入力で新規登録した商品は「その他」のまま)
- 複数店舗対応(Store)、シンプル/パワーユーザーモード切り替え

## フェーズ2:パートナーとのリアルタイム共有

SOTAさんから「パートナーと共有して使いたい」との要望があり、着手。それまでの「データは各端末のブラウザ内にのみ保存(sql.js + IndexedDB、サーバー不使用)」という設計では複数端末間の共有ができないため、**sql.jsを廃止し、Firebase(Firestore + 匿名認証)へ全面移行した**。企画書v2では「初期段階でのリアルタイム家族間同期は着手しない」としていた非ゴールだが、実際の要望が出たため前倒しで着手している。

### 認証・共有の仕組み(「家族コード」方式)

- 各自のGoogleアカウントでログインする方式ではなく、**匿名認証(Firebase Authentication)+ 家族コード(合言葉のようなランダムな文字列。例: `K3F9-7QXP-2MRT`)** を家族内で共有する方式を採用(`src/firebase/household.ts`)。SOTAさんが以前使ったFirebaseアプリでも個人アカウントログインはしていなかった、という経緯を踏まえた選定
- 家族コードは端末のlocalStorageに保存する。データはFirestoreの `households/{householdId}/...` 以下に保存され、その家族コードを知っている端末だけが読み書きできる
- **セキュリティ上の割り切り**:Firestoreのセキュリティルール(`firestore.rules`)は「サインイン済み(匿名でも可)」だけを要求しており、「本当にその家族のメンバーか」までは厳密に確認していない。家族コードという文字列を知っているかどうかだけがアクセス制御になっている(合言葉方式)。買い物データ(金額・商品名程度)の重要度を踏まえた割り切り。Cloud Functions(サーバー側処理)を使えばもっと厳密にできるが、無料の Spark プランの制約上、また非エンジニアが保守する前提を踏まえ、あえてシンプルな方式にしている
- 初回起動時、`HouseholdSetupScreen.tsx` で「新しく家族を作る」か「家族コードを入力して参加する」かを選ぶ。新規作成時は、その端末に残っていた以前のsql.jsデータ(定番棚・購入履歴)を一度だけFirestoreに引き継ぐ(`src/firebase/migrateLocalData.ts`)

### データ設計の変更点(SQLからFirestoreへ)

- テーブル(product/shopping_trip/purchase/wishlist)は、Firestoreのコレクション(`products`/`shoppingTrips`/`purchases`/`wishlist`、いずれも `households/{householdId}/` 配下のサブコレクション)にそのまま対応させた
- FirestoreはSQLのようなJOINや集計(SUM/COUNT/GROUP BY)ができないため、以下の工夫をしている
  - purchaseドキュメントに商品名(`productName`)を非正規化(重複)して保存し、JOINなしで表示できるようにした
  - purchaseドキュメントに `tripStatus`('active'/'completed')を持たせ、会計完了時にそのトリップの全purchaseへバッチ更新することで、「完了済みの購入履歴だけ」を1回のクエリで取得できるようにした(SQLでのJOIN + WHERE相当)
  - 商品ごとの購入回数・前回価格などの集計は、該当する購入記録をまとめて取得してからJavaScript側で計算している(件数が家庭利用の範囲では少ない=数千件程度のため、パフォーマンス上問題ない想定)
- カート(進行中の買い物)のpurchaseドキュメントIDは `${tripId}_${productId}` という規則的なIDにしている。これにより「同じ商品を素早く連打しても数量が正しく積み上がるか」という問題を、Firestoreの `increment()` (読み込まずに増減できる仕組み)だけで解決でき、以前のsql.js版にあった「商品ごとの順序保証キュー(`enqueueSync`)」のような自前の仕組みが不要になった
- 商品名の入力候補データベース(`src/data/productCatalog.ts`、約3200件)は、Firestoreには保存していない(各家族がクラウド上に同じ参考データを重複して持つ意味がないため)。今まで通り静的なファイルとして持ち、`cartStore.ts`の`searchProductCatalog`でその場でJavaScript検索している

### オフライン対応

- Firestoreの`persistentLocalCache`(`src/firebase/config.ts`)により、オフラインでもデータの読み書きができ、オンラインに戻ると自動で同期される。これはFirebase SDKの標準機能で、以前のsql.js版で自前で作っていた「IndexedDBへの保存・復元」処理が不要になった

### 移行中の一時的な資産(削除予定)

- `src/db/worker.ts` / `src/db/dbClient.ts` / `src/db/persistence.ts`:以前のsql.js実装。`src/firebase/migrateLocalData.ts`(既存データの一度きりの引き継ぎ)からのみ参照されている。**移行が問題なく完了したことを確認したら、これらのファイルと`migrateLocalData.ts`ごと削除してよい**
- `costco_products_raw.txt`(リポジトリ直下):商品名候補データベース生成時の元データ。生成済みのため参照専用、削除しても支障なし

### Firebaseプロジェクト情報

- プロジェクトID:`costco-shopping-app-39395`
- 無料の Spark プラン(従量課金のBlazeプランへは意図的にアップグレードしていない)
- `src/firebase/config.ts`内の`firebaseConfig`(apiKeyなど)はコード内に直接書いているが、これはFirebase Webアプリでは意図された公開情報であり、通常の「秘匿情報をコードに書かない」ルールの対象外(実際のアクセス制御は`firestore.rules`で行う)
- `firestore.rules`はこのリポジトリで管理しているが、Firebase CLIでのデプロイは行っていない(Claude Coworkの作業環境がネット接続不可のため)。**内容を変更した場合は、SOTAさんにFirebaseコンソール→Firestore Database→「ルール」タブに手動で貼り付けてもらう必要がある**

## 技術構成(2026年時点。フェーズ2でデータ保存方式を変更)

- フロントエンド:React (Vite) + TypeScript
- データ保存:**Firebase Firestore**(クラウド上のデータベース)。`households/{householdId}/...`以下に家族ごとのデータを保存し、パートアートとリアルタイム共有する。オフライン対応はFirestoreの`persistentLocalCache`機能(標準搭載)を利用
- 認証:Firebase Authentication の匿名認証 + 家族コード(合言葉)方式。個人のGoogleアカウントは使わない
- ~~sql.js(ブラウザ内SQLite/WASM)~~:フェーズ2でFirestoreに置き換え、廃止(旧実装は`src/db/`以下に一時的に残っているが移行専用。上の「フェーズ2」節を参照)
- スタイリング:Tailwind CSS
- アイコン:Lucide
- 状態管理:Zustand
- PWA対応:`vite-plugin-pwa`によるService Workerでオフラインキャッシュ
- ホスティング:GitHub Pages(リポジトリ名 `costco-shopping-app` を前提にvite.config.tsの`base`を設定済み。リポジトリ名を変える場合はここも変更が必要)
- バージョン管理:GitHub

企画書v2時点の選定理由(sql.js採用の経緯など)は `costco_app_concept_v2.md` の「4. 技術構成(決定)」を参照。ただしデータ保存方式はフェーズ2で上記の通り変更されているため、実装に着手する際は本ファイルの内容を優先すること。

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

- APIキー・パスワードなどはコードに直接書き込まない(**例外:Firebaseの`firebaseConfig`は公開情報のため直書きしている。詳細は「フェーズ2」節を参照**)
- 将来必要になった場合は`.env`ファイル(`.gitignore`で除外済み)で管理する
- GitHubの個人アクセストークンなど、認証情報はコード・リポジトリ内に一切保存しない
